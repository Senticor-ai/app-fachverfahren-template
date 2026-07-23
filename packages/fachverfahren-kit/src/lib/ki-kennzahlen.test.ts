import { describe, expect, it } from "vitest";
import { kiBezugText, kiKennzahlen } from "./ki-kennzahlen.js";
import type { KiEinschaetzung, Vorgang } from "../types.js";

// Minimaler Vorgang — nur die Felder, die die Aggregation liest. `ki` bleibt weg, wenn nicht bewertet
// (exactOptionalPropertyTypes: NICHT `ki: undefined` setzen, sondern das Feld auslassen).
function v(ki?: KiEinschaetzung): Vorgang {
  return {
    id: "v-1",
    vorgangsnummer: "VG-1",
    eingangIso: "2026-01-01T00:00:00.000Z",
    antragsdaten: {},
    status: "eingegangen",
    nachweise: [],
    history: [],
    ...(ki ? { ki } : {}),
  };
}

describe("kiKennzahlen", () => {
  it("meldet KEINE KI-Aktivität, wenn kein Vorgang bewertet ist", () => {
    // Der Regressionsfall: ein Bestand OHNE gebundenes Modell. Früher schrieb der Einreiche-Pfad hart
    // `confidence: 0` — daraus wurde „Ø KI-Konfidenz 0 %", was wie ein Messwert aussieht („die KI war
    // sich zu 0 % sicher") statt wie die Wahrheit („es lief keine KI").
    const k = kiKennzahlen([v(), v(), v()], 0.9);
    expect(k.aktiv).toBe(false);
    expect(k.total).toBe(3);
    expect(k.bewertet).toBe(0);
    expect(kiBezugText(k)).toBe("kein KI-Modell aktiv");
  });

  it("bezieht Quoten auf die BEWERTETEN, nicht auf den Gesamtbestand", () => {
    // 2 von 4 bewertet, beide autonom-fähig. Bezug „bewertet" → 100 %; der alte Bezug „total" hätte
    // 50 % gemeldet und die zwei unbewerteten als „nicht autonom-fähig" gegen die KI gewertet.
    const k = kiKennzahlen(
      [
        v({ confidence: 0.95, flags: [] }),
        v({ confidence: 0.99, flags: [] }),
        v(),
        v(),
      ],
      0.9,
    );
    expect(k.bewertet).toBe(2);
    expect(k.total).toBe(4);
    expect(k.autonomQuote).toBe(1);
    expect(kiBezugText(k)).toBe("2 von 4 bewertet");
  });

  it("verwässert die Ø-Konfidenz NICHT mit unbewerteten Vorgängen", () => {
    // Genau der gemeldete Defekt: Ø über [0.8] ist 0.8 — NICHT 0.8/3 = 0.27, wie es herauskäme, wenn
    // die zwei unbewerteten Vorgänge als 0 in die Summe eingingen.
    const k = kiKennzahlen([v({ confidence: 0.8, flags: [] }), v(), v()], 0.9);
    expect(k.avgConfidence).toBeCloseTo(0.8, 10);
  });

  it("zählt einen bewerteten Vorgang mit Flags als Review-Indikator, nie als autonom-fähig", () => {
    const k = kiKennzahlen(
      [
        v({ confidence: 0.99, flags: ["nachweis_fehlt"] }),
        v({ confidence: 0.95, flags: [] }),
      ],
      0.9,
    );
    // Hohe Konfidenz MIT Flag ist nicht autonom-fähig — Flags sind ein hartes Veto.
    expect(k.autonomFaehig).toBe(1);
    expect(k.mitFlags).toBe(1);
    expect(k.flagQuote).toBe(0.5);
  });

  it("wertet Konfidenz GENAU auf der Schwelle als autonom-fähig (Grenze inklusiv)", () => {
    expect(
      kiKennzahlen([v({ confidence: 0.9, flags: [] })], 0.9).autonomFaehig,
    ).toBe(1);
  });

  it("bleibt bei leerem Bestand bezugslos statt 0 %", () => {
    const k = kiKennzahlen([], 0.9);
    expect(k.aktiv).toBe(false);
    expect(k.total).toBe(0);
  });
});
