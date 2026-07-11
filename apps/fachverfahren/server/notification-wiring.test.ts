import { describe, it, expect } from "vitest";
import {
  InMemoryAutomationStore,
  InMemoryNotificationStore,
  type AppAutomationEvent,
} from "@senticor/app-store-postgres";
import { consumerTickRunner } from "./index.js";
import { notificationProjector } from "./notification-projector.js";

const NOW = "2026-07-10T12:00:00.000Z";
let seq = 0;
const uid = () => `id-${seq++}`;

function typedEvent(): AppAutomationEvent {
  return {
    eventId: `evt-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    procedureId: "leistung",
    caseId: "c1",
    taskId: null,
    triggerEvent: "x",
    payload: {},
    createdAt: NOW,
    processedAt: null,
    eventType: "case.eingegangen",
    eventVersion: 1,
    occurredAt: NOW,
  };
}

describe("consumerTickRunner + Notification-Projektor — Poller/Worker-Wiring (#18b-2)", () => {
  it("ein Tick projiziert enqueued Events in Meldungen; drain wartet den Tick ab", async () => {
    const events = new InMemoryAutomationStore();
    const notifs = new InMemoryNotificationStore();
    await events.enqueueEvent(typedEvent());
    await events.enqueueEvent(typedEvent());
    const runner = consumerTickRunner(
      events,
      notificationProjector(notifs),
      () => NOW,
    );
    runner.run();
    await runner.drain();
    expect(await notifs.listNotifications({ tenantId: "t1" })).toHaveLength(2);
  });

  it("überlappungs-geschützt: ein 2. run() während eines laufenden Ticks startet KEINEN parallelen Tick", async () => {
    const events = new InMemoryAutomationStore();
    const notifs = new InMemoryNotificationStore();
    await events.enqueueEvent(typedEvent());
    const runner = consumerTickRunner(
      events,
      notificationProjector(notifs),
      () => NOW,
    );
    runner.run();
    runner.run(); // sofort nochmal — der in-flight-Guard muss das ignorieren
    await runner.drain();
    // Genau EINE Meldung: kein paralleler Tick, keine Doppel-Projektion.
    expect(await notifs.listNotifications({ tenantId: "t1" })).toHaveLength(1);
  });

  it("berührt die Engine NICHT: processed_at bleibt NULL, die Engine kann DIESELBEN Events noch claimen", async () => {
    const events = new InMemoryAutomationStore();
    const notifs = new InMemoryNotificationStore();
    const e = typedEvent();
    await events.enqueueEvent(e);
    const runner = consumerTickRunner(
      events,
      notificationProjector(notifs),
      () => NOW,
    );
    runner.run();
    await runner.drain();
    // Projektor hat zugestellt, aber die Engine-Sicht (claimDueEvents) ist unberührt.
    const engine = await events.claimDueEvents({ now: NOW, limit: 10 });
    expect(engine.map((x) => x.eventId)).toContain(e.eventId);
  });
});
