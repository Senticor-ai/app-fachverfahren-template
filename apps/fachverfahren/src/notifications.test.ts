import { describe, expect, it } from "vitest";
import {
  ladeBenachrichtigungen,
  mapNotification,
  markiereGelesenApi,
  typFuerEvent,
  type ApiNotification,
} from "./notifications.js";

// Testet den Notification-Client-Adapter (#18b-3): die reine Server→Anzeige-Abbildung + die Fetch-Naht
// (GET /api/notifications, POST /:id/read) mit INJIZIERTEM fetch — ohne Netz, ohne konfigurierte API-Basis.

function macheApiNotification(
  over: Partial<ApiNotification> = {},
): ApiNotification {
  return {
    notificationId: "notif.evt-1",
    title: "Neuer Vorgang eingegangen",
    body: "Vorgang c1 ist eingegangen.",
    eventType: "case.eingegangen",
    read: false,
    createdAt: "2026-07-10T12:00:00.000Z",
    ...over,
  };
}

/** Minimaler fetch-Doppelgänger: protokolliert Aufrufe, liefert eine kanonische JSON-Antwort. */
function mockFetch(antwort: { ok?: boolean; json?: unknown } = {}): {
  fetchFn: typeof fetch;
  aufrufe: Array<{ url: string; init?: RequestInit }>;
} {
  const aufrufe: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    aufrufe.push({ url, ...(init ? { init } : {}) });
    return {
      ok: antwort.ok ?? true,
      json: async () => antwort.json ?? {},
    } as Response;
  }) as unknown as typeof fetch;
  return { fetchFn, aufrufe };
}

describe("typFuerEvent — event_type → Meldungs-Ton", () => {
  it("mappt Fristverletzung auf 'warn', den Rest auf 'info'", () => {
    expect(typFuerEvent("task.frist-erreicht")).toBe("warn");
    expect(typFuerEvent("case.eingegangen")).toBe("info");
    expect(typFuerEvent("case.beschieden")).toBe("info");
    expect(typFuerEvent("irgendwas.unbekannt")).toBe("info");
  });
});

describe("mapNotification — Server-Meldung → Anzeige-Benachrichtigung", () => {
  it("bildet alle Felder inkl. Ton ab", () => {
    const b = mapNotification(
      macheApiNotification({
        notificationId: "notif.abc",
        title: "Frist erreicht",
        body: "Die Frist für c9 ist erreicht.",
        eventType: "task.frist-erreicht",
        read: true,
        createdAt: "2026-07-11T08:00:00.000Z",
      }),
    );
    expect(b).toEqual({
      id: "notif.abc",
      titel: "Frist erreicht",
      text: "Die Frist für c9 ist erreicht.",
      typ: "warn",
      gelesen: true,
      zeitIso: "2026-07-11T08:00:00.000Z",
    });
  });
});

describe("ladeBenachrichtigungen — GET /api/notifications", () => {
  it("fetcht die API-Basis und liefert die gemappten Meldungen", async () => {
    const { fetchFn, aufrufe } = mockFetch({
      json: {
        notifications: [
          macheApiNotification({ notificationId: "notif.1" }),
          macheApiNotification({
            notificationId: "notif.2",
            eventType: "task.frist-erreicht",
          }),
        ],
      },
    });
    const b = await ladeBenachrichtigungen({
      fetchFn,
      base: "https://api.example",
    });
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]!.url).toBe("https://api.example/api/notifications");
    expect(b.map((x) => x.id)).toEqual(["notif.1", "notif.2"]);
    expect(b[1]!.typ).toBe("warn");
  });

  it("liefert [] bei nicht-ok Antwort (die App läuft ohne Meldungen weiter)", async () => {
    const { fetchFn } = mockFetch({ ok: false });
    expect(await ladeBenachrichtigungen({ fetchFn, base: "x" })).toEqual([]);
  });

  it("liefert [] bei fehlendem notifications-Feld", async () => {
    const { fetchFn } = mockFetch({ json: {} });
    expect(await ladeBenachrichtigungen({ fetchFn, base: "x" })).toEqual([]);
  });

  it("ohne API-Basis wird NICHT gefetcht (DEV: abgeleiteter Pfad bleibt)", async () => {
    // base weggelassen ⇒ fällt auf das (in Tests undefinierte) apiBaseUrl zurück ⇒ kein Fetch.
    const { fetchFn, aufrufe } = mockFetch({});
    expect(await ladeBenachrichtigungen({ fetchFn })).toEqual([]);
    expect(aufrufe).toHaveLength(0);
  });
});

describe("markiereGelesenApi — POST /api/notifications/:id/read", () => {
  it("postet die URL-kodierte Id an den read-Endpunkt", async () => {
    const { fetchFn, aufrufe } = mockFetch({});
    await markiereGelesenApi("notif.a/b", {
      fetchFn,
      base: "https://api.example",
    });
    expect(aufrufe).toHaveLength(1);
    expect(aufrufe[0]!.url).toBe(
      "https://api.example/api/notifications/notif.a%2Fb/read",
    );
    expect(aufrufe[0]!.init?.method).toBe("POST");
  });

  it("ohne API-Basis wird NICHT gepostet", async () => {
    const { fetchFn, aufrufe } = mockFetch({});
    await markiereGelesenApi("notif.x", { fetchFn });
    expect(aufrufe).toHaveLength(0);
  });
});
