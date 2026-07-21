// antrag-client.browser.test — die HTTP-Persistenz-Naht gegen MSW-MOCKDATEN im ECHTEN Browser (test:browser,
// Chromium). MSW (`setupWorker`, Service-Worker aus public/mockServiceWorker.js) fängt die relativen
// `/api/buerger/antraege`-fetches ab (relative URLs lösen im Browser gegen den Test-Origin auf) und liefert
// synthetische Antworten — so ist der reale Client (fetch + DTO→Vorgang-Mapping) OHNE laufenden Server testbar.
import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHttpVorgangPersistence } from "./antrag-client.js";

const worker = setupWorker();

beforeAll(async () => {
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
});
afterEach(() => worker.resetHandlers());
afterAll(() => worker.stop());

describe("antrag-client gegen MSW-Mockdaten (echter Browser)", () => {
  it("lädt + mappt die eigenen Anträge aus der gemockten API", async () => {
    worker.use(
      http.get("/api/buerger/antraege", () =>
        HttpResponse.json({
          antraege: [
            {
              antragId: "case.msw-1",
              procedureId: "musterantrag",
              procedureVersion: "1",
              state: "eingegangen",
              version: 1,
              eingereichtAm: "2026-01-01T00:00:00.000Z",
              abgeschlossenAm: null,
              data: { history: [], nachweise: [], vorgangsnummer: "V-MSW-1" },
            },
          ],
        }),
      ),
    );
    const persistence = createHttpVorgangPersistence({
      procedureId: "musterantrag",
      procedureVersion: "1",
    });
    const vorgaenge = await persistence.laden();
    expect(vorgaenge).toHaveLength(1);
    expect(vorgaenge[0]?.id).toBe("case.msw-1");
    expect(vorgaenge[0]?.status).toBe("eingegangen");
    // Defensive Mapping-Garantie: history/nachweise sind IMMER Arrays (siehe toVorgang).
    expect(Array.isArray(vorgaenge[0]?.history)).toBe(true);
  });

  it("ein Server-Fehler (500) schlägt als Fehler durch (kein stiller Leer-Zustand)", async () => {
    worker.use(
      http.get(
        "/api/buerger/antraege",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const persistence = createHttpVorgangPersistence({
      procedureId: "musterantrag",
      procedureVersion: "1",
    });
    await expect(persistence.laden()).rejects.toThrow();
  });
});
