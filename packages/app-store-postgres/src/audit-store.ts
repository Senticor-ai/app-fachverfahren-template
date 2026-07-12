import { createPgClient, type PgClient } from "./client.js";

/** Ereignis-Katalog (MVP, offen erweiterbar): jede sicherheitsrelevante administrative
 *  Aktion erzeugt ein Event — Compliance-by-Design (Nachvollziehbarkeit, Evidenz).
 *  Neue Ereignistypen hier ergänzen und in docs/reference/security-baseline.md listen. */
export type AuditEventType =
  | "USER_CREATED"
  | "USER_STATUS_CHANGED"
  | "USER_ROLE_CHANGED"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "LOGIN_LOCKED"
  | "BOARD_CREATED"
  | "BOARD_VISIBILITY_CHANGED"
  | "BOARD_ARCHIVED"
  | "EXPORT_CREATED";

export interface AuditEvent {
  id: string;
  tenantId: string;
  /** NULL-bar: fehlgeschlagene Logins unbekannter Konten haben keinen Actor. */
  actorId: string | null;
  eventType: AuditEventType;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface AuditStore {
  appendEvent(event: AuditEvent): Promise<AuditEvent>;
  listEvents(input: {
    tenantId: string;
    limit?: number;
  }): Promise<AuditEvent[]>;
}

const DEFAULT_LIST_LIMIT = 100;

// ─── InMemory ────────────────────────────────────────────────────────────

export class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];

  async appendEvent(event: AuditEvent): Promise<AuditEvent> {
    this.events.push({ ...event, metadata: { ...event.metadata } });
    return { ...event };
  }

  async listEvents(input: {
    tenantId: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    return this.events
      .filter((event) => event.tenantId === input.tenantId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, input.limit ?? DEFAULT_LIST_LIMIT)
      .map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }
}

// ─── Unavailable ─────────────────────────────────────────────────────────

export class UnavailableAuditStore implements AuditStore {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new Error(this.reason);
  }

  async appendEvent(): Promise<AuditEvent> {
    this.fail();
  }
  async listEvents(): Promise<AuditEvent[]> {
    this.fail();
  }
}

export function createAuditStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AuditStore {
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresAuditStore(databaseUrl)
    : new UnavailableAuditStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for audit data",
      );
}

// ─── Postgres ────────────────────────────────────────────────────────────

interface AuditEventRow extends Record<string, unknown> {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  event_type: AuditEventType;
  occurred_at: Date | string;
  metadata: Record<string, unknown>;
}

export class PostgresAuditStore implements AuditStore {
  constructor(private readonly databaseUrl: string) {}

  async appendEvent(event: AuditEvent): Promise<AuditEvent> {
    return this.withClient(async (client) => {
      const result = await client.query<AuditEventRow>(
        `
          INSERT INTO app_workspace_audit_events (
            id, tenant_id, actor_id, event_type, occurred_at, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb)
          RETURNING *
        `,
        [
          event.id,
          event.tenantId,
          event.actorId,
          event.eventType,
          event.occurredAt,
          JSON.stringify(event.metadata),
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error(`audit event "${event.id}" write returned no row`);
      }
      return eventFromRow(row);
    });
  }

  async listEvents(input: {
    tenantId: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    return this.withClient(async (client) => {
      const result = await client.query<AuditEventRow>(
        `
          SELECT * FROM app_workspace_audit_events
          WHERE tenant_id = $1
          ORDER BY occurred_at DESC, id DESC
          LIMIT $2
        `,
        [input.tenantId, input.limit ?? DEFAULT_LIST_LIMIT],
      );
      return result.rows.map(eventFromRow);
    });
  }

  private async withClient<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }
}

function eventFromRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorId: row.actor_id,
    eventType: row.event_type,
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
    metadata: row.metadata ?? {},
  };
}
