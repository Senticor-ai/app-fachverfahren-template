// chos-audit-store — der AuditStore-Adapter auf den chos-Graph-Store. Sicherheits-Audit-Events (administrative
// Aktionen) liegen als append-only chos-Ereignisse in EINEM Stream pro Mandant. Semantik in Parität zu
// InMemory/Postgres (mandanten-scoped, ABSTEIGEND nach occurredAt, Default-Limit 100). Gewählt via
// APP_STORE_MODE=chos; Postgres bleibt der OSS-Default.
import { type ChosClient } from "./chos-client.js";
import {
  type AuditEvent,
  type AuditEventType,
  type AuditStore,
} from "./audit-store.js";

const AUDIT_STREAM = "audit";
const DEFAULT_LIST_LIMIT = 100;

function eventToBody(e: AuditEvent): Record<string, unknown> {
  return {
    id: e.id,
    tenantId: e.tenantId,
    actorId: e.actorId,
    eventType: e.eventType,
    occurredAt: e.occurredAt,
    metadata: { ...e.metadata },
  };
}

function bodyToEvent(body: Record<string, unknown>): AuditEvent {
  return {
    id: String(body["id"]),
    tenantId: String(body["tenantId"]),
    actorId:
      body["actorId"] === null || body["actorId"] === undefined
        ? null
        : String(body["actorId"]),
    eventType: String(body["eventType"]) as AuditEventType,
    occurredAt: String(body["occurredAt"]),
    metadata:
      body["metadata"] && typeof body["metadata"] === "object"
        ? (body["metadata"] as Record<string, unknown>)
        : {},
  };
}

export class ChosAuditStore implements AuditStore {
  constructor(private readonly client: ChosClient) {}

  async appendEvent(event: AuditEvent): Promise<AuditEvent> {
    await this.client.appendEvent({
      tenantId: event.tenantId,
      stream: AUDIT_STREAM,
      id: event.id,
      occurredAt: event.occurredAt,
      body: eventToBody(event),
    });
    return { ...event, metadata: { ...event.metadata } };
  }

  async listEvents(input: {
    tenantId: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    // ChosClient.listEvents liefert AUFSTEIGEND; der Audit-Vertrag ist ABSTEIGEND (neueste zuerst) → hier drehen.
    const events = await this.client.listEvents({
      tenantId: input.tenantId,
      stream: AUDIT_STREAM,
    });
    return events
      .map((e) => bodyToEvent(e.body))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, input.limit ?? DEFAULT_LIST_LIMIT);
  }
}
