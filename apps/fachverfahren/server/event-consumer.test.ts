import { describe, it, expect } from "vitest";
import {
  InMemoryAutomationStore,
  type AppAutomationEvent,
} from "@senticor/app-store-postgres";
import { runConsumerTick, type ConsumerHandle } from "./event-consumer.js";

const NOW = "2026-07-10T12:00:00.000Z";
let seq = 0;
const uid = () => `id-${seq++}`;

function typedEvent(eventType: string): AppAutomationEvent {
  return {
    eventId: `evt-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    procedureId: "leistung",
    caseId: `case-${uid()}`,
    taskId: null,
    triggerEvent: "beim-uebergang",
    payload: {},
    createdAt: NOW,
    processedAt: null,
    eventType,
    eventVersion: 1,
  };
}

describe("Fan-out-Consumer-Driver (#24) — mehrere Backends über der geteilten Outbox", () => {
  it("zwei UNABHÄNGIGE Consumer verarbeiten JEDES getypte Event (Fan-out end-to-end)", async () => {
    const store = new InMemoryAutomationStore();
    await store.enqueueEvent(typedEvent("case.transitioned"));
    await store.enqueueEvent(typedEvent("case.transitioned"));

    const suchIndex: string[] = [];
    const benachrichtigt: string[] = [];
    const such: ConsumerHandle = {
      id: "search-projektor",
      handle: (e) => {
        suchIndex.push(e.eventId);
      },
    };
    const notif: ConsumerHandle = {
      id: "notifier",
      handle: (e) => {
        benachrichtigt.push(e.eventId);
      },
    };

    const r1 = await runConsumerTick(store, such, { now: () => NOW });
    const r2 = await runConsumerTick(store, notif, { now: () => NOW });
    expect(r1).toMatchObject({ claimed: 2, delivered: 2 });
    expect(r2).toMatchObject({ claimed: 2, delivered: 2 });
    // Beide Backends haben BEIDE Events gesehen — unabhängig voneinander.
    expect(suchIndex).toHaveLength(2);
    expect(benachrichtigt).toHaveLength(2);
    // Erneuter Tick: alles zugestellt → nichts mehr (kein Doppel-Verarbeiten).
    expect(
      (await runConsumerTick(store, such, { now: () => NOW })).claimed,
    ).toBe(0);
    expect(
      (await runConsumerTick(store, notif, { now: () => NOW })).claimed,
    ).toBe(0);
  });

  it("eventTypes filtert je Consumer — ein Notifier bekommt NUR seine Event-Typen", async () => {
    const store = new InMemoryAutomationStore();
    await store.enqueueEvent(typedEvent("case.transitioned"));
    await store.enqueueEvent(typedEvent("task.frist-erreicht"));

    const gesehen: string[] = [];
    const nurFristen: ConsumerHandle = {
      id: "frist-notifier",
      eventTypes: ["task.frist-erreicht"],
      handle: (e) => {
        gesehen.push(e.eventType ?? "");
      },
    };
    const r = await runConsumerTick(store, nurFristen, { now: () => NOW });
    expect(r.delivered).toBe(1);
    expect(gesehen).toEqual(["task.frist-erreicht"]);
  });

  it("ein für den Handler giftiges Event dead-lettert je Consumer nach der Obergrenze (kein Endlos-Re-Delivery)", async () => {
    const store = new InMemoryAutomationStore();
    await store.enqueueEvent(typedEvent("case.transitioned"));
    let versuche = 0;
    const wirftImmer: ConsumerHandle = {
      id: "kaputt",
      handle: () => {
        versuche += 1;
        throw new Error("boom");
      },
    };
    // maxAttempts=2, kleine Lease (1 s) → nach 2 Fehlversuchen greift beim 3. Claim der Cap. Ticks >1 s auseinander,
    // damit die Lease dazwischen abläuft (Re-Claim).
    const zeiten = [
      "2026-07-10T12:00:00.000Z",
      "2026-07-10T12:00:02.000Z",
      "2026-07-10T12:00:04.000Z",
      "2026-07-10T12:00:06.000Z",
    ];
    let deadLettered = 0;
    for (const t of zeiten) {
      const r = await runConsumerTick(store, wirftImmer, {
        now: () => t,
        maxAttempts: 2,
        visibilityMs: 1000,
        limit: 5,
      });
      deadLettered += r.deadLettered;
    }
    // Der Handler wurde BOUNDED aufgerufen (nicht endlos) — höchstens maxAttempts mal.
    expect(versuche).toBeLessThanOrEqual(2);
    expect(deadLettered).toBe(1);
    const del = (await store.listDeliveries({ consumer: "kaputt" }))[0];
    expect(del?.status).toBe("dead");
    expect(del?.reason).toBe("poison-max-attempts");
  });
});
