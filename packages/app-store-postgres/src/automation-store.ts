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
  /** LEASE-Buchhaltung (at-least-once). `attempts` zählt jeden Claim; `lockedUntil` ist der Lease-Ablauf (ISO) —
   *  bis dahin claimt es kein anderer Poller. Ist die Lease abgelaufen und `processedAt` noch NULL (Crash), wird das
   *  Event erneut claimbar. Optional/additiv: bestehende Konstruktoren setzen sie nicht (Default `0`/`null`). */
  attempts?: number;
  lockedUntil?: string | null;
  /** DOMAIN-EVENT-ENVELOPE (#16, additiv/nullbar) — Fundament für getypten Multi-Consumer-Fan-out (#24).
   *  `eventType` ist der stabile DOMÄNEN-Ereignisname (was geschah, z. B. `case.transitioned`) — ABGEGRENZT vom
   *  `triggerEvent` (dem Automations-Regel-Match-Key). `correlationId` traced eine auslösende Anfrage über mehrere
   *  Events; `causationId` verweist auf das unmittelbar verursachende Event (bei Wurzel-Events null — wird in #24 für
   *  Automations-Ketten gesetzt); `occurredAt` ist die DOMÄNEN-Zeit (bei Fristen der Fälligkeitszeitpunkt, nicht die
   *  Scan-Zeit). Bestehende Events lassen die Felder weg → NULL, kein Verhaltensbruch. */
  eventType?: string | null;
  eventVersion?: number | null;
  correlationId?: string | null;
  causationId?: string | null;
  occurredAt?: string | null;
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

// ── Multi-Consumer-Fan-out (#24) ────────────────────────────────────────────────────────────────────
export type DeliveryStatus = "pending" | "done" | "dead";

/** Zustellstand EINES Events an EINEN Consumer (Fan-out-Buchhaltung, getrennt von der Engine-Lease am Event). */
export interface AppEventDelivery {
  eventId: string;
  consumer: string;
  status: DeliveryStatus;
  attempts: number;
  lockedUntil: string | null;
  firstClaimedAt: string;
  deliveredAt: string | null;
  reason: string | null;
}

export interface ClaimForConsumerInput {
  consumer: string;
  now: string;
  limit: number;
  /** #16-Envelope-Filter: nur Events dieser Domänen-Typen an DIESEN Consumer. Fehlend ⇒ ALLE getypten Events. */
  eventTypes?: string[];
  visibilityMs?: number;
}

/** Claim-Ergebnis: das Event PLUS die Zustell-Buchhaltung DIESES Consumers. `attempts` ist die DELIVERY-attempts
 *  (NICHT die Engine-`attempts` am Event) — der Consumer-Driver braucht sie für seinen EIGENEN DLQ-Cap. */
export interface ClaimedDelivery {
  event: AppAutomationEvent;
  attempts: number;
  lockedUntil: string;
}

/** Rückstau-Kennzahlen der Outbox — die Skalierungs-Signale des Event-Workers (#10). `due` = fällige, unverarbeitete
 *  Events (der ehrliche Arbeitsrückstand). `claimable` = davon gerade frei greifbar (Prädikat DECKUNGSGLEICH zu
 *  `claimDueEvents`; momentan geleaste Events zählen NICHT). `scheduled` = unverarbeitet, aber noch nicht fällig
 *  (`scheduled_for` in der Zukunft). Ein Autoscaler skaliert auf `due` (robust, kollabiert nicht auf 0, wenn kurz alles
 *  geleast ist), die anderen sind Diagnose. */
export interface AutomationBacklogStats {
  due: number;
  claimable: number;
  scheduled: number;
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
  /** LEAST bis zu `limit` fällige Events ATOMAR (Postgres: `FOR UPDATE SKIP LOCKED`), sodass parallele Poller
   *  dasselbe Event NICHT doppelt greifen. AT-LEAST-ONCE: der Claim setzt `locked_until = now + visibilityMs` und
   *  zählt `attempts` hoch, markiert aber NICHT `processed_at` — das tut erst `markProcessed` nach erfolgreicher
   *  Behandlung. Läuft die Lease ab (Consumer-Crash vor `markProcessed`), wird das Event erneut claimbar. `visibilityMs`
   *  fehlend ⇒ Default 30 s. */
  claimDueEvents(input: {
    now: string;
    limit: number;
    visibilityMs?: number;
  }): Promise<AppAutomationEvent[]>;

  /** Markiert ein geleastes Event TERMINAL als verarbeitet (`processed_at = now`) — von der Engine NACH der Behandlung
   *  (Erfolg ODER deterministischer Fehler) aufgerufen, damit die Lease nicht abläuft und kein Re-Claim erfolgt. Nur
   *  ein PROZESS-Crash (nie erreichtes `markProcessed`) führt über den Lease-Ablauf zur Wiederaufnahme. Idempotent. */
  markProcessed(input: { eventId: string; now: string }): Promise<void>;

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

  /** FAN-OUT (#24): LEAST bis `limit` GETYPTE Events, die `consumer` noch NICHT terminal zugestellt sind (keine
   *  done/dead-Row), exklusiv je Consumer-Worker (Lease auf der Delivery-Row, attempts+1). Rührt `processed_at` NICHT
   *  an → die Engine bleibt ungestört. `eventTypes` filtert über #16. Lease-Ablauf ⇒ Re-Claim für DIESEN Consumer
   *  (at-least-once je Consumer). `visibilityMs` fehlend ⇒ `LEASE_MS`. Zeit-gegatet auf `scheduled_for`. */
  claimForConsumer(input: ClaimForConsumerInput): Promise<ClaimedDelivery[]>;
  /** Zustellung an `consumer` TERMINAL abschliessen (status='done', delivered_at=now, Lease frei). Idempotent. */
  markDelivered(input: {
    consumer: string;
    eventId: string;
    now: string;
  }): Promise<void>;
  /** DEAD-LETTER je Consumer (#9-Analog, getrennt von der Engine-DLQ): status='dead' + reason. Kein Re-Claim. */
  deadLetterDelivery(input: {
    consumer: string;
    eventId: string;
    now: string;
    reason?: string;
  }): Promise<void>;
  /** Beobachtbarkeit/Tests: Zustellstand je Event (über alle Consumer) und/oder je Consumer. */
  listDeliveries(input: {
    eventId?: string;
    consumer?: string;
    limit?: number;
  }): Promise<AppEventDelivery[]>;

  /** Rückstau der Outbox zum Zeitpunkt `now` (#10) — Skalierungs-/Beobachtungssignal, bewusst MANDANTEN-ÜBERGREIFEND
   *  (wie `claimDueEvents`: der Worker verarbeitet alle Mandanten). `claimable` ist deckungsgleich zum Claim-Prädikat. */
  backlogStats(input: { now: string }): Promise<AutomationBacklogStats>;
}

/** Default-Lease-Fenster (Visibility-Timeout) in ms: so lange gilt ein geclaimtes Event als „in Arbeit", bevor es
 *  (bei ausbleibendem `markProcessed`) erneut claimbar wird. Grosszügig gegenüber der Batch-Verarbeitungszeit
 *  gewählt, damit ein lebender Consumer nicht sich selbst das Event wegzieht. */
export const LEASE_MS = 30_000;

/** Default-Zeilenobergrenze für `listDeliveries` OHNE explizites `limit` — EINE Wahrheit für beide Laufzeiten, damit
 *  InMemory und Postgres nie divergieren (Postgres kann sonst still bei 1000 kappen, während InMemory alles liefert). */
const DELIVERY_LIST_DEFAULT_LIMIT = 1000;

/** Server-seitige Obergrenze (ms) für die `backlogStats`-Zählung (#10). Der Rückstau ist ein Beobachtungs-/Skalierungs-
 *  signal — er darf unter DB-Last NIE eine geteilte Pool-Verbindung (die der Event-Tick braucht) unbegrenzt binden.
 *  Kleiner als die app-seitige Scrape-Frist, damit im Regelfall die DB zuerst abbricht und die Verbindung freigibt. */
const BACKLOG_STATEMENT_TIMEOUT_MS = 3000;

/** ISO-Zeitpunkt + `ms` → ISO. Für den Lease-Ablauf (`locked_until`). */
function addMillis(iso: string, ms: number): string {
  return new Date(new Date(iso).getTime() + ms).toISOString();
}

// ── In-Memory ─────────────────────────────────────────────────────────────────────────────────────
/** Postgres-LISTEN/NOTIFY-Kanal (#17): der Enqueue-Pfad sendet `NOTIFY`, ein separater Worker weckt darauf sofort
 *  (früher als das Poll-Intervall). Fester, gültiger Bezeichner (nicht parametrierbar) — eine Wahrheit für NOTIFY (hier)
 *  und LISTEN (wake-source.ts). Der Poll bleibt IMMER das Sicherheitsnetz (ein verpasstes NOTIFY → nächster Poll). */
export const AUTOMATION_WAKE_CHANNEL = "app_automation_wake";

export class InMemoryAutomationStore implements AutomationStore {
  private readonly rules = new Map<string, AppAutomationRule>();
  private readonly events = new Map<string, AppAutomationEvent>();
  /** OPTIONAL (#17): wird nach dem Einreihen eines NEUEN Events aufgerufen — der In-Prozess-Poller weckt daraufhin
   *  sofort einen Tick (früher als das Poll-Intervall). Best-effort; fehlt der Callback, bleibt es beim Poll. */
  wakeNotify?: () => void;
  private readonly runs: AppAutomationRun[] = [];
  /** Idempotenz-Riegel: gesehene (rule_id, idempotency_key). */
  private readonly seenRuns = new Set<string>();
  /** Fan-out-Zustellungen (#24), Schlüssel `${consumer}::${eventId}`. */
  private readonly deliveries = new Map<string, AppEventDelivery>();

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
      // Lease-Buchhaltung initialisieren (parität zu den DB-Defaults attempts=0 / locked_until=NULL).
      attempts: event.attempts ?? 0,
      lockedUntil: event.lockedUntil ?? null,
      // Envelope normalisieren (#16): fehlend → null, damit InMemory- und PG-Round-Trip identisch sind (null, nicht undefined).
      eventType: event.eventType ?? null,
      eventVersion: event.eventVersion ?? null,
      correlationId: event.correlationId ?? null,
      causationId: event.causationId ?? null,
      occurredAt: event.occurredAt ?? null,
      payload: { ...event.payload },
    });
    // Frühes Wecken (#17): NUR bei einem NEU eingereihten Event (die idempotente Wiederkehr oben weckt nicht).
    this.wakeNotify?.();
    return { ...event };
  }

  async claimDueEvents(input: {
    now: string;
    limit: number;
    visibilityMs?: number;
  }): Promise<AppAutomationEvent[]> {
    const lockedUntil = addMillis(input.now, input.visibilityMs ?? LEASE_MS);
    const due = [...this.events.values()]
      .filter(
        (e) =>
          e.processedAt === null &&
          // AT-LEAST-ONCE: claimbar, wenn nie geleast ODER die Lease abgelaufen ist (Crash → Wiederaufnahme).
          (e.lockedUntil === null ||
            e.lockedUntil === undefined ||
            e.lockedUntil <= input.now) &&
          // Zeit-Gating: geplante Events erst ab ihrem Fälligkeitszeitpunkt claimen (fehlend/null = sofort).
          (e.scheduledFor === null ||
            e.scheduledFor === undefined ||
            e.scheduledFor <= input.now),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, input.limit);
    for (const e of due) {
      // LEASE: locked_until setzen + attempts hochzählen; processed_at bleibt NULL (das setzt erst `markProcessed`).
      this.events.set(e.eventId, {
        ...e,
        lockedUntil,
        attempts: (e.attempts ?? 0) + 1,
      });
    }
    return due.map((e) => ({
      ...e,
      lockedUntil,
      attempts: (e.attempts ?? 0) + 1,
      payload: { ...e.payload },
    }));
  }

  async markProcessed(input: { eventId: string; now: string }): Promise<void> {
    const e = this.events.get(input.eventId);
    // Idempotent: unbekanntes/bereits verarbeitetes Event ⇒ no-op.
    if (!e || e.processedAt !== null) return;
    this.events.set(input.eventId, { ...e, processedAt: input.now });
  }

  async backlogStats(input: { now: string }): Promise<AutomationBacklogStats> {
    let due = 0;
    let claimable = 0;
    let scheduled = 0;
    for (const e of this.events.values()) {
      if (e.processedAt !== null) continue; // erledigt zählt nie zum Rückstau
      const faellig =
        e.scheduledFor === null ||
        e.scheduledFor === undefined ||
        e.scheduledFor <= input.now;
      if (!faellig) {
        scheduled += 1;
        continue;
      }
      due += 1;
      // claimable: EXAKT das Prädikat aus claimDueEvents (Lease-frei ODER abgelaufen).
      if (
        e.lockedUntil === null ||
        e.lockedUntil === undefined ||
        e.lockedUntil <= input.now
      ) {
        claimable += 1;
      }
    }
    return { due, claimable, scheduled };
  }

  // ── Fan-out (#24): rührt `events`/`processedAt` NICHT an — nur die `deliveries`-Map je Consumer. ──
  async claimForConsumer(
    input: ClaimForConsumerInput,
  ): Promise<ClaimedDelivery[]> {
    const lockedUntil = addMillis(input.now, input.visibilityMs ?? LEASE_MS);
    const typeSet = input.eventTypes ? new Set(input.eventTypes) : null;
    const candidates = [...this.events.values()]
      .filter((e) => {
        if (e.eventType == null) return false; // nur GETYPTE Events (#16)
        if (typeSet && !typeSet.has(e.eventType)) return false; // Typ-Filter
        if (e.scheduledFor != null && e.scheduledFor > input.now) return false; // Zeit-Gating
        const d = this.deliveries.get(`${input.consumer}::${e.eventId}`);
        if (!d) return true; // nie an diesen Consumer zugestellt
        return d.status === "pending" && (d.lockedUntil ?? "") <= input.now; // Lease abgelaufen (Crash) → Wiederaufnahme
      })
      // TIE-STABIL (createdAt, eventId) — deckungsgleich zur PG-ORDER BY; createdAt ALLEIN wäre instabil (Deadline-
      // Scanner reiht viele Events mit gleichem createdAt=now ein).
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? -1
          : a.createdAt > b.createdAt
            ? 1
            : a.eventId < b.eventId
              ? -1
              : 1,
      )
      .slice(0, input.limit);

    const out: ClaimedDelivery[] = [];
    for (const e of candidates) {
      const key = `${input.consumer}::${e.eventId}`;
      const prev = this.deliveries.get(key);
      const attempts = (prev?.attempts ?? 0) + 1;
      this.deliveries.set(key, {
        eventId: e.eventId,
        consumer: input.consumer,
        status: "pending",
        attempts,
        lockedUntil,
        firstClaimedAt: prev?.firstClaimedAt ?? input.now,
        deliveredAt: null,
        reason: null,
      });
      out.push({
        event: { ...e, payload: { ...e.payload } },
        attempts,
        lockedUntil,
      });
    }
    return out;
  }

  async markDelivered(input: {
    consumer: string;
    eventId: string;
    now: string;
  }): Promise<void> {
    const key = `${input.consumer}::${input.eventId}`;
    const d = this.deliveries.get(key);
    if (!d || d.status !== "pending") return; // idempotent
    this.deliveries.set(key, {
      ...d,
      status: "done",
      deliveredAt: input.now,
      lockedUntil: null,
    });
  }

  async deadLetterDelivery(input: {
    consumer: string;
    eventId: string;
    now: string;
    reason?: string;
  }): Promise<void> {
    const key = `${input.consumer}::${input.eventId}`;
    const d = this.deliveries.get(key);
    if (!d || d.status !== "pending") return;
    this.deliveries.set(key, {
      ...d,
      status: "dead",
      deliveredAt: input.now,
      lockedUntil: null,
      reason: input.reason ?? null,
    });
  }

  async listDeliveries(input: {
    eventId?: string;
    consumer?: string;
    limit?: number;
  }): Promise<AppEventDelivery[]> {
    let out = [...this.deliveries.values()];
    if (input.eventId !== undefined)
      out = out.filter((d) => d.eventId === input.eventId);
    if (input.consumer !== undefined)
      out = out.filter((d) => d.consumer === input.consumer);
    out.sort((a, b) => (a.firstClaimedAt < b.firstClaimedAt ? -1 : 1));
    return out.slice(0, input.limit ?? DELIVERY_LIST_DEFAULT_LIMIT);
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
      // RETURNING event_id: bei ON-CONFLICT-Wiederkehr (Deadline-Scanner reiht dieselbe Frist erneut ein) liefert die
      // Anweisung 0 Zeilen → dann KEIN NOTIFY (sonst weckte jeder Scan-Tick unnötig). Nur ein NEU eingereihtes Event
      // weckt (#17). NOTIFY best-effort — ein Signalfehler darf das Enqueue NICHT kippen.
      const r = await c.query<{ event_id: string }>(
        `${EVENT_INSERT_SQL} RETURNING event_id`,
        eventInsertParams(event),
      );
      if (r.rows.length > 0)
        await c.query(`NOTIFY ${AUTOMATION_WAKE_CHANNEL}`).catch(() => {});
      return { ...event };
    });
  }

  async claimDueEvents(input: {
    now: string;
    limit: number;
    visibilityMs?: number;
  }): Promise<AppAutomationEvent[]> {
    const lockedUntil = addMillis(input.now, input.visibilityMs ?? LEASE_MS);
    return this.withClient(async (c) => {
      // Kanonischer SKIP-LOCKED-Claim in EINER atomaren Anweisung: die Subquery sperrt die claimbaren Zeilen
      // (unbearbeitet + Lease nie gesetzt/abgelaufen + zeit-fällig), das umschliessende UPDATE LEAST sie
      // (locked_until + attempts+1), RETURNING liefert die POST-Update-Zeilen. `processed_at` bleibt NULL — erst
      // `markProcessed` schliesst das Event terminal ab (at-least-once: abgelaufene Lease ⇒ Wiederaufnahme).
      const r = await c.query<EventRow>(
        `UPDATE app_automation_events
           SET locked_until = $3, attempts = attempts + 1
         WHERE event_id IN (
           SELECT event_id FROM app_automation_events
           WHERE processed_at IS NULL
             AND (locked_until IS NULL OR locked_until <= $2)
             AND (scheduled_for IS NULL OR scheduled_for <= $2)
           ORDER BY created_at ASC
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING ${EVENT_COLS}, attempts, locked_until`,
        [input.limit, input.now, lockedUntil],
      );
      // RETURNING garantiert die Reihenfolge nicht → nach created_at sortieren (Parität zur In-Memory-Ordnung).
      return r.rows
        .map(eventFromRow)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    });
  }

  async markProcessed(input: { eventId: string; now: string }): Promise<void> {
    await this.withClient(async (c) => {
      // Idempotent (WHERE processed_at IS NULL): ein erneuter Aufruf lässt den ersten Zeitstempel unverändert.
      await c.query(
        `UPDATE app_automation_events SET processed_at = $1
         WHERE event_id = $2 AND processed_at IS NULL`,
        [input.now, input.eventId],
      );
    });
  }

  async backlogStats(input: { now: string }): Promise<AutomationBacklogStats> {
    return this.withClient(async (c) => {
      // FRISTGEBUNDEN per `statement_timeout` (SET LOCAL ⇒ nur in DIESER TX, keine Pool-Verschmutzung): eine lahme/
      // gesperrte Zählung bricht server-seitig ab und GIBT DIE VERBINDUNG FREI, statt eine Pool-Verbindung (die der
      // Event-Tick teilt) unbegrenzt zu binden. Der Metrik-Scrape ist zusätzlich app-seitig fristgebunden. EINE
      // Aggregat-Abfrage (count … FILTER); die `due`/`claimable`-Prädikate sind WORTGLEICH zu claimDueEvents. bigint ⇒ Number.
      await c.query("BEGIN");
      try {
        await c.query(
          `SET LOCAL statement_timeout = ${BACKLOG_STATEMENT_TIMEOUT_MS}`,
        );
        const r = await c.query<{
          due: string | number;
          claimable: string | number;
          scheduled: string | number;
        }>(
          `SELECT
             count(*) FILTER (
               WHERE processed_at IS NULL
                 AND (scheduled_for IS NULL OR scheduled_for <= $1)
             ) AS due,
             count(*) FILTER (
               WHERE processed_at IS NULL
                 AND (scheduled_for IS NULL OR scheduled_for <= $1)
                 AND (locked_until IS NULL OR locked_until <= $1)
             ) AS claimable,
             count(*) FILTER (
               WHERE processed_at IS NULL
                 AND scheduled_for IS NOT NULL
                 AND scheduled_for > $1
             ) AS scheduled
           FROM app_automation_events`,
          [input.now],
        );
        await c.query("COMMIT");
        const row = r.rows[0];
        return {
          due: Number(row?.due ?? 0),
          claimable: Number(row?.claimable ?? 0),
          scheduled: Number(row?.scheduled ?? 0),
        };
      } catch (fehler) {
        // Verbindung in sauberen Zustand zurückführen, bevor sie in den Pool zurückgeht (sonst „current transaction
        // is aborted"-Folgefehler auf der nächsten Nutzung derselben Pool-Verbindung).
        await c.query("ROLLBACK").catch(() => {});
        throw fehler;
      }
    });
  }

  // ── Fan-out (#24): LIEST app_automation_events (kein FOR UPDATE), SCHREIBT nur app_event_deliveries → MVCC-isoliert
  //    gegen die Engine (die app_automation_events UPDATEt). `processed_at` wird NIE berührt. ──
  async claimForConsumer(
    input: ClaimForConsumerInput,
  ): Promise<ClaimedDelivery[]> {
    const lockedUntil = addMillis(input.now, input.visibilityMs ?? LEASE_MS);
    const eventTypes = input.eventTypes ?? null;
    return this.withClient(async (c) => {
      // Self-arbitrierend OHNE FOR UPDATE: der Anti-Join findet neue/lease-abgelaufene Events, das UPSERT mit
      // `WHERE locked_until <= now` im DO UPDATE lässt genau EINEN Worker je (event,consumer) gewinnen (der Verlierer
      // re-evaluiert gegen die eben gesetzte Zukunfts-Lease → kein RETURNING → kein Doppel-Claim).
      const r = await c.query<
        EventRow & {
          delivery_attempts: number;
          delivery_locked_until: Date | string;
        }
      >(
        `WITH candidates AS (
           SELECT e.event_id, e.created_at
           FROM app_automation_events e
           LEFT JOIN app_event_deliveries d
             ON d.event_id = e.event_id AND d.consumer = $1
           WHERE e.event_type IS NOT NULL
             AND ($5::text[] IS NULL OR e.event_type = ANY($5))
             AND (e.scheduled_for IS NULL OR e.scheduled_for <= $2)
             AND (
               d.event_id IS NULL
               OR (d.status = 'pending' AND d.locked_until <= $2)
             )
           ORDER BY e.created_at ASC, e.event_id ASC
           LIMIT $3
         ),
         claimed AS (
           INSERT INTO app_event_deliveries AS d
                 (event_id, consumer, status, attempts, locked_until, first_claimed_at)
           SELECT c.event_id, $1, 'pending', 1, $4, $2 FROM candidates c
           ON CONFLICT (event_id, consumer) DO UPDATE
              SET attempts = d.attempts + 1, locked_until = $4
              WHERE d.status = 'pending' AND d.locked_until <= $2
           RETURNING event_id, attempts, locked_until
         )
         SELECT ${EVENT_COLS},
                cl.attempts     AS delivery_attempts,
                cl.locked_until AS delivery_locked_until
         FROM claimed cl
         JOIN app_automation_events e USING (event_id)
         ORDER BY e.created_at ASC, e.event_id ASC`,
        [input.consumer, input.now, input.limit, lockedUntil, eventTypes],
      );
      return r.rows.map((row) => ({
        event: eventFromRow(row),
        attempts: row.delivery_attempts,
        lockedUntil: isoOrNull(row.delivery_locked_until)!,
      }));
    });
  }

  async markDelivered(input: {
    consumer: string;
    eventId: string;
    now: string;
  }): Promise<void> {
    await this.withClient(async (c) => {
      await c.query(
        `UPDATE app_event_deliveries SET status='done', delivered_at=$3, locked_until=NULL
         WHERE event_id=$2 AND consumer=$1 AND status='pending'`,
        [input.consumer, input.eventId, input.now],
      );
    });
  }

  async deadLetterDelivery(input: {
    consumer: string;
    eventId: string;
    now: string;
    reason?: string;
  }): Promise<void> {
    await this.withClient(async (c) => {
      await c.query(
        `UPDATE app_event_deliveries SET status='dead', delivered_at=$3, locked_until=NULL, reason=$4
         WHERE event_id=$2 AND consumer=$1 AND status='pending'`,
        [input.consumer, input.eventId, input.now, input.reason ?? null],
      );
    });
  }

  async listDeliveries(input: {
    eventId?: string;
    consumer?: string;
    limit?: number;
  }): Promise<AppEventDelivery[]> {
    return this.withClient(async (c) => {
      const r = await c.query<DeliveryRow>(
        `SELECT event_id, consumer, status, attempts, locked_until, first_claimed_at, delivered_at, reason
         FROM app_event_deliveries
         WHERE ($1::text IS NULL OR event_id = $1)
           AND ($2::text IS NULL OR consumer = $2)
         ORDER BY first_claimed_at ASC
         LIMIT $3`,
        [
          input.eventId ?? null,
          input.consumer ?? null,
          input.limit ?? DELIVERY_LIST_DEFAULT_LIMIT,
        ],
      );
      return r.rows.map(deliveryFromRow);
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
  // KEIN in-TX-NOTIFY: es würde die Zustellung ins Async-Notify-SLRU an den Domain-COMMIT koppeln — eine volle Queue
  // liesse den COMMIT (und damit den bereits gültigen Statuswechsel) scheitern (Adversarial-Review-Fund). Der Wecker
  // kommt best-effort NACH dem Commit über `notifyAutomationWake` (der Aufrufer), wenn das Event durabel ist.
}

/** Best-effort-Wecker (#17) für den IN-TX-Emissionspfad: der Aufrufer sendet dies NACH dem COMMIT auf derselben
 *  Verbindung (das Event ist dann durabel). Ein NOTIFY-Fehler darf den bereits committeten Domain-Write NICHT mehr
 *  berühren → Aufrufer schluckt ihn (`.catch`); der Poll bleibt das Sicherheitsnetz. */
export async function notifyAutomationWake(
  client: import("./client.js").PgClient,
): Promise<void> {
  await client.query(`NOTIFY ${AUTOMATION_WAKE_CHANNEL}`);
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
  payload, created_at, processed_at, scheduled_for, event_type, event_version, correlation_id,
  causation_id, occurred_at`;
const EVENT_INSERT_VALUES = `INSERT INTO app_automation_events (${EVENT_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)`;
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
  // Envelope (#16) — Teil von EVENT_COLS, daher immer im RETURNING (nullbar).
  event_type: string | null;
  event_version: number | null;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Date | string | null;
  // Nur im claimDueEvents-RETURNING vorhanden (nicht in der schlanken EVENT_COLS-Spaltenliste); daher optional.
  attempts?: number;
  locked_until?: Date | string | null;
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
    e.eventType ?? null, // $12
    e.eventVersion ?? null, // $13
    e.correlationId ?? null, // $14
    e.causationId ?? null, // $15
    e.occurredAt ?? null, // $16
  ];
}

function eventFromRow(r: EventRow): AppAutomationEvent {
  const e: AppAutomationEvent = {
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
    // Envelope (#16) — immer im RETURNING (Teil von EVENT_COLS), nullbar.
    eventType: r.event_type ?? null,
    eventVersion: r.event_version ?? null,
    correlationId: r.correlation_id ?? null,
    causationId: r.causation_id ?? null,
    occurredAt: isoOrNull(r.occurred_at),
  };
  // Lease-Felder nur setzen, wenn die Query sie mitliefert (claimDueEvents-RETURNING) — exactOptional-konform.
  if (typeof r.attempts === "number") e.attempts = r.attempts;
  if (r.locked_until !== undefined) e.lockedUntil = isoOrNull(r.locked_until);
  return e;
}

interface DeliveryRow extends Record<string, unknown> {
  event_id: string;
  consumer: string;
  status: string;
  attempts: number;
  locked_until: Date | string | null;
  first_claimed_at: Date | string;
  delivered_at: Date | string | null;
  reason: string | null;
}

function deliveryFromRow(r: DeliveryRow): AppEventDelivery {
  return {
    eventId: r.event_id,
    consumer: r.consumer,
    status: r.status as DeliveryStatus,
    attempts: r.attempts,
    lockedUntil: isoOrNull(r.locked_until),
    firstClaimedAt: isoOrNull(r.first_claimed_at)!,
    deliveredAt: isoOrNull(r.delivered_at),
    reason: r.reason,
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
