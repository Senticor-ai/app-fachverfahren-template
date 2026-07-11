// Fan-out-Consumer-Driver (#24): der generische Lauf eines ZUSÄTZLICHEN Event-Konsumenten über der geteilten
// Outbox — z. B. ein Such-Projektor, ein Notifier oder ein 2. Domänen-Backend. Spiegelt `processDueAutomationEvents`
// (die Engine), arbeitet aber über die per-Consumer-Zustellung (`claimForConsumer`/`markDelivered`) und rührt
// `processed_at` NIE an. So bekommen MEHRERE unabhängige Backends JEDES getypte Event (#16), jeweils mit eigenem
// at-least-once/DLQ — der Weg zu „mehreren Backends für unterschiedliche Bereiche".
import type {
  AppAutomationEvent,
  AutomationStore,
} from "@senticor/app-store-postgres";

export interface ConsumerHandle {
  /** Eindeutige Consumer-Id — der Zustell-Cursor je Consumer (verschiedene Ids ⇒ unabhängiger Fan-out). */
  id: string;
  /** #16-Envelope-Filter: nur diese Domänen-Event-Typen an diesen Consumer. Fehlend ⇒ alle GETYPTEN Events. */
  eventTypes?: string[];
  /** Die Consumer-Logik. WIRFT sie, wird die Zustellung NICHT abgeschlossen → Re-Delivery nach Lease-Ablauf
   *  (at-least-once) — der Handler MUSS daher idempotent sein. */
  handle: (event: AppAutomationEvent) => Promise<void> | void;
}

export interface ConsumerTickResult {
  claimed: number;
  delivered: number;
  deadLettered: number;
  failed: number;
}

/** Zustell-Obergrenze je Consumer, bevor eine Zustellung als POISON dead-lettert wird (Analog zu #9, aber PRO
 *  Consumer — ein für Consumer A giftiges Event blockiert Consumer B nicht). */
export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 10;

/**
 * EIN Fan-out-Consumer-Tick: `claimForConsumer` → `handle` → `markDelivered` (Erfolg) bzw. `deadLetterDelivery`
 * (Zustell-Obergrenze überschritten). EINZEL-Claim (limit 1), damit ein Prozess-Crash eindeutig der gerade
 * verarbeiteten Zustellung zugeordnet wird (kein Kollateral-DLQ co-geclaimter Events — dieselbe Lehre wie #9).
 * `maxEvents` begrenzt die Tick-Dauer.
 */
export async function runConsumerTick(
  store: AutomationStore,
  consumer: ConsumerHandle,
  opts: {
    now: () => string;
    limit?: number;
    maxAttempts?: number;
    visibilityMs?: number;
  },
): Promise<ConsumerTickResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_DELIVERY_ATTEMPTS;
  const maxEvents = opts.limit ?? 50;
  const result: ConsumerTickResult = {
    claimed: 0,
    delivered: 0,
    deadLettered: 0,
    failed: 0,
  };
  for (let i = 0; i < maxEvents; i += 1) {
    const claimed = await store.claimForConsumer({
      consumer: consumer.id,
      now: opts.now(),
      limit: 1,
      ...(consumer.eventTypes ? { eventTypes: consumer.eventTypes } : {}),
      ...(opts.visibilityMs !== undefined
        ? { visibilityMs: opts.visibilityMs }
        : {}),
    });
    const d = claimed[0];
    if (!d) break;
    result.claimed += 1;

    // POISON-Schutz je Consumer: über der Obergrenze terminal quarantänen (kein Endlos-Re-Delivery), sichtbar als
    // 'dead'-Zustellung. Der attempts-Check steht VOR dem Handler → bricht den Crash-Loop.
    if (d.attempts > maxAttempts) {
      result.deadLettered += 1;
      await store.deadLetterDelivery({
        consumer: consumer.id,
        eventId: d.event.eventId,
        now: opts.now(),
        reason: "poison-max-attempts",
      });
      continue;
    }

    try {
      await consumer.handle(d.event);
      await store.markDelivered({
        consumer: consumer.id,
        eventId: d.event.eventId,
        now: opts.now(),
      });
      result.delivered += 1;
    } catch {
      // NICHT markDelivered → nach Lease-Ablauf Re-Delivery (at-least-once). Der Fehlversuch hat attempts erhöht.
      result.failed += 1;
    }
  }
  return result;
}
