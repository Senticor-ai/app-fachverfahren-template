// antrag-client.test.ts — die HTTP-Persistenz-Naht der Bürger-Anträge (VorgangPersistence gegen
// /api/buerger/antraege). Kernzusicherung: die Abbildung Vorgang↔AntragDto ist VERLUSTFREI —
// id/status leben oben am DTO, alles Übrige reist opak in `data` und kommt unverändert zurück.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Vorgang } from "@senticor/fachverfahren-kit";
import { createHttpVorgangPersistence } from "../src/antrag-client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

interface Captured {
  url: string;
  method: string;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

function stubFetch(payload: unknown, status = 200): { calls: Captured[] } {
  const calls: Captured[] = [];
  vi.stubGlobal("fetch", (input: string, init: RequestInit = {}) => {
    calls.push({
      url: input,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      credentials: init.credentials,
    });
    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  return { calls };
}

const persistence = createHttpVorgangPersistence({
  procedureId: "musterantrag",
  procedureVersion: "1",
});

// Ein reicher Vorgang, wie ihn der Kit-Store rechnet — der Prüfstein für Verlustfreiheit.
const vorgang: Vorgang = {
  id: "v-000001",
  vorgangsnummer: "FV-2026-0006",
  eingangIso: "2026-07-17T09:00:00.000Z",
  antragsdaten: { antragsteller: { vorname: "Alex", plz: "12345" } },
  status: "eingegangen",
  berechnung: {
    betrag: 50,
    einheit: "EUR",
    label: "Gebühr",
    begruendung: "Standardsatz",
  },
  nachweise: [{ id: "nachweis-1", label: "Nachweis", hochgeladen: false }],
  history: [
    { ts: "2026-07-17T09:00:00.000Z", aktion: "eingegangen", rolle: "buerger" },
  ],
};

describe("createHttpVorgangPersistence", () => {
  it("einreichen POSTet procedureId/version + den fachlichen Rumpf als opake data (OHNE id/status)", async () => {
    const { calls } = stubFetch({
      antragId: "case.server-1",
      procedureId: "musterantrag",
      procedureVersion: "1",
      state: "eingegangen",
      version: 1,
      eingereichtAm: "2026-07-17T09:00:00.000Z",
      abgeschlossenAm: null,
      data: {
        vorgangsnummer: "FV-2026-0006",
        eingangIso: "2026-07-17T09:00:00.000Z",
        antragsdaten: vorgang.antragsdaten,
        berechnung: vorgang.berechnung,
        nachweise: vorgang.nachweise,
        history: vorgang.history,
      },
    });

    const kanonisch = await persistence.einreichen(vorgang);

    // Der Request: eigene Familie, Session-Cookie, der Rumpf in data — id/status NICHT in data.
    expect(calls[0]?.url).toContain("/api/buerger/antraege");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.credentials).toBe("include");
    const body = calls[0]?.body as { data: Record<string, unknown> };
    expect(body.data).not.toHaveProperty("id");
    expect(body.data).not.toHaveProperty("status");
    expect(body.data).toHaveProperty("antragsdaten");
    expect(body.data).toHaveProperty("berechnung");

    // Die Rückgabe trägt die SERVER-id und den Server-Status — nicht die Client-id.
    expect(kanonisch.id).toBe("case.server-1");
    expect(kanonisch.status).toBe("eingegangen");
    expect(kanonisch.berechnung?.betrag).toBe(50);
  });

  it("laden holt die eigenen Anträge und rekonstruiert Vorgänge VERLUSTFREI aus data + id/status", async () => {
    stubFetch({
      antraege: [
        {
          antragId: "case.server-9",
          procedureId: "musterantrag",
          procedureVersion: "1",
          state: "in_pruefung",
          version: 2,
          eingereichtAm: "2026-07-17T09:00:00.000Z",
          abgeschlossenAm: null,
          data: {
            vorgangsnummer: "FV-2026-0006",
            eingangIso: "2026-07-17T09:00:00.000Z",
            antragsdaten: vorgang.antragsdaten,
            berechnung: vorgang.berechnung,
            nachweise: vorgang.nachweise,
            history: vorgang.history,
          },
        },
      ],
    });

    const geladen = await persistence.laden();
    expect(geladen).toHaveLength(1);
    const v = geladen[0]!;
    // id + status kommen vom DTO-Kopf, der Rest aus data — der volle Vorgang ist wieder da.
    expect(v.id).toBe("case.server-9");
    expect(v.status).toBe("in_pruefung");
    expect(v.vorgangsnummer).toBe("FV-2026-0006");
    expect(v.antragsdaten).toEqual(vorgang.antragsdaten);
    expect(v.berechnung).toEqual(vorgang.berechnung);
    expect(v.nachweise).toEqual(vorgang.nachweise);
  });

  it("Round-Trip: was einreichen als data sendet, macht laden wieder zu demselben Vorgang", async () => {
    // Der eigentliche Beweis der Verlustfreiheit: data serverseitig unverändert → identischer Vorgang.
    const { id: _id, status: _status, ...rumpf } = vorgang;
    stubFetch({
      antraege: [
        {
          antragId: "case.rt",
          procedureId: "musterantrag",
          procedureVersion: "1",
          state: vorgang.status,
          version: 1,
          eingereichtAm: vorgang.eingangIso,
          abgeschlossenAm: null,
          data: rumpf,
        },
      ],
    });
    const [wieder] = await persistence.laden();
    expect(wieder).toEqual({ ...vorgang, id: "case.rt" });
  });

  it("wirft CaseRequestError bei Nicht-2xx", async () => {
    stubFetch({ error: "forbidden" }, 403);
    await expect(persistence.einreichen(vorgang)).rejects.toThrow();
  });
});
