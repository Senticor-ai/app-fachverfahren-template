import { describe, expect, it } from "vitest";
import {
  InMemoryAutomationStore,
  PostgresAutomationStore,
  type AppAutomationEvent,
} from "./automation-store.js";
import {
  createWakeSource,
  InMemoryWakeSource,
  PgWakeSource,
} from "./wake-source.js";

// Testet den WAKE-Seam (#17): den prozess-lokalen InMemory-Wecker + die Kopplung an den Store (Enqueue weckt). Der
// Postgres-LISTEN-Pfad ist attended (kein PG im Gate) — hier nur die Auswahl/Konstruktion.

function macheEvent(
  over: Partial<AppAutomationEvent> = {},
): AppAutomationEvent {
  return {
    eventId: `evt-${over.eventId ?? "1"}`,
    tenantId: "t1",
    authorityId: "b1",
    procedureId: "leistung",
    caseId: "c1",
    taskId: null,
    triggerEvent: "beim-eingang",
    payload: {},
    createdAt: "2026-06-01T00:00:00.000Z",
    processedAt: null,
    ...over,
  };
}

describe("InMemoryWakeSource", () => {
  it("notify feuert alle Subscriber; unsubscribe stoppt", () => {
    const src = new InMemoryWakeSource();
    let a = 0;
    let b = 0;
    const unsubA = src.subscribe(() => a++);
    src.subscribe(() => b++);
    src.notify();
    expect([a, b]).toEqual([1, 1]);
    unsubA();
    src.notify();
    expect([a, b]).toEqual([1, 2]); // a abgemeldet
  });

  it("ein werfender Subscriber blockiert die anderen nicht", () => {
    const src = new InMemoryWakeSource();
    let b = 0;
    src.subscribe(() => {
      throw new Error("boom");
    });
    src.subscribe(() => b++);
    expect(() => src.notify()).not.toThrow();
    expect(b).toBe(1);
  });

  it("close leert die Subscriber", async () => {
    const src = new InMemoryWakeSource();
    let a = 0;
    src.subscribe(() => a++);
    await src.close();
    src.notify();
    expect(a).toBe(0);
  });
});

describe("InMemoryAutomationStore.wakeNotify (#17)", () => {
  it("ein NEUES Event weckt; die idempotente Wiederkehr NICHT", async () => {
    const store = new InMemoryAutomationStore();
    let woke = 0;
    store.wakeNotify = () => {
      woke++;
    };
    await store.enqueueEvent(macheEvent({ eventId: "e1" }));
    expect(woke).toBe(1);
    await store.enqueueEvent(macheEvent({ eventId: "e1" })); // gleiche id ⇒ idempotent
    expect(woke).toBe(1); // kein zweites Wecken
  });
});

describe("createWakeSource", () => {
  it("In-Memory-Store ⇒ InMemoryWakeSource, an den Enqueue gekoppelt", async () => {
    const store = new InMemoryAutomationStore();
    const src = createWakeSource(store, {});
    expect(src).toBeInstanceOf(InMemoryWakeSource);
    let woke = 0;
    src!.subscribe(() => woke++);
    await store.enqueueEvent(macheEvent({ eventId: "x" }));
    expect(woke).toBe(1); // Enqueue → store.wakeNotify → source.notify → Subscriber
    await src!.close();
  });

  it("Postgres-Store mit URL ⇒ PgWakeSource (lazy, keine Verbindung ohne Subscriber)", async () => {
    const store = new PostgresAutomationStore("postgres://fake/db");
    const src = createWakeSource(store, { APP_PG_URL: "postgres://fake/db" });
    expect(src).toBeInstanceOf(PgWakeSource);
    await src!.close(); // ohne Subscriber nie verbunden ⇒ sauberer no-op-Close
  });

  it("Postgres-Store OHNE URL ⇒ kein Wecker (nur Poll)", () => {
    const store = new PostgresAutomationStore("postgres://fake/db");
    expect(createWakeSource(store, {})).toBeUndefined();
  });
});
