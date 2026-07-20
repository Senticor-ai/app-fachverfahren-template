// chos-audit-store.test — der AuditStore-chos-Adapter über den Fake-Graph (ohne laufendes chos).
import { describe, expect, it } from "vitest";
import { ChosAuditStore } from "./chos-audit-store.js";
import { InMemoryChosClient } from "./chos-client.js";
import type { AuditEvent } from "./audit-store.js";

function ev(over: Partial<AuditEvent> & Pick<AuditEvent, "id">): AuditEvent {
  return {
    tenantId: "t1",
    actorId: "a1",
    eventType: "LOGIN_SUCCESS",
    occurredAt: "2026-01-01T00:00:00.000Z",
    metadata: {},
    ...over,
  };
}

describe("ChosAuditStore", () => {
  it("append + list ABSTEIGEND (neueste zuerst), mandanten-scoped, actorId null erlaubt, limit", async () => {
    const s = new ChosAuditStore(new InMemoryChosClient());
    await s.appendEvent(
      ev({ id: "e1", occurredAt: "2026-01-01T00:00:00.000Z" }),
    );
    await s.appendEvent(
      ev({
        id: "e2",
        occurredAt: "2026-01-03T00:00:00.000Z",
        actorId: null,
        eventType: "LOGIN_FAILED",
      }),
    );
    await s.appendEvent(
      ev({ id: "e3", occurredAt: "2026-01-02T00:00:00.000Z" }),
    );
    await s.appendEvent(ev({ id: "fremd", tenantId: "t2" }));
    const list = await s.listEvents({ tenantId: "t1" });
    expect(list.map((e) => e.id)).toEqual(["e2", "e3", "e1"]);
    expect(list[0]?.actorId).toBeNull();
    expect(await s.listEvents({ tenantId: "t1", limit: 1 })).toHaveLength(1);
  });
});
