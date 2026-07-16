import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  StoreConflictError,
  StoreUnavailableError,
  type CaseEventRecord,
  type CaseId,
  type CaseListQuery,
  type CaseScope,
  type CaseSnapshotRecord,
  type CaseStore,
  type CaseSummaryRecord,
  type CreateCaseRecord,
  type Page,
  type VersionedCaseRecord,
} from "@senticor/app-store-contracts";
import { createPgClient, type PgClient } from "./client.js";

type IdempotencyRecord = {
  scopeKey: string;
  idempotencyKey: string;
  caseId: CaseId;
  kind: "create" | "commit";
};

function scopeKey(scope: CaseScope): string {
  return `${scope.tenantId}|${scope.authorityId}|${scope.jurisdictionId}`;
}

function matchesScope(record: VersionedCaseRecord, scope: CaseScope): boolean {
  return (
    record.tenantId === scope.tenantId &&
    record.authorityId === scope.authorityId &&
    record.jurisdictionId === scope.jurisdictionId
  );
}

function cloneRecord(record: VersionedCaseRecord): VersionedCaseRecord {
  return structuredClone(record);
}

export class InMemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, VersionedCaseRecord>();
  private readonly events = new Map<string, CaseEventRecord[]>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  private caseKey(scope: CaseScope, caseId: string): string {
    return `${scopeKey(scope)}|${caseId}`;
  }

  private idemKey(scope: CaseScope, key: string): string {
    return `${scopeKey(scope)}|${key}`;
  }

  async list(
    scope: CaseScope,
    query: CaseListQuery,
  ): Promise<Page<CaseSummaryRecord>> {
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    let rows = [...this.cases.values()].filter((c) => matchesScope(c, scope));
    if (query.states?.length) {
      rows = rows.filter((c) => query.states!.includes(c.state));
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((c) =>
        c.payload.vorgangsnummer.toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      const byUpdated = b.updatedAt.localeCompare(a.updatedAt);
      return byUpdated !== 0 ? byUpdated : b.caseId.localeCompare(a.caseId);
    });
    let start = 0;
    if (query.cursor) {
      const idx = rows.findIndex((r) => r.caseId === query.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = rows.slice(start, start + limit);
    const items: CaseSummaryRecord[] = slice.map((c) => ({
      caseId: c.caseId,
      leistungId: c.leistungId,
      state: c.state,
      version: c.version,
      vorgangsnummer: c.payload.vorgangsnummer,
      submittedAt: c.submittedAt,
      updatedAt: c.updatedAt,
    }));
    const last = slice.at(-1);
    const hasMore = start + limit < rows.length;
    return {
      items,
      page: {
        ...(hasMore && last ? { nextCursor: last.caseId } : {}),
        total: rows.length,
      },
    };
  }

  async get(
    scope: CaseScope,
    caseId: CaseId,
  ): Promise<VersionedCaseRecord | null> {
    const found = this.cases.get(this.caseKey(scope, caseId));
    if (!found || !matchesScope(found, scope)) return null;
    const events = this.events.get(found.caseId) ?? [];
    return { ...cloneRecord(found), events: structuredClone(events) };
  }

  async create(
    scope: CaseScope,
    input: CreateCaseRecord,
    initialEvent: CaseEventRecord,
    idempotencyKey: string,
  ): Promise<VersionedCaseRecord> {
    const existingIdem = this.idempotency.get(
      this.idemKey(scope, idempotencyKey),
    );
    if (existingIdem) {
      const existing = await this.get(scope, existingIdem.caseId);
      if (!existing) {
        throw new StoreConflictError(
          "case",
          existingIdem.caseId,
          undefined,
          "idempotency key refers to missing case",
        );
      }
      return existing;
    }
    const key = this.caseKey(scope, input.caseId);
    if (this.cases.has(key)) {
      throw new StoreConflictError("case", input.caseId);
    }
    const now = input.submittedAt;
    const record: VersionedCaseRecord = {
      caseId: input.caseId,
      tenantId: scope.tenantId,
      authorityId: scope.authorityId,
      jurisdictionId: scope.jurisdictionId,
      leistungId: input.leistungId,
      state: input.state,
      version: 1,
      payloadVersion: input.payloadVersion,
      configVersion: input.configVersion,
      payload: structuredClone(input.payload),
      submittedAt: input.submittedAt,
      createdAt: now,
      updatedAt: now,
    };
    this.cases.set(key, record);
    this.events.set(input.caseId, [structuredClone(initialEvent)]);
    this.idempotency.set(this.idemKey(scope, idempotencyKey), {
      scopeKey: scopeKey(scope),
      idempotencyKey,
      caseId: input.caseId,
      kind: "create",
    });
    return this.get(scope, input.caseId) as Promise<VersionedCaseRecord>;
  }

  async commit(
    scope: CaseScope,
    caseId: CaseId,
    expectedVersion: number,
    nextSnapshot: CaseSnapshotRecord,
    nextState: string,
    event: CaseEventRecord,
    idempotencyKey: string,
  ): Promise<VersionedCaseRecord> {
    const existingIdem = this.idempotency.get(
      this.idemKey(scope, idempotencyKey),
    );
    if (existingIdem) {
      const existing = await this.get(scope, existingIdem.caseId);
      if (!existing) {
        throw new StoreConflictError(
          "case",
          existingIdem.caseId,
          undefined,
          "idempotency key refers to missing case",
        );
      }
      return existing;
    }
    const key = this.caseKey(scope, caseId);
    const current = this.cases.get(key);
    if (!current || !matchesScope(current, scope)) {
      return Promise.reject(
        new StoreConflictError(
          "case",
          caseId,
          expectedVersion,
          "case not found",
        ),
      );
    }
    if (current.version !== expectedVersion) {
      throw new StoreConflictError("case", caseId, expectedVersion);
    }
    const events = this.events.get(caseId) ?? [];
    const expectedSeq = events.length + 1;
    if (event.sequence !== expectedSeq) {
      throw new StoreConflictError(
        "case-event",
        caseId,
        expectedVersion,
        `event sequence must be ${expectedSeq}`,
      );
    }
    const updated: VersionedCaseRecord = {
      ...current,
      state: nextState,
      version: current.version + 1,
      payload: structuredClone(nextSnapshot),
      updatedAt: event.occurredAt,
    };
    this.cases.set(key, updated);
    this.events.set(caseId, [...events, structuredClone(event)]);
    this.idempotency.set(this.idemKey(scope, idempotencyKey), {
      scopeKey: scopeKey(scope),
      idempotencyKey,
      caseId,
      kind: "commit",
    });
    return this.get(scope, caseId) as Promise<VersionedCaseRecord>;
  }
}

export class UnavailableCaseStore implements CaseStore {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new StoreUnavailableError(this.reason);
  }

  list(): Promise<Page<CaseSummaryRecord>> {
    this.fail();
  }
  get(): Promise<VersionedCaseRecord | null> {
    this.fail();
  }
  create(): Promise<VersionedCaseRecord> {
    this.fail();
  }
  commit(): Promise<VersionedCaseRecord> {
    this.fail();
  }
}

function parsePayload(raw: unknown): CaseSnapshotRecord {
  if (!raw || typeof raw !== "object") {
    throw new Error("malformed case payload");
  }
  return raw as CaseSnapshotRecord;
}

export class PostgresCaseStore implements CaseStore {
  constructor(private readonly databaseUrl: string) {}

  private async withClient<T>(
    fn: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async list(
    scope: CaseScope,
    query: CaseListQuery,
  ): Promise<Page<CaseSummaryRecord>> {
    return this.withClient(async (client) => {
      const limit = Math.min(
        Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
        MAX_PAGE_SIZE,
      );
      const params: unknown[] = [
        scope.tenantId,
        scope.authorityId,
        scope.jurisdictionId,
      ];
      const where = [
        "tenant_id = $1",
        "authority_id = $2",
        "jurisdiction_id = $3",
      ];
      if (query.states?.length) {
        params.push(query.states);
        where.push(`state = ANY($${params.length}::text[])`);
      }
      if (query.search?.trim()) {
        params.push(`%${query.search.trim().toLowerCase()}%`);
        where.push(`LOWER(payload->>'vorgangsnummer') LIKE $${params.length}`);
      }
      if (query.cursor) {
        params.push(query.cursor);
        where.push(
          `(updated_at, case_id) < (SELECT updated_at, case_id FROM app_cases WHERE case_id = $${params.length})`,
        );
      }
      params.push(limit + 1);
      const sql = `
        SELECT case_id, leistung_id, state, version, payload, submitted_at, updated_at
        FROM app_cases
        WHERE ${where.join(" AND ")}
        ORDER BY updated_at DESC, case_id DESC
        LIMIT $${params.length}
      `;
      const result = await client.query(sql, params);
      const rows = result.rows;
      const hasMore = rows.length > limit;
      const slice = hasMore ? rows.slice(0, limit) : rows;
      const items: CaseSummaryRecord[] = slice.map((row) => {
        const payload = parsePayload(row["payload"]);
        return {
          caseId: String(row["case_id"]),
          leistungId: String(row["leistung_id"]),
          state: String(row["state"]),
          version: Number(row["version"]),
          vorgangsnummer: payload.vorgangsnummer,
          submittedAt: new Date(String(row["submitted_at"])).toISOString(),
          updatedAt: new Date(String(row["updated_at"])).toISOString(),
        };
      });
      const last = items.at(-1);
      return {
        items,
        page: {
          ...(hasMore && last ? { nextCursor: last.caseId } : {}),
        },
      };
    });
  }

  async get(
    scope: CaseScope,
    caseId: CaseId,
  ): Promise<VersionedCaseRecord | null> {
    return this.withClient(async (client) => {
      const result = await client.query(
        `SELECT * FROM app_cases
         WHERE case_id = $1 AND tenant_id = $2 AND authority_id = $3 AND jurisdiction_id = $4`,
        [caseId, scope.tenantId, scope.authorityId, scope.jurisdictionId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const events = await client.query(
        `SELECT * FROM app_case_events WHERE case_id = $1 ORDER BY sequence ASC`,
        [caseId],
      );
      return mapCaseRow(row, events.rows);
    });
  }

  async create(
    scope: CaseScope,
    input: CreateCaseRecord,
    initialEvent: CaseEventRecord,
    idempotencyKey: string,
  ): Promise<VersionedCaseRecord> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const idem = await client.query(
          `SELECT case_id FROM app_case_idempotency
           WHERE tenant_id = $1 AND authority_id = $2 AND jurisdiction_id = $3 AND idempotency_key = $4`,
          [
            scope.tenantId,
            scope.authorityId,
            scope.jurisdictionId,
            idempotencyKey,
          ],
        );
        if (idem.rows[0]) {
          await client.query("COMMIT");
          return (await this.get(
            scope,
            String(idem.rows[0]!["case_id"]),
          )) as VersionedCaseRecord;
        }
        await client.query(
          `INSERT INTO app_cases (
             case_id, tenant_id, authority_id, jurisdiction_id,
             leistung_id, state, version, payload_version, config_version,
             payload, submitted_at, created_at, updated_at,
             procedure_id, procedure_version, subject_ids
           ) VALUES (
             $1,$2,$3,$4,$5,$6,1,$7,$8,$9::jsonb,$10,$10,$10,$5,'1','[]'::jsonb
           )`,
          [
            input.caseId,
            scope.tenantId,
            scope.authorityId,
            scope.jurisdictionId,
            input.leistungId,
            input.state,
            input.payloadVersion,
            input.configVersion,
            JSON.stringify(input.payload),
            input.submittedAt,
          ],
        );
        await insertEvent(client, input.caseId, initialEvent, idempotencyKey);
        await client.query(
          `INSERT INTO app_case_idempotency (
             tenant_id, authority_id, jurisdiction_id, idempotency_key, case_id, kind
           ) VALUES ($1,$2,$3,$4,$5,'create')`,
          [
            scope.tenantId,
            scope.authorityId,
            scope.jurisdictionId,
            idempotencyKey,
            input.caseId,
          ],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return (await this.get(scope, input.caseId)) as VersionedCaseRecord;
    });
  }

  async commit(
    scope: CaseScope,
    caseId: CaseId,
    expectedVersion: number,
    nextSnapshot: CaseSnapshotRecord,
    nextState: string,
    event: CaseEventRecord,
    idempotencyKey: string,
  ): Promise<VersionedCaseRecord> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const idem = await client.query(
          `SELECT case_id FROM app_case_idempotency
           WHERE tenant_id = $1 AND authority_id = $2 AND jurisdiction_id = $3 AND idempotency_key = $4`,
          [
            scope.tenantId,
            scope.authorityId,
            scope.jurisdictionId,
            idempotencyKey,
          ],
        );
        if (idem.rows[0]) {
          await client.query("COMMIT");
          return (await this.get(
            scope,
            String(idem.rows[0]!["case_id"]),
          )) as VersionedCaseRecord;
        }
        const updated = await client.query(
          `UPDATE app_cases
           SET state = $1, version = version + 1, payload = $2::jsonb, updated_at = $3
           WHERE case_id = $4 AND tenant_id = $5 AND authority_id = $6
             AND jurisdiction_id = $7 AND version = $8
           RETURNING case_id`,
          [
            nextState,
            JSON.stringify(nextSnapshot),
            event.occurredAt,
            caseId,
            scope.tenantId,
            scope.authorityId,
            scope.jurisdictionId,
            expectedVersion,
          ],
        );
        if (!updated.rows[0]) {
          throw new StoreConflictError("case", caseId, expectedVersion);
        }
        await insertEvent(client, caseId, event, idempotencyKey);
        await client.query(
          `INSERT INTO app_case_idempotency (
             tenant_id, authority_id, jurisdiction_id, idempotency_key, case_id, kind
           ) VALUES ($1,$2,$3,$4,$5,'commit')`,
          [
            scope.tenantId,
            scope.authorityId,
            scope.jurisdictionId,
            idempotencyKey,
            caseId,
          ],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      return (await this.get(scope, caseId)) as VersionedCaseRecord;
    });
  }
}

async function insertEvent(
  client: PgClient,
  caseId: string,
  event: CaseEventRecord,
  idempotencyKey: string,
): Promise<void> {
  await client.query(
    `INSERT INTO app_case_events (
       event_id, case_id, sequence, event_type, from_state, to_state,
       actor_id, actor_role, reason, event_payload, idempotency_key, request_id, occurred_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
    [
      event.eventId,
      caseId,
      event.sequence,
      event.eventType,
      event.fromState,
      event.toState,
      event.actorId,
      event.actorRole,
      event.reason ?? null,
      JSON.stringify(event.eventPayload ?? {}),
      idempotencyKey,
      event.requestId,
      event.occurredAt,
    ],
  );
}

function mapCaseRow(
  row: Record<string, unknown>,
  eventRows: Record<string, unknown>[],
): VersionedCaseRecord {
  return {
    caseId: String(row["case_id"]),
    tenantId: String(row["tenant_id"]),
    authorityId: String(row["authority_id"]),
    jurisdictionId: String(row["jurisdiction_id"]),
    leistungId: String(row["leistung_id"]),
    state: String(row["state"]),
    version: Number(row["version"]),
    payloadVersion: String(row["payload_version"]),
    configVersion: String(row["config_version"]),
    payload: parsePayload(row["payload"]),
    submittedAt: new Date(String(row["submitted_at"])).toISOString(),
    createdAt: new Date(String(row["created_at"])).toISOString(),
    updatedAt: new Date(String(row["updated_at"])).toISOString(),
    events: eventRows.map((e) => ({
      eventId: String(e["event_id"]),
      sequence: Number(e["sequence"]),
      eventType: String(e["event_type"]),
      fromState: e["from_state"] == null ? null : String(e["from_state"]),
      toState: String(e["to_state"]),
      actorId: String(e["actor_id"]),
      actorRole: String(e["actor_role"]),
      ...(e["reason"] != null ? { reason: String(e["reason"]) } : {}),
      eventPayload:
        e["event_payload"] && typeof e["event_payload"] === "object"
          ? (e["event_payload"] as Record<string, unknown>)
          : {},
      requestId: String(e["request_id"]),
      occurredAt: new Date(String(e["occurred_at"])).toISOString(),
    })),
  };
}

export function createCaseStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CaseStore {
  if (env["APP_CASE_STORE"] === "memory") {
    return new InMemoryCaseStore();
  }
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  if (databaseUrl === "") {
    throw new Error(
      "APP_PG_URL / APP_PG_DIRECT_URL is set but empty — fail fast at startup",
    );
  }
  return databaseUrl
    ? new PostgresCaseStore(databaseUrl)
    : new UnavailableCaseStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for case data (or set APP_CASE_STORE=memory for local DEV)",
      );
}
