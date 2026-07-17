// case-store — die server-autoritative FALL-Datenschicht (Dossier/Case-Management, ADR-0001). Persistiert die
// SDK-`Case`-Form (`packages/public-sector-sdk/src/domain-kernel.ts`) gegen die (bisher dormante) Tabelle
// `app_cases` und schreibt fachliche, append-only Audit-Ereignisse gegen `app_audit_events`. Bewusst SDK-entkoppelt:
// der Store persistiert Zeilen + erzwingt Optimistic-Locking; der reine `transitionCase`-Reducer (Zustands-Guards,
// Vier-Augen) lebt in der BFF-Service-Schicht, die den Store aufruft.
//
// Drei Laufzeiten mit identischer Semantik (Konvention wie AppStore/KanbanStore): Postgres (PROD-STANDALONE),
// In-Memory (Tests/DEV), Unavailable (fail-closed ohne DB). In der Zielarchitektur (ADR-0001) sitzt in PRODUKTION
// chos hinter derselben Capability-Naht; diese Store-Impl ist der dokumentierte OSS-/Ohne-chos-Pfad. Mandanten-
// scoped überall; `patchCaseState` schreibt Zustandswechsel + Audit ATOMAR in EINER Transaktion.
import { createPgClient, type PgClient } from "./client.js";

/** Ein Fall/eine Akte — die Persistenzform der SDK-`Case` (kompatibel; der Store bleibt SDK-entkoppelt). */
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
  /** Frei-formige fachliche NUTZLAST des Falls (Konvention wie app_tasks.data) — z. B. Antragsdaten,
   *  Berechnung und Nachweis-Stand eines Antrags-Verfahrens.
   *
   *  FÜR DEN SERVER OPAK, BEWUSST: er interpretiert `data` NICHT und KANN es nicht — die fachliche Config
   *  (leistung.config.ts) liegt ausserhalb seines rootDir und ist für ihn nicht importierbar. Der Client
   *  rechnet, der Server bewahrt auf, stempelt Identität/Zeit und auditiert. Das deckt sich mit der
   *  Bestandskraft-Anforderung: ein erlassener Verwaltungsakt darf nicht aus der lebenden Config neu
   *  gerendert werden, sondern muss seine Fachlichkeit als selbsttragendes Datum mitführen. */
  data: Record<string, unknown>;
}

/** Fachliches, append-only Audit-Ereignis (Persistenzform; `previousState`/`newState`/`summary` u. Ä. leben in
 *  `payload`). Rechtsgrundlage (`legalBasisId`)/`purpose` sind Pflicht — eine Rechtsgrundlage wird nie gefaked. */
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

/** Optimistisch gesperrter Zustandswechsel: schreibt neuen `state`/`version`+1 (+ optional `closedAt`) UND das
 *  Audit-Ereignis ATOMAR in DERSELBEN Transaktion. `expectedVersion` erzwingt Optimistic-Locking. Der Aufrufer
 *  (BFF) hat den Zielzustand bereits über den reinen `transitionCase`-Reducer (Guards/Vier-Augen) ermittelt. */
export interface PatchCaseStateInput {
  tenantId: string;
  caseId: string;
  expectedVersion: number;
  newState: string;
  closedAt?: string | null;
  auditEvent: AppAuditEvent;
}

export interface CaseStore {
  insertCase(input: AppCase): Promise<AppCase>;
  getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<AppCase | undefined>;
  listCases(query: ListCasesQuery): Promise<AppCase[]>;
  /** ATOMAR: Zustandswechsel (Optimistic-Locking) + append-only Audit in EINER Transaktion. Wirft
   *  `CaseNotFoundError` / `CaseVersionConflictError`. */
  patchCaseState(input: PatchCaseStateInput): Promise<AppCase>;
  appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent>;
  listAuditEvents(query: {
    tenantId: string;
    caseId: string;
    limit?: number;
  }): Promise<AppAuditEvent[]>;
  /** OPTIONAL: leichter Erreichbarkeits-Check für `/readyz`. */
  ping?(): Promise<void>;
}

export class CaseNotFoundError extends Error {
  constructor(readonly caseId: string) {
    super(`case not found: ${caseId}`);
    this.name = "CaseNotFoundError";
  }
}

export class CaseVersionConflictError extends Error {
  constructor(
    readonly caseId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `case version conflict: ${caseId} expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = "CaseVersionConflictError";
  }
}

export class PostgresCaseStore implements CaseStore {
  constructor(private readonly databaseUrl: string) {}

  async insertCase(input: AppCase): Promise<AppCase> {
    return this.withClient(async (client) => {
      const result = await client.query<CaseRow>(
        `INSERT INTO app_cases (${CASE_COLS})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb)
         RETURNING ${CASE_COLS}`,
        caseInsertParams(input),
      );
      return caseFromRow(result.rows[0]!);
    });
  }

  async getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<AppCase | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<CaseRow>(
        `SELECT ${CASE_COLS} FROM app_cases WHERE tenant_id = $1 AND case_id = $2`,
        [input.tenantId, input.caseId],
      );
      return result.rows[0] ? caseFromRow(result.rows[0]) : undefined;
    });
  }

  async listCases(query: ListCasesQuery): Promise<AppCase[]> {
    return this.withClient(async (client) => {
      const result = await client.query<CaseRow>(
        `SELECT ${CASE_COLS} FROM app_cases
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
      return result.rows.map(caseFromRow);
    });
  }

  async patchCaseState(input: PatchCaseStateInput): Promise<AppCase> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const upd = await client.query<CaseRow>(
          `UPDATE app_cases
             SET state = $1, version = version + 1, closed_at = $2, updated_at = now()
           WHERE tenant_id = $3 AND case_id = $4 AND version = $5
           RETURNING ${CASE_COLS}`,
          [
            input.newState,
            input.closedAt ?? null,
            input.tenantId,
            input.caseId,
            input.expectedVersion,
          ],
        );
        if (upd.rows.length === 0) {
          const existing = await client.query<{ version: number }>(
            `SELECT version FROM app_cases WHERE tenant_id = $1 AND case_id = $2`,
            [input.tenantId, input.caseId],
          );
          if (existing.rows.length === 0)
            throw new CaseNotFoundError(input.caseId);
          throw new CaseVersionConflictError(
            input.caseId,
            input.expectedVersion,
            Number(existing.rows[0]!.version),
          );
        }
        await client.query(
          AUDIT_INSERT_SQL,
          auditInsertParams(input.auditEvent),
        );
        await client.query("COMMIT");
        return caseFromRow(upd.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    return this.withClient(async (client) => {
      await client.query(AUDIT_INSERT_SQL, auditInsertParams(event));
      return event;
    });
  }

  async listAuditEvents(query: {
    tenantId: string;
    caseId: string;
    limit?: number;
  }): Promise<AppAuditEvent[]> {
    return this.withClient(async (client) => {
      const result = await client.query<AuditRow>(
        `SELECT ${AUDIT_COLS} FROM app_audit_events
         WHERE tenant_id = $1 AND case_id = $2
         ORDER BY occurred_at ASC
         LIMIT $3`,
        [query.tenantId, query.caseId, query.limit ?? 500],
      );
      return result.rows.map(auditFromRow);
    });
  }

  async ping(): Promise<void> {
    await this.withClient((client) => client.query("SELECT 1"));
  }

  private async withClient<T>(callback: (client: PgClient) => Promise<T>) {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }
}

export class InMemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, AppCase>();
  private readonly audit: AppAuditEvent[] = [];

  private key(tenantId: string, caseId: string) {
    return `${tenantId}:${caseId}`;
  }

  async insertCase(input: AppCase): Promise<AppCase> {
    const stored: AppCase = {
      ...input,
      subjectIds: [...input.subjectIds],
      data: cloneData(input.data),
    };
    this.cases.set(this.key(input.tenantId, input.caseId), stored);
    return {
      ...stored,
      subjectIds: [...stored.subjectIds],
      data: cloneData(stored.data),
    };
  }

  async getCase(input: {
    tenantId: string;
    caseId: string;
  }): Promise<AppCase | undefined> {
    const found = this.cases.get(this.key(input.tenantId, input.caseId));
    return found
      ? {
          ...found,
          subjectIds: [...found.subjectIds],
          data: cloneData(found.data),
        }
      : undefined;
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
      .map((c) => ({
        ...c,
        subjectIds: [...c.subjectIds],
        data: cloneData(c.data),
      }));
  }

  async patchCaseState(input: PatchCaseStateInput): Promise<AppCase> {
    const found = this.cases.get(this.key(input.tenantId, input.caseId));
    if (!found) throw new CaseNotFoundError(input.caseId);
    if (found.version !== input.expectedVersion)
      throw new CaseVersionConflictError(
        input.caseId,
        input.expectedVersion,
        found.version,
      );
    const next: AppCase = {
      ...found,
      state: input.newState,
      version: found.version + 1,
      // Explizites `null` LÖSCHT die Schließzeit (Wiederaufnahme), ein String SETZT sie; nur ein
      // ausgelassenes Feld (undefined) lässt sie unverändert — Parität zum Postgres-Pfad (closed_at = $2).
      closedAt: input.closedAt !== undefined ? input.closedAt : found.closedAt,
    };
    this.cases.set(this.key(input.tenantId, input.caseId), next);
    this.audit.push({
      ...input.auditEvent,
      payload: { ...input.auditEvent.payload },
    });
    return {
      ...next,
      subjectIds: [...next.subjectIds],
      data: cloneData(next.data),
    };
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    this.audit.push({ ...event, payload: { ...event.payload } });
    return { ...event, payload: { ...event.payload } };
  }

  async listAuditEvents(query: {
    tenantId: string;
    caseId: string;
    limit?: number;
  }): Promise<AppAuditEvent[]> {
    return this.audit
      .filter((e) => e.tenantId === query.tenantId && e.caseId === query.caseId)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, query.limit ?? 500)
      .map((e) => ({ ...e, payload: { ...e.payload } }));
  }

  async ping(): Promise<void> {}
}

export class UnavailableCaseStore implements CaseStore {
  constructor(private readonly reason: string) {}
  async insertCase(): Promise<AppCase> {
    throw new Error(this.reason);
  }
  async getCase(): Promise<AppCase | undefined> {
    throw new Error(this.reason);
  }
  async listCases(): Promise<AppCase[]> {
    throw new Error(this.reason);
  }
  async patchCaseState(): Promise<AppCase> {
    throw new Error(this.reason);
  }
  async appendAuditEvent(): Promise<AppAuditEvent> {
    throw new Error(this.reason);
  }
  async listAuditEvents(): Promise<AppAuditEvent[]> {
    throw new Error(this.reason);
  }
  async ping(): Promise<void> {
    throw new Error(this.reason);
  }
}

export function createCaseStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CaseStore {
  // Ephemerer Preview-/Dev-Store (s. createAuthStoreFromEnv): APP_STORE_MODE=memory → prozess-lokaler In-Memory-Store.
  if (env["APP_STORE_MODE"] === "memory") return new InMemoryCaseStore();
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresCaseStore(databaseUrl)
    : new UnavailableCaseStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for case data",
      );
}

/**
 * Kopiert die frei-formige `data`-Nutzlast über einen JSON-Roundtrip — und zwar GENAU SO, nicht als
 * flache Kopie oder structuredClone.
 *
 * WARUM: Der Postgres-Pfad speichert `data` als `jsonb`. Damit durchläuft es ZWANGSLÄUFIG einen
 * JSON-Roundtrip: Der Aufrufer bekommt ein fremdes Objekt (Mutationen am Ergebnis erreichen die DB
 * nie), und Werte werden normalisiert (Date → String, `undefined`-Felder verschwinden, Klassen-
 * Instanzen werden zu Plain Objects). Ein In-Memory-Store, der stattdessen die REFERENZ teilt oder
 * flach kopiert, verhält sich in beidem anders — und genau solche stillen Divergenzen zwischen den
 * Laufzeiten sind hier schon einmal teuer geworden (closedAt-Parität: InMemory behielt einen Wert,
 * den Postgres abräumte; der Fehler fiel erst im Live-Drive auf, nicht in den Unit-Tests).
 * Der JSON-Roundtrip ist deshalb keine „Kopie", sondern die TREUE Nachbildung des Postgres-Verhaltens.
 */
function cloneData(data: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data ?? {})) as Record<string, unknown>;
}

// ── SQL + Row-Mapping ────────────────────────────────────────────────────────────────────────
const CASE_COLS = `case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
  procedure_version, state, version, subject_ids, opened_at, closed_at, data`;
const AUDIT_COLS = `audit_event_id, case_id, tenant_id, authority_id, jurisdiction_id,
  actor_id, event_type, purpose, legal_basis_id, request_id, payload, occurred_at`;
const AUDIT_INSERT_SQL = `INSERT INTO app_audit_events (${AUDIT_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`;

function caseInsertParams(c: AppCase): unknown[] {
  return [
    c.caseId,
    c.tenantId,
    c.authorityId,
    c.jurisdictionId,
    c.procedureId,
    c.procedureVersion,
    c.state,
    c.version,
    JSON.stringify(c.subjectIds),
    c.openedAt,
    c.closedAt,
    JSON.stringify(c.data),
  ];
}

function auditInsertParams(e: AppAuditEvent): unknown[] {
  return [
    e.auditEventId,
    e.caseId,
    e.tenantId,
    e.authorityId,
    e.jurisdictionId,
    e.actorId,
    e.eventType,
    e.purpose,
    e.legalBasisId,
    e.requestId,
    JSON.stringify(e.payload),
    e.occurredAt,
  ];
}

interface CaseRow extends Record<string, unknown> {
  case_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  procedure_id: string;
  procedure_version: string;
  state: string;
  version: number;
  subject_ids: string[];
  opened_at: Date | string;
  closed_at: Date | string | null;
  data: Record<string, unknown>;
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
  payload: Record<string, unknown>;
  occurred_at: Date | string;
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
    subjectIds: Array.isArray(row.subject_ids) ? row.subject_ids : [],
    openedAt: toIsoString(row.opened_at),
    closedAt: row.closed_at === null ? null : toIsoString(row.closed_at),
    // Defensiv gegen Zeilen aus der Zeit VOR der data-Migration (Spalte hat zwar DEFAULT '{}', aber ein
    // getrennt migrierter Read-Replica-/Altbestand darf hier keinen TypeError auslösen).
    data:
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? row.data
        : {},
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
    payload: row.payload && typeof row.payload === "object" ? row.payload : {},
    occurredAt: toIsoString(row.occurred_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
