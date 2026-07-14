import { describe, expect, it } from "vitest";
import { InMemoryAuditStore, type AuditEvent } from "./audit-store.js";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "audit.1",
    tenantId: "tenant.local",
    actorId: "actor.1",
    eventType: "USER_CREATED",
    occurredAt: "2026-07-12T10:00:00.000Z",
    metadata: {},
    ...overrides,
  };
}

describe("InMemoryAuditStore", () => {
  it("appends events and lists them tenant-scoped, newest first", async () => {
    const store = new InMemoryAuditStore();
    await store.appendEvent(
      makeEvent({ id: "audit.1", occurredAt: "2026-07-12T10:00:00.000Z" }),
    );
    await store.appendEvent(
      makeEvent({
        id: "audit.2",
        eventType: "LOGIN_SUCCESS",
        occurredAt: "2026-07-12T11:00:00.000Z",
      }),
    );
    await store.appendEvent(
      makeEvent({ id: "audit.other", tenantId: "tenant.other" }),
    );

    const events = await store.listEvents({ tenantId: "tenant.local" });
    expect(events.map((event) => event.id)).toEqual(["audit.2", "audit.1"]);
  });

  it("respects the limit and defaults metadata handling to the stored payload", async () => {
    const store = new InMemoryAuditStore();
    for (let index = 0; index < 5; index += 1) {
      await store.appendEvent(
        makeEvent({
          id: `audit.${index}`,
          occurredAt: `2026-07-12T1${index}:00:00.000Z`,
          metadata: { index },
        }),
      );
    }

    const events = await store.listEvents({
      tenantId: "tenant.local",
      limit: 2,
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.metadata).toEqual({ index: 4 });
  });

  it("supports events without an actor (failed logins of unknown accounts)", async () => {
    const store = new InMemoryAuditStore();
    await store.appendEvent(
      makeEvent({ id: "audit.anon", actorId: null, eventType: "LOGIN_FAILED" }),
    );
    const events = await store.listEvents({ tenantId: "tenant.local" });
    expect(events[0]?.actorId).toBeNull();
  });
});
