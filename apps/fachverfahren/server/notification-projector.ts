// Notification-Projektor (#18) — das ZWEITE Backend über der Fan-out-Naht (#24). Ein Fan-out-Consumer (runConsumerTick),
// der getypte Domänen-Events (case.eingegangen / case.<action> / task.frist-erreicht) in DAUERHAFTE In-App-Meldungen
// projiziert. Läuft unabhängig neben der Automations-Engine; koordiniert über die per-Consumer-Zustellung, ohne die
// Engine (processed_at) zu berühren. Demonstriert „mehrere Backends für unterschiedliche Bereiche".
//
// IDEMPOTENZ (Pflicht): der Fan-out ist at-least-once → derselbe Event kann mehrfach zugestellt werden. Die
// notification_id ist DETERMINISTISCH aus der event_id abgeleitet, `insertNotification` ist idempotent → keine Dublette.
import type {
  AppAutomationEvent,
  AppNotification,
  NotificationStore,
} from "@senticor/app-store-postgres";
import type { ConsumerHandle } from "./event-consumer.js";

/** Consumer-Id des Projektors (der Zustell-Cursor je Consumer im Fan-out). */
export const NOTIFICATION_CONSUMER = "notification-projector";

/** Baut aus einem Event eine Meldung (Titel/Body datengetrieben aus event_type + payload). `createdAt` = die
 *  Domänen-Zeit (occurredAt), nicht die Projektionszeit. `notificationId` deterministisch → idempotent. */
export function eventZuNotification(
  event: AppAutomationEvent,
): AppNotification {
  const { title, body } = titelFuer(event);
  return {
    notificationId: `notif.${event.eventId}`,
    tenantId: event.tenantId,
    authorityId: event.authorityId,
    // An die zuständige Stelle (Client löst rollen-/zuständigkeitsbasiert auf); gezielte Empfänger sind eine Folge-Stufe.
    recipientActorId: null,
    eventType: event.eventType ?? "",
    title,
    body,
    caseId: event.caseId,
    taskId: event.taskId,
    read: false,
    createdAt: event.occurredAt ?? event.createdAt,
  };
}

function titelFuer(event: AppAutomationEvent): { title: string; body: string } {
  const bezug = event.caseId ? `Vorgang ${event.caseId}` : "Ein Vorgang";
  if (event.eventType === "case.eingegangen") {
    return {
      title: "Neuer Eingang",
      body: `${bezug} ist eingegangen und wartet auf Bearbeitung.`,
    };
  }
  if (event.eventType === "task.frist-erreicht") {
    return {
      title: "Frist erreicht",
      body: `Eine Frist${event.taskId ? ` zu Aufgabe ${event.taskId}` : ""} ist fällig.`,
    };
  }
  // case.<action> (Übergang): der Zielzustand aus der payload macht die Meldung sprechend.
  const nach =
    typeof event.payload["toState"] === "string"
      ? event.payload["toState"]
      : (event.eventType ?? "geändert");
  return {
    title: "Vorgang aktualisiert",
    body: `${bezug} wurde nach „${nach}" gewechselt.`,
  };
}

/**
 * Der Notification-Projektor als Fan-out-Consumer (für `runConsumerTick`): persistiert jede zugestellte Meldung
 * IDEMPOTENT. Reentrant (deterministische id) — Pflicht, weil der Fan-out at-least-once ist. `eventTypes` optional
 * überschreibbar (Standard: die notifizierbaren Typen oben).
 */
export function notificationProjector(
  store: NotificationStore,
  opts: { eventTypes?: string[] } = {},
): ConsumerHandle {
  return {
    id: NOTIFICATION_CONSUMER,
    // Ohne Filter (Default): der Projektor meldet JEDES getypte Domänen-Event — auch die dynamischen
    // case.<action>-Übergänge. `opts.eventTypes` grenzt bei Bedarf ein.
    ...(opts.eventTypes ? { eventTypes: opts.eventTypes } : {}),
    handle: async (event) => {
      await store.insertNotification(eventZuNotification(event));
    },
  };
}
