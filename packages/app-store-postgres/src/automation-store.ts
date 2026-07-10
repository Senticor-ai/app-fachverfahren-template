// automation-store — die Persistenz der Automations-Engine (Phase 5): deklarative Regeln (`app_automation_rules`),
// die transaktionale Outbox (`app_automation_events`) und die idempotenten Läufe (`app_automation_runs`).
//
// Trennung wie bei case-/task-store: node-safe (kein React, kein Kit), zwei Laufzeiten mit identischer Semantik
// (In-Memory für Tests/DEV, Postgres für PROD), überall mandanten-scoped. Die REGELN sind DATEN (condition/actions
// als jsonb, gespiegelt zu `AutomationRule` im Kit). Die AUSFÜHRUNG ist server-autoritativ und lebt NICHT hier,
// sondern in der Engine (Server) — dieser Store liefert nur die Bausteine: Regeln lesen, Events einreihen, fällige
// Events atomar CLAIMEN (Postgres: `FOR UPDATE SKIP LOCKED`) und jeden Lauf IDEMPOTENT protokollieren
// (`ON CONFLICT (rule_id, idempotency_key) DO NOTHING`).
import { createPooledPgClient } from "./client.js";

export interface AppAutomationRule {
  ruleId: string;
  tenantId: string;
  authorityId: string;
  procedureId: string;
  /** Trigger-Schlüssel (z. B. "beim-eingang", "beim-uebergang", "frist-erreicht"). */
  triggerEvent: string;
  condition: Record<string, unknown> | null;
  actions: Record<string, unknown>[];
  requiresFourEyes: boolean;
  active: boolean;
  createdAt: string;
}

export interface AppAutomationEvent {
  eventId: string;
  tenantId: string;
  authorityId: string;
  procedureId: string;
  caseId: string | null;
  taskId: string | null;
  triggerEvent: string;
  payload: Record<string, unknown>;
  createdAt: string;
  processedAt: string | null;
  /** Frühester Verarbeitungszeitpunkt (ISO). Fehlt/`null` = sofort fällig (Standard, alle Sofort-Trigger).
   *  Zeitgetriebene Trigger (z. B. `frist-erreicht`) setzen die Fälligkeit auf den Fristzeitpunkt;
   *  `claimDueEvents` claimt ein geplantes Event erst ab dann. */
  scheduledFor?: string | null;
}

export type AutomationRunStatus = "applied" | "blocked" | "skipped" | "failed";

export interface AppAutomationRun {
  runId: string;
  ruleId: string;
  eventId: string | null;
  idempotencyKey: string;
  status: AutomationRunStatus;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ListRulesQuery {
  tenantId: string;
  authorityId?: string;
  procedureId?: string;
  triggerEvent?: string;
  activeOnly?: boolean;
}

export interface AutomationStore {
  insertRule(rule: AppAutomationRule): Promise<AppAutomationRule>;
  getRule(input: {
    tenantId: string;
    ruleId: string;
  }): Promise<AppAutomationRule | undefined>;
  listRules(query: ListRulesQuery): Promise<AppAutomationRule[]>;
  /** Nur der `active`-Schalter ist änderbar (Regel-Inhalt ist auditierbarer Vertrag → neue Regel statt Edit). */
  setRuleActive(input: {
    tenantId: string;
    ruleId: string;
    active: boolean;
  }): Promise<AppAutomationRule>;

  /** Reiht ein Outbox-Event ein (wird vom Aufrufer in DERSELBEN Domain-TX geschrieben — hier die Standalone-Variante). */
  enqueueEvent(event: AppAutomationEvent): Promise<AppAutomationEvent>;
  /** CLAIMT bis zu `limit` fällige Events ATOMAR (Postgres: `FOR UPDATE SKIP LOCKED` + `processed_at = now()`),
   *  sodass parallele Poller dasselbe Event NICHT doppelt greifen. Ein Event gilt danach als verarbeitet — ein
   *  dauerhaft scheiterndes Event wird NICHT endlos re-claimt (kein Event-Sturm), sein Fehlversuch steht als
   *  `failed`-Lauf im Protokoll. */
  claimDueEvents(input: {
    now: string;
    limit: number;
  }): Promise<AppAutomationEvent[]>;

  /** Distinkte (tenant, authority, procedure)-Skopes mit einer AKTIVEN Regel für `triggerEvent`. Der zeitgetriebene
   *  Deadline-Scanner iteriert NUR diese Skopes — kein Event-Rauschen für Verfahren ohne Fristregel, mandanten-korrekt
   *  ohne globalen Mandanten-Scan. */
  listActiveRuleScopes(
    triggerEvent: string,
  ): Promise<{ tenantId: string; authorityId: string; procedureId: string }[]>;

  /** Protokolliert einen Lauf IDEMPOTENT. `recorded=false` ⇒ (rule_id, idempotency_key) existierte schon
   *  (Doppel-Event/Schleife abgefangen). */
  recordRun(run: AppAutomationRun): Promise<{ recorded: boolean }>;
  listRuns(query: {
    ruleId?: string;
    limit?: number;
  }): Promise<AppAutomationRun[]>;
}

// ── In-Memory ─────────────────────────────────────────────────────────────────────────────────────
export class InMemoryAutomationStore implements AutomationStore {
  private readonly rules = new Map<string, AppAutomationRule>();
  private readonly events = new Map<string, AppAutomationEvent>();
  private readonly runs: AppAutomationRun[] = [];
  /** Idempotenz-Riegel: gesehene (rule_id, idempotency_key). */
  private readonly seenRuns = new Set<string>();

  private k(tenantId: string, id: string) {
    return `${tenantId}:${id}`;
  }

  async insertRule(rule: AppAutomationRule): Promise<AppAutomationRule> {
    this.rules.set(this.k(rule.tenantId, rule.ruleId), cloneRule(rule));
    return cloneRule(rule);
  }

  async getRule(input: { tenantId: string; ruleId: string }) {
    const r = this.rules.get(this.k(input.tenantId, input.ruleId));
    return r ? cloneRule(r) : undefined;
  }

  async listRules(query: ListRulesQuery): Promise<AppAutomationRule[]> {
    return [...this.rules.values()]
      .filter(
        (r) =>
          r.tenantId === query.tenantId &&
          (query.authorityId === undefined ||
            r.authorityId === query.authorityId) &&
          (query.procedureId === undefined ||
            r.procedureId === query.procedureId) &&
          (query.triggerEvent === undefined ||
            r.triggerEvent === query.triggerEvent) &&
          (query.activeOnly !== true || r.active),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map(cloneRule);
  }

  async setRuleActive(input: {
    tenantId: string;
    ruleId: string;
    active: boolean;
  }): Promise<AppAutomationRule> {
    const key = this.k(input.tenantId, input.ruleId);
    const cur = this.rules.get(key);
    if (!cur) throw new AutomationRuleNotFoundError(input.ruleId);
    const upd = { ...cur, active: input.active };
    this.rules.set(key, upd);
    return cloneRule(upd);
  }

  async enqueueEvent(event: AppAutomationEvent): Promise<AppAutomationEvent> {
    // IDEMPOTENT auf der event_id (wie Postgres `ON CONFLICT DO NOTHING`): der Deadline-Scanner emittiert bei jedem
    // Tick DIESELBE deterministische Id für eine noch fällige Frist — ein Überschreiben würde `processedAt`
    // zurücksetzen und die Frist erneut feuern. Bestehendes Event bleibt daher unverändert.
    const vorhanden = this.events.get(event.eventId);
    if (vorhanden) return { ...vorhanden, payload: { ...vorhanden.payload } };
    this.events.set(event.eventId, {
      ...event,
      // Normalisieren, damit `claimDueEvents` verlässlich gegen null vergleicht (nicht gegen undefined).
      scheduledFor: event.scheduledFor ?? null,
      payload: { ...event.payload },
    });
    return { ...event };
  }

  async claimDueEvents(input: {
    now: string;
    limit: number;
  }): Promise<AppAutomationEvent[]> {
    const due = [...this.events.values()]
      .filter(
        (e) =>
          e.processedAt === null &&
          // Zeit-Gating: geplante Events erst ab ihrem Fälligkeitszeitpunkt claimen (fehlend/null = sofort).
          (e.scheduledFor === null ||
            e.scheduledFor === undefined ||
            e.scheduledFor <= input.now),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, input.limit);
    for (const e of due) {
      this.events.set(e.eventId, { ...e, processedAt: input.now });
    }
    return due.map((e) => ({ ...e, payload: { ...e.payload } }));
  }

  async listActiveRuleScopes(
    triggerEvent: string,
  ): Promise<{ tenantId: string; authorityId: string; procedureId: string }[]> {
    const seen = new Set<string>();
    const out: {
      tenantId: string;
      authorityId: string;
      procedureId: string;
    }[] = [];
    for (const r of this.rules.values()) {
      if (!r.active || r.triggerEvent !== triggerEvent) continue;
      const k = `${r.tenantId}::${r.authorityId}::${r.procedureId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        tenantId: r.tenantId,
        authorityId: r.authorityId,
        procedureId: r.procedureId,
      });
    }
    return out;
  }

  async recordRun(run: AppAutomationRun): Promise<{ recorded: boolean }> {
    const idem = `${run.ruleId}::${run.idempotencyKey}`;
    if (this.seenRuns.has(idem)) return { recorded: false };
    this.seenRuns.add(idem);
    this.runs.push({ ...run, detail: { ...run.detail } });
    return { recorded: true };
  }

  async listRuns(query: {
    ruleId?: string;
    limit?: number;
  }): Promise<AppAutomationRun[]> {
    return this.runs
      .filter((r) => query.ruleId === undefined || r.ruleId === query.ruleId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, query.limit ?? 200)
      .map((r) => ({ ...r, detail: { ...r.detail } }));
  }
}

// ── Postgres ───────────────────────────────────────────────────────────────────────────────────────
export class PostgresAutomationStore implements AutomationStore {
  constructor(private readonly databaseUrl: string) {}

  async insertRule(rule: AppAutomationRule): Promise<AppAutomationRule> {
    return this.withClient(async (c) => {
      await c.query(RULE_INSERT_SQL, [
        rule.ruleId,
        rule.tenantId,
        rule.authorityId,
        rule.procedureId,
        rule.triggerEvent,
        rule.condition === null ? null : JSON.stringify(rule.condition),
        JSON.stringify(rule.actions),
        rule.requiresFourEyes,
        rule.active,
        rule.createdAt,
      ]);
      return cloneRule(rule);
    });
  }

  async getRule(input: { tenantId: string; ruleId: string }) {
    return this.withClient(async (c) => {
      const r = await c.query<RuleRow>(
        `${RULE_SELECT} WHERE tenant_id = $1 AND rule_id = $2`,
        [input.tenantId, input.ruleId],
      );
      return r.rows[0] ? ruleFromRow(r.rows[0]) : undefined;
    });
  }

  async listRules(query: ListRulesQuery): Promise<AppAutomationRule[]> {
    return this.withClient(async (c) => {
      const r = await c.query<RuleRow>(
        `${RULE_SELECT}
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR authority_id = $2)
           AND ($3::text IS NULL OR procedure_id = $3)
           AND ($4::text IS NULL OR trigger_event = $4)
           AND ($5::boolean IS NOT TRUE OR active = true)
         ORDER BY created_at ASC`,
        [
          query.tenantId,
          query.authorityId ?? null,
          query.procedureId ?? null,
          query.triggerEvent ?? null,
          query.activeOnly ?? null,
        ],
      );
      return r.rows.map(ruleFromRow);
    });
  }

  async setRuleActive(input: {
    tenantId: string;
    ruleId: string;
    active: boolean;
  }): Promise<AppAutomationRule> {
    return this.withClient(async (c) => {
      const r = await c.query<RuleRow>(
        `UPDATE app_automation_rules SET active = $3
         WHERE tenant_id = $1 AND rule_id = $2
         RETURNING ${RULE_COLS}`,
        [input.tenantId, input.ruleId, input.active],
      );
      if (!r.rows[0]) throw new AutomationRuleNotFoundError(input.ruleId);
      return ruleFromRow(r.rows[0]);
    });
  }

  async enqueueEvent(event: AppAutomationEvent): Promise<AppAutomationEvent> {
    return this.withClient(async (c) => {
      await c.query(EVENT_INSERT_SQL, eventInsertParams(event));
      return { ...event };
    });
  }

  async claimDueEvents(input: {
    now: string;
    limit: number;
  }): Promise<AppAutomationEvent[]> {
    return this.withClient(async (c) => {
      try {
        await c.query("BEGIN");
        // FOR UPDATE SKIP LOCKED: parallele Poller greifen disjunkte Events.
        const sel = await c.query<EventRow>(
          `${EVENT_SELECT} WHERE processed_at IS NULL
             AND (scheduled_for IS NULL OR scheduled_for <= $2)
           ORDER BY created_at ASC LIMIT $1
           FOR UPDATE SKIP LOCKED`,
          [input.limit, input.now],
        );
        const ids = sel.rows.map((r) => r.event_id);
        if (ids.length > 0) {
          // Atomar als verarbeitet markieren = claim (kein Re-Claim, kein Event-Sturm bei Dauerfehler).
          await c.query(
            `UPDATE app_automation_events SET processed_at = $1 WHERE event_id = ANY($2::text[])`,
            [input.now, ids],
          );
        }
        await c.query("COMMIT");
        return sel.rows.map(eventFromRow);
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
  }

  async listActiveRuleScopes(
    triggerEvent: string,
  ): Promise<{ tenantId: string; authorityId: string; procedureId: string }[]> {
    return this.withClient(async (c) => {
      const r = await c.query<{
        tenant_id: string;
        authority_id: string;
        procedure_id: string;
      }>(
        `SELECT DISTINCT tenant_id, authority_id, procedure_id
         FROM app_automation_rules
         WHERE trigger_event = $1 AND active = true`,
        [triggerEvent],
      );
      return r.rows.map((row) => ({
        tenantId: row.tenant_id,
        authorityId: row.authority_id,
        procedureId: row.procedure_id,
      }));
    });
  }

  async recordRun(run: AppAutomationRun): Promise<{ recorded: boolean }> {
    return this.withClient(async (c) => {
      const r = await c.query(
        `INSERT INTO app_automation_runs
           (run_id, rule_id, event_id, idempotency_key, status, detail, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
         ON CONFLICT (rule_id, idempotency_key) DO NOTHING
         RETURNING run_id`,
        [
          run.runId,
          run.ruleId,
          run.eventId,
          run.idempotencyKey,
          run.status,
          JSON.stringify(run.detail),
          run.createdAt,
        ],
      );
      return { recorded: r.rows.length > 0 };
    });
  }

  async listRuns(query: {
    ruleId?: string;
    limit?: number;
  }): Promise<AppAutomationRun[]> {
    return this.withClient(async (c) => {
      const r = await c.query<RunRow>(
        `${RUN_SELECT}
         WHERE ($1::text IS NULL OR rule_id = $1)
         ORDER BY created_at DESC LIMIT $2`,
        [query.ruleId ?? null, query.limit ?? 200],
      );
      return r.rows.map(runFromRow);
    });
  }

  private async withClient<T>(
    cb: (c: import("./client.js").PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPooledPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await cb(client);
    } finally {
      await client.end();
    }
  }
}

export class AutomationRuleNotFoundError extends Error {
  constructor(readonly ruleId: string) {
    super(`automation rule ${ruleId} not found`);
    this.name = "AutomationRuleNotFoundError";
  }
}

export function createAutomationStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AutomationStore | undefined {
  const url = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return url ? new PostgresAutomationStore(url) : undefined;
}

/** Schreibt ein Outbox-Event auf einer BEREITS OFFENEN Verbindung — für die ATOMARE Emission INNERHALB der
 *  Domain-TX (case-store/task-store rufen dies zwischen dem letzten Domain-Write und COMMIT). Nutzt exakt dieselbe
 *  Spaltenliste/Param-Reihenfolge wie `enqueueEvent` (kein SQL-Drift). */
export async function insertAutomationEventTx(
  client: import("./client.js").PgClient,
  event: AppAutomationEvent,
): Promise<void> {
  // STRIKT (kein ON CONFLICT): eine doppelte event_id in der Domain-TX ist ein echter Fehler → Rollback.
  await client.query(EVENT_INSERT_TX_SQL, eventInsertParams(event));
}

// ── SQL + Row-Mapping ───────────────────────────────────────────────────────────────────────────
function cloneRule(r: AppAutomationRule): AppAutomationRule {
  return {
    ...r,
    condition: r.condition === null ? null : { ...r.condition },
    actions: r.actions.map((a) => ({ ...a })),
  };
}

function jsonObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function isoOrNull(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

const RULE_COLS = `rule_id, tenant_id, authority_id, procedure_id, trigger_event, condition, actions,
  requires_four_eyes, active, created_at`;
const RULE_SELECT = `SELECT ${RULE_COLS} FROM app_automation_rules`;
const RULE_INSERT_SQL = `INSERT INTO app_automation_rules (${RULE_COLS})
  VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`;

interface RuleRow extends Record<string, unknown> {
  rule_id: string;
  tenant_id: string;
  authority_id: string;
  procedure_id: string;
  trigger_event: string;
  condition: unknown;
  actions: unknown;
  requires_four_eyes: boolean;
  active: boolean;
  created_at: Date | string;
}

function ruleFromRow(r: RuleRow): AppAutomationRule {
  return {
    ruleId: r.rule_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    procedureId: r.procedure_id,
    triggerEvent: r.trigger_event,
    condition:
      r.condition && typeof r.condition === "object"
        ? (r.condition as Record<string, unknown>)
        : null,
    actions: Array.isArray(r.actions)
      ? (r.actions as Record<string, unknown>[])
      : [],
    requiresFourEyes: Boolean(r.requires_four_eyes),
    active: Boolean(r.active),
    createdAt: isoOrNull(r.created_at)!,
  };
}

const EVENT_COLS = `event_id, tenant_id, authority_id, procedure_id, case_id, task_id, trigger_event,
  payload, created_at, processed_at, scheduled_for`;
const EVENT_SELECT = `SELECT ${EVENT_COLS} FROM app_automation_events`;
const EVENT_INSERT_VALUES = `INSERT INTO app_automation_events (${EVENT_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`;
// Standalone-`enqueueEvent` (u. a. der Deadline-Scanner): IDEMPOTENT — die deterministische event_id je fälliger Frist
// darf beim erneuten Scan-Tick kein PK-Fehler/Re-Fire sein.
const EVENT_INSERT_SQL = `${EVENT_INSERT_VALUES} ON CONFLICT (event_id) DO NOTHING`;
// In-TX-Outbox-Emission (`insertAutomationEventTx`): STRIKT — die Domain schreibt eine EINDEUTIGE event_id; eine
// doppelte Id ist ein echter Fehler und MUSS die Domain-TX zurückrollen (transaktionale-Outbox-Atomarität). Daher
// KEIN ON CONFLICT — sonst würde ein fehlgeschlagenes Outbox-Insert stillschweigend geschluckt und die Mutation
// trotzdem committen.
const EVENT_INSERT_TX_SQL = EVENT_INSERT_VALUES;

interface EventRow extends Record<string, unknown> {
  event_id: string;
  tenant_id: string;
  authority_id: string;
  procedure_id: string;
  case_id: string | null;
  task_id: string | null;
  trigger_event: string;
  payload: unknown;
  created_at: Date | string;
  processed_at: Date | string | null;
  scheduled_for: Date | string | null;
}

function eventInsertParams(e: AppAutomationEvent): readonly unknown[] {
  return [
    e.eventId,
    e.tenantId,
    e.authorityId,
    e.procedureId,
    e.caseId,
    e.taskId,
    e.triggerEvent,
    JSON.stringify(e.payload),
    e.createdAt,
    e.processedAt,
    e.scheduledFor ?? null,
  ];
}

function eventFromRow(r: EventRow): AppAutomationEvent {
  return {
    eventId: r.event_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    procedureId: r.procedure_id,
    caseId: r.case_id,
    taskId: r.task_id,
    triggerEvent: r.trigger_event,
    payload: jsonObj(r.payload),
    createdAt: isoOrNull(r.created_at)!,
    processedAt: isoOrNull(r.processed_at),
    scheduledFor: isoOrNull(r.scheduled_for),
  };
}

const RUN_COLS = `run_id, rule_id, event_id, idempotency_key, status, detail, created_at`;
const RUN_SELECT = `SELECT ${RUN_COLS} FROM app_automation_runs`;

interface RunRow extends Record<string, unknown> {
  run_id: string;
  rule_id: string;
  event_id: string | null;
  idempotency_key: string;
  status: AutomationRunStatus;
  detail: unknown;
  created_at: Date | string;
}

function runFromRow(r: RunRow): AppAutomationRun {
  return {
    runId: r.run_id,
    ruleId: r.rule_id,
    eventId: r.event_id,
    idempotencyKey: r.idempotency_key,
    status: r.status,
    detail: jsonObj(r.detail),
    createdAt: isoOrNull(r.created_at)!,
  };
}
