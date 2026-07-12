// case-store — die SERVER-AUTORITATIVE Fall-/Audit-Datenschicht (PM-Upgrade, Phase 3).
//
// Trägt die fachlichen Vorgänge (`app_cases`) + die revisionssichere, APPEND-ONLY Audit-Historie
// (`app_audit_events`). Die EINE sicherheitskritische Operation ist `transitionCase`: Versionsprüfung
// (Optimistic Locking) + Statuswechsel + Audit-Append laufen ATOMAR in EINER Transaktion — kein Zustandswechsel
// ohne lückenloses Audit. Zwei Laufzeiten mit identischer Semantik: `InMemoryCaseStore` (Tests/DEV) und
// `PostgresCaseStore` (PROD). Append-only ist HIER strukturell (kein update/delete auf Audit) und in der Migration
// zusätzlich DB-seitig erzwungen (REVOKE + Trigger).
import { createPooledPgClient } from "./client.js";
import type {
  AppAutomationEvent,
  AutomationStore,
} from "./automation-store.js";
import {
  insertAutomationEventTx,
  notifyAutomationWake,
} from "./automation-store.js";

export interface AppCase {
  caseId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string;
  procedureVersion: string;
  state: string;
  version: number;
  subjectIds: string[];
  openedAt: string;
  closedAt: string | null;
}

export interface AppAuditEvent {
  auditEventId: string;
  caseId: string | null;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  actorId: string;
  eventType: string;
  purpose: string;
  legalBasisId: string;
  requestId: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface ListCasesQuery {
  tenantId: string;
  authorityId: string;
  state?: string;
  procedureId?: string;
  limit?: number;
}

export interface ListAuditQuery {
  tenantId: string;
  caseId?: string;
  limit?: number;
}

export interface TransitionCaseInput {
  tenantId: string;
  caseId: string;
  expectedVersion: number;
  toState: string;
  closedAt?: string | null;
  /** Der Audit-Eintrag, der ATOMAR mit dem Statuswechsel geschrieben wird (kein Wechsel ohne Audit). */
  auditEvent: AppAuditEvent;
  /** OPTIONAL — Outbox-Event, das in DERSELBEN Transaktion wie der Statuswechsel geschrieben wird. */
  outboxEvent?: AppAutomationEvent;
}

/** Optimistic-Locking-Konflikt: der Fall wurde zwischenzeitlich geändert (→ HTTP 409). */
export class CaseVersionConflictError extends Error {
  constructor(
    readonly caseId: string,
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `case ${caseId} version conflict: expected ${expected}, actual ${actual}`,
    );
    this.name = "CaseVersionConflictError";
  }
}

/** Fall nicht gefunden (im angefragten Mandanten-Scope) → HTTP 404. */
export class CaseNotFoundError extends Error {
  constructor(readonly caseId: string) {
    super(`case ${caseId} not found`);
    this.name = "CaseNotFoundError";
  }
}

export interface CaseStore {
  insertCase(input: AppCase): Promise<AppCase>;
  getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<AppCase | undefined>;
  listCases(query: ListCasesQuery): Promise<AppCase[]>;
  appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent>;
  listAuditEvents(query: ListAuditQuery): Promise<AppAuditEvent[]>;
  /** ATOMAR: Versionsprüfung + Statuswechsel + Audit-Append in EINER Transaktion. Wirft
   *  `CaseNotFoundError`/`CaseVersionConflictError`. */
  transitionCase(input: TransitionCaseInput): Promise<AppCase>;
  /** OPTIONAL: leichter Erreichbarkeits-Check für `/readyz` (Postgres: `SELECT 1`; In-Memory: sofort ok). */
  ping?(): Promise<void>;
}

// ── In-Memory (Tests/DEV) — append-only durch Konstruktion (keine update/delete-Methode auf Audit) ──
export class InMemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, AppCase>();
  private readonly audit: AppAuditEvent[] = [];

  /** OPTIONAL geteilter AutomationStore — für die In-TX-Emission (Postgres schreibt in-TX; In-Memory reiht in den
   *  GETEILTEN Store ein, aus dem auch die Engine liest). Ohne ihn ist die Emission ein No-Op. */
  constructor(
    private readonly opts: { automationStore?: AutomationStore } = {},
  ) {}

  private key(tenantId: string, caseId: string): string {
    return `${tenantId}:${caseId}`;
  }

  async insertCase(input: AppCase): Promise<AppCase> {
    const stored: AppCase = { ...input, subjectIds: [...input.subjectIds] };
    this.cases.set(this.key(input.tenantId, input.caseId), stored);
    return { ...stored };
  }

  async getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<AppCase | undefined> {
    const c = this.cases.get(this.key(input.tenantId, input.caseId));
    return c ? { ...c, subjectIds: [...c.subjectIds] } : undefined;
  }

  async listCases(query: ListCasesQuery): Promise<AppCase[]> {
    return [...this.cases.values()]
      .filter(
        (c) =>
          c.tenantId === query.tenantId &&
          c.authorityId === query.authorityId &&
          (query.state === undefined || c.state === query.state) &&
          (query.procedureId === undefined ||
            c.procedureId === query.procedureId),
      )
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, query.limit ?? 100)
      .map((c) => ({ ...c, subjectIds: [...c.subjectIds] }));
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    const stored: AppAuditEvent = { ...event, payload: { ...event.payload } };
    this.audit.push(stored);
    return { ...stored };
  }

  async listAuditEvents(query: ListAuditQuery): Promise<AppAuditEvent[]> {
    return this.audit
      .filter(
        (e) =>
          e.tenantId === query.tenantId &&
          (query.caseId === undefined || e.caseId === query.caseId),
      )
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, query.limit ?? 500)
      .map((e) => ({ ...e, payload: { ...e.payload } }));
  }

  async transitionCase(input: TransitionCaseInput): Promise<AppCase> {
    const k = this.key(input.tenantId, input.caseId);
    const current = this.cases.get(k);
    if (!current) throw new CaseNotFoundError(input.caseId);
    if (current.version !== input.expectedVersion)
      throw new CaseVersionConflictError(
        input.caseId,
        input.expectedVersion,
        current.version,
      );
    const updated: AppCase = {
      ...current,
      state: input.toState,
      version: current.version + 1,
      // undefined = BEHALTEN, explizites null = ZURÜCKSETZEN (Wiederaufnahme aus einem Endzustand). `??` würde null
      // wie „nicht angegeben" behandeln und einen wiedereröffneten, aktiven Fall mit veraltetem closedAt hinterlassen.
      closedAt:
        input.closedAt === undefined ? current.closedAt : input.closedAt,
    };
    // Atomar: erst nach erfolgreicher Zustandsänderung wird das Audit geschrieben (in-memory synchron unteilbar).
    this.cases.set(k, updated);
    this.audit.push({
      ...input.auditEvent,
      payload: { ...input.auditEvent.payload },
    });
    // Bekannte Asymmetrie zu Postgres: die Map-Mutation ist bereits festgeschrieben (nicht rollback-fähig); die
    // Emission folgt danach. Der In-Memory-AutomationStore wirft nie, daher praktisch atomar.
    if (input.outboxEvent)
      await this.opts.automationStore?.enqueueEvent(input.outboxEvent);
    return { ...updated, subjectIds: [...updated.subjectIds] };
  }

  async ping(): Promise<void> {
    // In-Memory ist immer erreichbar.
  }
}

// ── Postgres (PROD) — `transitionCase` als echte DB-Transaktion (BEGIN … COMMIT/ROLLBACK) ───────────
export class PostgresCaseStore implements CaseStore {
  constructor(private readonly databaseUrl: string) {}

  async ping(): Promise<void> {
    await this.withClient((client) => client.query("SELECT 1"));
  }

  async insertCase(input: AppCase): Promise<AppCase> {
    return this.withClient(async (client) => {
      const res = await client.query<CaseRow>(
        `INSERT INTO app_cases (case_id, tenant_id, authority_id, jurisdiction_id,
           procedure_id, procedure_version, state, version, subject_ids, opened_at, closed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
         RETURNING case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
                   procedure_version, state, version, subject_ids, opened_at, closed_at`,
        [
          input.caseId,
          input.tenantId,
          input.authorityId,
          input.jurisdictionId,
          input.procedureId,
          input.procedureVersion,
          input.state,
          input.version,
          JSON.stringify(input.subjectIds),
          input.openedAt,
          input.closedAt,
        ],
      );
      return caseFromRow(res.rows[0]!);
    });
  }

  async getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<AppCase | undefined> {
    return this.withClient(async (client) => {
      const res = await client.query<CaseRow>(
        `SELECT case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
                procedure_version, state, version, subject_ids, opened_at, closed_at
         FROM app_cases WHERE tenant_id = $1 AND case_id = $2`,
        [input.tenantId, input.caseId],
      );
      const row = res.rows[0];
      return row ? caseFromRow(row) : undefined;
    });
  }

  async listCases(query: ListCasesQuery): Promise<AppCase[]> {
    return this.withClient(async (client) => {
      const res = await client.query<CaseRow>(
        `SELECT case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
                procedure_version, state, version, subject_ids, opened_at, closed_at
         FROM app_cases
         WHERE tenant_id = $1 AND authority_id = $2
           AND ($3::text IS NULL OR state = $3)
           AND ($4::text IS NULL OR procedure_id = $4)
         ORDER BY opened_at DESC
         LIMIT $5`,
        [
          query.tenantId,
          query.authorityId,
          query.state ?? null,
          query.procedureId ?? null,
          query.limit ?? 100,
        ],
      );
      return res.rows.map(caseFromRow);
    });
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    return this.withClient(async (client) => {
      await client.query(auditInsertSql(), auditInsertParams(event));
      return { ...event };
    });
  }

  async listAuditEvents(query: ListAuditQuery): Promise<AppAuditEvent[]> {
    return this.withClient(async (client) => {
      const res = await client.query<AuditRow>(
        `SELECT audit_event_id, case_id, tenant_id, authority_id, jurisdiction_id,
                actor_id, event_type, purpose, legal_basis_id, request_id, payload, occurred_at
         FROM app_audit_events
         WHERE tenant_id = $1 AND ($2::text IS NULL OR case_id = $2)
         ORDER BY occurred_at ASC
         LIMIT $3`,
        [query.tenantId, query.caseId ?? null, query.limit ?? 500],
      );
      return res.rows.map(auditFromRow);
    });
  }

  async transitionCase(input: TransitionCaseInput): Promise<AppCase> {
    return this.withClient(async (client) => {
      try {
        await client.query("BEGIN");
        const cur = await client.query<CaseRow>(
          `SELECT case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
                  procedure_version, state, version, subject_ids, opened_at, closed_at
           FROM app_cases WHERE tenant_id = $1 AND case_id = $2 FOR UPDATE`,
          [input.tenantId, input.caseId],
        );
        const row = cur.rows[0];
        if (!row) throw new CaseNotFoundError(input.caseId);
        if (row.version !== input.expectedVersion)
          throw new CaseVersionConflictError(
            input.caseId,
            input.expectedVersion,
            row.version,
          );
        const upd = await client.query<CaseRow>(
          `UPDATE app_cases
           SET state = $3, version = version + 1, closed_at = $4, updated_at = now()
           WHERE tenant_id = $1 AND case_id = $2
           RETURNING case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
                     procedure_version, state, version, subject_ids, opened_at, closed_at`,
          [
            input.tenantId,
            input.caseId,
            input.toState,
            // undefined = BEHALTEN, explizites null = ZURÜCKSETZEN (Wiederaufnahme) — `??` würde null verschlucken.
            input.closedAt === undefined ? row.closed_at : input.closedAt,
          ],
        );
        await client.query(
          auditInsertSql(),
          auditInsertParams(input.auditEvent),
        );
        // ATOMAR: das Outbox-Event teilt die BEGIN..COMMIT — schlägt es fehl, rollt der Statuswechsel mit zurück.
        if (input.outboxEvent)
          await insertAutomationEventTx(client, input.outboxEvent);
        await client.query("COMMIT");
        // Frühes Wecken (#17) NACH dem Commit — best-effort, ausserhalb der Domain-TX: das Event ist durabel, ein
        // NOTIFY-Fehler kann den Statuswechsel nicht mehr zurückrollen; der Poll bleibt das Sicherheitsnetz.
        if (input.outboxEvent)
          await notifyAutomationWake(client).catch(() => {});
        return caseFromRow(upd.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    });
  }

  private async withClient<T>(
    callback: (client: import("./client.js").PgClient) => Promise<T>,
  ): Promise<T> {
    // Gepoolte Verbindung: eine geliehene Verbindung je `withClient`-Block — `BEGIN … COMMIT` bleibt auf ihr.
    const client = await createPooledPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }
}

export function createCaseStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CaseStore | undefined {
  const url = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return url ? new PostgresCaseStore(url) : undefined;
}

// ── Row-Mapping ─────────────────────────────────────────────────────────────────────────────────
interface CaseRow extends Record<string, unknown> {
  case_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  procedure_id: string;
  procedure_version: string;
  state: string;
  version: number;
  subject_ids: unknown;
  opened_at: Date | string;
  closed_at: Date | string | null;
}

interface AuditRow extends Record<string, unknown> {
  audit_event_id: string;
  case_id: string | null;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  actor_id: string;
  event_type: string;
  purpose: string;
  legal_basis_id: string;
  request_id: string;
  payload: unknown;
  occurred_at: Date | string;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function caseFromRow(row: CaseRow): AppCase {
  return {
    caseId: row.case_id,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    procedureId: row.procedure_id,
    procedureVersion: row.procedure_version,
    state: row.state,
    version: Number(row.version),
    subjectIds: Array.isArray(row.subject_ids)
      ? (row.subject_ids as string[])
      : [],
    openedAt: iso(row.opened_at)!,
    closedAt: iso(row.closed_at),
  };
}

function auditFromRow(row: AuditRow): AppAuditEvent {
  return {
    auditEventId: row.audit_event_id,
    caseId: row.case_id,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    purpose: row.purpose,
    legalBasisId: row.legal_basis_id,
    requestId: row.request_id,
    payload:
      row.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : {},
    occurredAt: iso(row.occurred_at)!,
  };
}

function auditInsertSql(): string {
  return `INSERT INTO app_audit_events (audit_event_id, case_id, tenant_id, authority_id,
            jurisdiction_id, actor_id, event_type, purpose, legal_basis_id, request_id, payload, occurred_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`;
}

function auditInsertParams(event: AppAuditEvent): readonly unknown[] {
  return [
    event.auditEventId,
    event.caseId,
    event.tenantId,
    event.authorityId,
    event.jurisdictionId,
    event.actorId,
    event.eventType,
    event.purpose,
    event.legalBasisId,
    event.requestId,
    JSON.stringify(event.payload),
    event.occurredAt,
  ];
}
