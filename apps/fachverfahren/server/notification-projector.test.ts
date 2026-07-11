import { describe, it, expect } from "vitest";
import {
  InMemoryAutomationStore,
  InMemoryNotificationStore,
  type AppAutomationEvent,
} from "@senticor/app-store-postgres";
import { runConsumerTick } from "./event-consumer.js";
import {
  notificationProjector,
  eventZuNotification,
} from "./notification-projector.js";

const NOW = "2026-07-10T12:00:00.000Z";
let seq = 0;
const uid = () => `id-${seq++}`;

function event(
  eventType: string,
  over: Partial<AppAutomationEvent> = {},
): AppAutomationEvent {
  return {
    eventId: `evt-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    procedureId: "leistung",
    caseId: "case-1",
    taskId: null,
    triggerEvent: "x",
    payload: {},
    createdAt: NOW,
    processedAt: null,
    eventType,
    eventVersion: 1,
    occurredAt: NOW,
    ...over,
  };
}

describe("Notification-Projektor (#18) — 2. Backend über der Fan-out-Naht (#24)", () => {
  it("projiziert getypte Domänen-Events in persistente Meldungen (via runConsumerTick)", async () => {
    const events = new InMemoryAutomationStore();
    const notifs = new InMemoryNotificationStore();
    await events.enqueueEvent(event("case.eingegangen"));
    await events.enqueueEvent(
      event("task.frist-erreicht", { taskId: "task-9" }),
    );
    await events.enqueueEvent(
      event("case.vorlegen", { payload: { toState: "vorgelegt" } }),
    );

    const r = await runConsumerTick(events, notificationProjector(notifs), {
      now: () => NOW,
    });
    expect(r.delivered).toBe(3);

    const liste = await notifs.listNotifications({ tenantId: "t1" });
    expect(liste).toHaveLength(3);
    expect(liste.map((n) => n.title).sort()).toEqual(
      ["Frist erreicht", "Neuer Eingang", "Vorgang aktualisiert"].sort(),
    );
    // Die Transition-Meldung trägt den Zielzustand aus der payload.
    expect(liste.find((n) => n.eventType === "case.vorlegen")?.body).toContain(
      "vorgelegt",
    );
    // occurredAt → createdAt der Meldung (Domänen-Zeit).
    expect(liste.every((n) => n.createdAt === NOW)).toBe(true);
  });

  it("IDEMPOTENT: at-least-once-Doppelzustellung erzeugt KEINE Dublette (deterministische notification_id)", async () => {
    const notifs = new InMemoryNotificationStore();
    const e = event("case.eingegangen");
    const n1 = await notifs.insertNotification(eventZuNotification(e));
    const n2 = await notifs.insertNotification(eventZuNotification(e)); // Re-Delivery
    expect(n1.inserted).toBe(true);
    expect(n2.inserted).toBe(false);
    expect(await notifs.listNotifications({ tenantId: "t1" })).toHaveLength(1);
  });

  it("nur GETYPTE Events werden gemeldet (ungetypte bleiben der Engine überlassen)", async () => {
    const events = new InMemoryAutomationStore();
    const notifs = new InMemoryNotificationStore();
    await events.enqueueEvent(event("case.eingegangen"));
    // Ungetyptes Alt-Event (kein eventType) — wird NICHT gefächert.
    await events.enqueueEvent({ ...event("x"), eventType: null });
    const r = await runConsumerTick(events, notificationProjector(notifs), {
      now: () => NOW,
    });
    expect(r.delivered).toBe(1);
    expect(await notifs.listNotifications({ tenantId: "t1" })).toHaveLength(1);
  });
});
