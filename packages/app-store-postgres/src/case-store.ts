// case-store — die server-autoritative FALL-Datenschicht (Dossier/Case-Management, ADR-0001). Persistiert die
// SDK-`Case`-Form (`packages/public-sector-sdk/src/domain-kernel.ts`) gegen die (bisher dormante) Tabelle
// `app_cases` und schreibt fachliche, append-only Audit-Ereignisse gegen `app_audit_events`. Bewusst SDK-entkoppelt:
// der Store persistiert Zeilen + erzwingt Optimistic-Locking; der reine `transitionCase`-Reducer (Zustands-Guards,
// Vier-Augen) lebt in der BFF-Service-Schicht, die den Store aufruft.
//
// Laufzeiten mit identischer Semantik (Konvention wie AppStore/KanbanStore): Postgres (OSS-DEFAULT-STANDALONE),
// In-Memory (Tests/DEV), Unavailable (fail-closed ohne DB) und — die Ziel-PROD-Backing „grundsätzlich chos für
// alle Datenspeicherungen" — ChosCaseStore hinter derselben CaseStore-Naht (chos-case-store.ts, gewählt via
// APP_STORE_MODE=chos). Mandanten-scoped überall; `patchCaseState` schreibt Zustandswechsel + Audit ATOMAR
// (Postgres: eine Transaktion; chos: eine entity-lifecycle-Mutation).
import { createPgClient, type PgClient } from "./client.js";
import { ChosCaseStore } from "./chos-case-store.js";
import { createChosClientFromEnv } from "./chos-client.js";
import {
  auditEntryHash,
  auditStreamOrder,
  chainAuditEvent,
} from "./audit-chain.js";

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
  /**
   * EIGENTÜMER des Falls — die Bürger:in, der/dem er gehört. `null` = behörden-initiierter Fall ohne
   * Bürger-Eigentümer (Dossier).
   *
   * NUR AUS DER SESSION STEMPELN (`session.actorId`), NIE aus Query/Body — Präzedenz
   * `app_mailbox_messages.owner_actor_id` (mailbox.ts). Bewusst NICHT `subjectIds`: das ist
   * client-kontrolliert (das BFF übernimmt `body.subjectIds` ungeprüft) und damit als Auth-Material
   * untauglich — Ownership daran zu hängen liesse sich über den Body erschleichen.
   *
   * `null` zählt NIE als „meins": das Store-Prädikat vergleicht auf Gleichheit, und `NULL = $1` ist in
   * SQL nie wahr — fail-closed ohne Sonderfall.
   */
  ownerActorId: string | null;
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
  /** HASH-KETTE (tamper-evidentes Audit, Issue #53) — vom STORE beim Append gestempelt, nicht vom Aufrufer.
   *  `prevHash` = `entryHash` des Vorgängers im Stream (tenantId, caseId) bzw. `null` (Genesis); `entryHash` =
   *  Hash über die kanonischen Bytes dieses Ereignisses inkl. `prevHash` (s. audit-chain.ts). Auf gelesenen
   *  Ereignissen immer gesetzt; beim Schreiben ignoriert der Store eingehende Werte und rechnet selbst. */
  prevHash?: string | null;
  entryHash?: string;
}

/**
 * WESSEN Fälle? — der Sichtbarkeits-Anker, als UNION statt als Flag.
 *
 * Warum ein Union und kein optionales `ownerActorId?` neben `authorityId?`: Der Union macht den
 * gefährlichen Zustand UNAUSSPRECHBAR, statt ihn zu bewachen. Im `owner`-Zweig EXISTIERT `authorityId`
 * nicht (der Bürger gehört keiner Behörde — er dürfte auch nicht danach gefiltert werden), im
 * `authority`-Zweig existiert `actorId` nicht. Ein Aufrufer kann die beiden also nicht versehentlich
 * mischen oder eines weglassen; der Compiler verlangt die Entscheidung.
 *
 * `tenantId` bleibt in BEIDEN Zweigen Pflicht — der Mandanten-Riegel ist nicht verhandelbar.
 *
 * Das ersetzt die bisher an FÜNF Stellen von Hand duplizierte Nachprüfung
 * (`found.authorityId !== session.authorityId → 404`, cases.ts + tasks.ts), die von keinem Gate
 * gedeckt war: Der Scope wandert ins PRÄDIKAT. Ein fremder Fall kommt gar nicht erst zurück
 * (`undefined`) → 404 ist die einzig mögliche Antwort, und es entsteht kein 403-Existenz-Orakel.
 */
export type CaseScope =
  | { scope: "authority"; authorityId: string }
  | { scope: "owner"; actorId: string };

export type ListCasesQuery = {
  tenantId: string;
  state?: string;
  procedureId?: string;
  limit?: number;
} & CaseScope;

export type GetCaseInput = {
  tenantId: string;
  caseId: string;
} & CaseScope;

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

/** Optimistisch gesperrte Änderung der fachlichen NUTZLAST (`data`) — schreibt neue `data`/`version`+1 UND das
 *  Audit-Ereignis ATOMAR in DERSELBEN Transaktion. Anwendungsfall: DSGVO-LÖSCHUNG (Issue #55) — der Aufrufer
 *  (BFF) hat die redigierten/krypto-geshredderten Daten bereits über die reinen Funktionen (`redactData`,
 *  `sealForSubject`) ermittelt; der Store persistiert sie + protokolliert die Löschung append-only, OHNE die
 *  gelöschten Werte zu wiederholen. Der `state` bleibt unangetastet — eine Löschung ist KEIN Zustandswechsel.
 *  Der eingefrorene Bescheid-VA im Audit-Payload bleibt unberührt (Bestandskraft, Art. 17 Abs. 3). */
export interface PatchCaseDataInput {
  tenantId: string;
  caseId: string;
  expectedVersion: number;
  newData: Record<string, unknown>;
  auditEvent: AppAuditEvent;
}

export interface CaseStore {
  insertCase(input: AppCase): Promise<AppCase>;
  getCase(input: GetCaseInput): Promise<AppCase | undefined>;
  listCases(query: ListCasesQuery): Promise<AppCase[]>;
  /** ATOMAR: Zustandswechsel (Optimistic-Locking) + append-only Audit in EINER Transaktion. Wirft
   *  `CaseNotFoundError` / `CaseVersionConflictError`. */
  patchCaseState(input: PatchCaseStateInput): Promise<AppCase>;
  /** ATOMAR: fachliche Nutzlast (`data`) ersetzen (Optimistic-Locking) + append-only Audit in EINER
   *  Transaktion. Für DSGVO-Löschung (Redaction/Krypto-Shredding, Issue #55). Wirft
   *  `CaseNotFoundError` / `CaseVersionConflictError`. */
  patchCaseData(input: PatchCaseDataInput): Promise<AppCase>;
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12::jsonb,$13)
         RETURNING ${CASE_COLS}`,
        caseInsertParams(input),
      );
      return caseFromRow(result.rows[0]!);
    });
  }

  async getCase(input: GetCaseInput): Promise<AppCase | undefined> {
    return this.withClient(async (client) => {
      // Der Scope steckt im PRÄDIKAT, nicht in einer Nachprüfung beim Aufrufer: ein Fall ausserhalb
      // des Scopes kommt gar nicht erst zurück. `owner_actor_id = $3` ist für NULL-Zeilen nie wahr
      // (behörden-initiierte Dossiers sind damit nie „meins") — fail-closed ohne Sonderfall.
      const scopeSql =
        input.scope === "authority"
          ? "authority_id = $3"
          : "owner_actor_id = $3";
      const scopeWert =
        input.scope === "authority" ? input.authorityId : input.actorId;
      const result = await client.query<CaseRow>(
        `SELECT ${CASE_COLS} FROM app_cases
         WHERE tenant_id = $1 AND case_id = $2 AND ${scopeSql}`,
        [input.tenantId, input.caseId, scopeWert],
      );
      return result.rows[0] ? caseFromRow(result.rows[0]) : undefined;
    });
  }

  async listCases(query: ListCasesQuery): Promise<AppCase[]> {
    return this.withClient(async (client) => {
      const result = await client.query<CaseRow>(
        `SELECT ${CASE_COLS} FROM app_cases
         WHERE tenant_id = $1 AND ${
           query.scope === "authority"
             ? "authority_id = $2"
             : "owner_actor_id = $2"
         }
           AND ($3::text IS NULL OR state = $3)
           AND ($4::text IS NULL OR procedure_id = $4)
         ORDER BY opened_at DESC
         LIMIT $5`,
        [
          query.tenantId,
          query.scope === "authority" ? query.authorityId : query.actorId,
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
        await insertChainedAuditEvent(client, input.auditEvent);
        await client.query("COMMIT");
        return caseFromRow(upd.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  async patchCaseData(input: PatchCaseDataInput): Promise<AppCase> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const upd = await client.query<CaseRow>(
          `UPDATE app_cases
             SET data = $1::jsonb, version = version + 1, updated_at = now()
           WHERE tenant_id = $2 AND case_id = $3 AND version = $4
           RETURNING ${CASE_COLS}`,
          [
            JSON.stringify(input.newData),
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
        await insertChainedAuditEvent(client, input.auditEvent);
        await client.query("COMMIT");
        return caseFromRow(upd.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    return this.withClient((client) => insertChainedAuditEvent(client, event));
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
         ORDER BY occurred_at ASC, audit_event_id ASC
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

/**
 * Das Scope-Prädikat des In-Memory-Zweigs — EINE Wahrheit für getCase UND listCases, damit die beiden
 * nicht auseinanderlaufen können (im Postgres-Zweig erzwingt das die gemeinsame WHERE-Klausel).
 *
 * `ownerActorId === null` ist NIE „meins": das entspricht `NULL = $1` in SQL, das ebenfalls nie wahr
 * ist. Diese Zeile IST die Postgres-Parität — sie darf nicht zu `?? ""`-Vergleichen o. Ä. aufweichen.
 */
export function imScope(c: AppCase, scope: CaseScope): boolean {
  return scope.scope === "authority"
    ? c.authorityId === scope.authorityId
    : c.ownerActorId !== null && c.ownerActorId === scope.actorId;
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

  async getCase(input: GetCaseInput): Promise<AppCase | undefined> {
    const found = this.cases.get(this.key(input.tenantId, input.caseId));
    if (!found || !imScope(found, input)) return undefined;
    return {
      ...found,
      subjectIds: [...found.subjectIds],
      data: cloneData(found.data),
    };
  }

  async listCases(query: ListCasesQuery): Promise<AppCase[]> {
    return [...this.cases.values()]
      .filter(
        (c) =>
          c.tenantId === query.tenantId &&
          imScope(c, query) &&
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
    const chained = this.chainAudit(input.auditEvent);
    this.audit.push({ ...chained, payload: { ...chained.payload } });
    return {
      ...next,
      subjectIds: [...next.subjectIds],
      data: cloneData(next.data),
    };
  }

  async patchCaseData(input: PatchCaseDataInput): Promise<AppCase> {
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
      // `state` bleibt unangetastet — eine Löschung ist kein Zustandswechsel.
      data: cloneData(input.newData),
      version: found.version + 1,
    };
    this.cases.set(this.key(input.tenantId, input.caseId), next);
    const chained = this.chainAudit(input.auditEvent);
    this.audit.push({ ...chained, payload: { ...chained.payload } });
    return {
      ...next,
      subjectIds: [...next.subjectIds],
      data: cloneData(next.data),
    };
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    const chained = this.chainAudit(event);
    this.audit.push({ ...chained, payload: { ...chained.payload } });
    return { ...chained, payload: { ...chained.payload } };
  }

  /** Stempelt die Hash-Kette (prevHash/entryHash) auf ein neues Ereignis — prevHash = Vorgänger im Stream
   *  (tenantId, caseId). Der Store rechnet selbst; eingehende Ketten-Felder werden verworfen (Issue #53). */
  private chainAudit(event: AppAuditEvent): AppAuditEvent {
    const stream = this.audit.filter(
      (e) => e.tenantId === event.tenantId && e.caseId === event.caseId,
    );
    return chainAuditEvent(event, stream);
  }

  async listAuditEvents(query: {
    tenantId: string;
    caseId: string;
    limit?: number;
  }): Promise<AppAuditEvent[]> {
    return this.audit
      .filter((e) => e.tenantId === query.tenantId && e.caseId === query.caseId)
      .sort(auditStreamOrder)
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
  async patchCaseData(): Promise<AppCase> {
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
  // chos-Graph-Store (Ziel-PROD-Backing „grundsätzlich chos für alle Datenspeicherungen"): APP_STORE_MODE=chos
  // + CHOS_API_URL. Fehlt die URL → fail-closed, kein stiller Fallback. Postgres bleibt der OSS-Default.
  if (env["APP_STORE_MODE"] === "chos") {
    const client = createChosClientFromEnv(env);
    return client
      ? new ChosCaseStore(client)
      : new UnavailableCaseStore(
          "CHOS_API_URL is required for APP_STORE_MODE=chos",
        );
  }
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
  procedure_version, state, version, subject_ids, opened_at, closed_at, data, owner_actor_id`;
const AUDIT_COLS = `audit_event_id, case_id, tenant_id, authority_id, jurisdiction_id,
  actor_id, event_type, purpose, legal_basis_id, request_id, payload, occurred_at, prev_hash, entry_hash`;
const AUDIT_INSERT_SQL = `INSERT INTO app_audit_events (${AUDIT_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`;

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
    c.ownerActorId,
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
    e.prevHash ?? null,
    e.entryHash ?? null,
  ];
}

/** Fügt ein Audit-Ereignis MIT Hash-Kette ein (Issue #53): liest den letzten `entry_hash` des Streams
 *  (tenantId, caseId) IM SELBEN Client/TX, rechnet `entryHash` und schreibt. `IS NOT DISTINCT FROM` behandelt
 *  ein NULL-`case_id` korrekt. In `patchCaseState` serialisiert der Fall-Versions-CAS konkurrierende Appends
 *  desselben Falls; für Standalone-Appends bleibt ein enges Race-Fenster (dokumentiert, wie InMemory/chos). */
async function insertChainedAuditEvent(
  client: PgClient,
  event: AppAuditEvent,
): Promise<AppAuditEvent> {
  // Die KETTEN-SPITZE: das Ereignis, dessen entry_hash von KEINEM anderen als prev_hash referenziert wird
  // (Ende der verketteten Liste) — reihenfolge-unabhängig wie im reinen chainAuditEvent, damit ein nicht-
  // monotoner occurred_at keinen Fork erzeugt. Leerer Stream → keine Zeile → Genesis (prevHash null).
  const prev = await client.query<{ entry_hash: string | null }>(
    `SELECT a.entry_hash FROM app_audit_events a
       WHERE a.tenant_id = $1 AND a.case_id IS NOT DISTINCT FROM $2
         AND a.entry_hash IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM app_audit_events b
            WHERE b.tenant_id = $1 AND b.case_id IS NOT DISTINCT FROM $2
              AND b.prev_hash = a.entry_hash
         )
       LIMIT 1`,
    [event.tenantId, event.caseId],
  );
  const prevHash = prev.rows[0]?.entry_hash ?? null;
  const chained: AppAuditEvent = {
    ...event,
    prevHash,
    entryHash: auditEntryHash(event, prevHash),
  };
  await client.query(AUDIT_INSERT_SQL, auditInsertParams(chained));
  return chained;
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
  owner_actor_id: string | null;
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
  prev_hash: string | null;
  entry_hash: string | null;
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
    // Alt-Zeilen (vor der owner-Migration) haben hier NULL → kein Eigentümer, nie „meins".
    ownerActorId: row.owner_actor_id ?? null,
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
    prevHash: row.prev_hash ?? null,
    ...(row.entry_hash !== null ? { entryHash: row.entry_hash } : {}),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
