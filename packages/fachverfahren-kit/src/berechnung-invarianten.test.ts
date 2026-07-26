// berechnung-invarianten.test — GEGENPROBE + ÜBERBLOCKUNGS-SUITE der Berechnungs-Invarianten (Phase 5, W4).
//
// Die ROTEN Fixtures sind die ECHTEN, im adversarialen Fachaudit gemessenen Werte des generierten
// Grundsteuer-Verfahrens (durch ausgeführten Code belegt, nicht nachempfunden):
//   • ohne Minderung 350 EUR / mit 10 %-Baudenkmal-Minderung ebenfalls 350 EUR — Differenz 0,
//     obwohl die Positionstabelle „Minderung (10 %) = -9.999999999999998" auswies;
//   • Positionssumme 469 gegen Festsetzung 350;
//   • Float-Artefakt -9.999999999999998 im Bescheid.
// Fällt eine dieser Fixtures NICHT, ist das Prädikat wertlos — deshalb stehen sie hier dauerhaft.
//
// Die GRÜNEN Fixtures sind die Überblockungs-Probe: legitime Fälle MÜSSEN durchlaufen.
import { describe, expect, it } from "vitest";

import {
  pruefeCentFormat,
  pruefeSumme,
  pruefeWirkung,
  type BerechnungsForm,
} from "./berechnung-invarianten.js";

// ── ROT: der reale Vorher-Stand des Grundsteuer-Verfahrens ─────────────────────────────────────────────────
const ohneMinderung: BerechnungsForm = {
  betrag: 350,
  status: "final",
  positionen: [
    { label: "Steuermessbetrag (0.31 Promille)", betrag: 100 },
    { label: "Grundsteuer-Jahresbetrag (Hebesatz 350%)", betrag: 350 },
    { label: "Monatsbetrag (1/12)", betrag: 29 },
  ],
};
const mitMinderung: BerechnungsForm = {
  betrag: 350, // ← der Defekt: identisch, obwohl eine Minderung ausgewiesen wird
  status: "final",
  positionen: [
    { label: "Steuermessbetrag (0.31 Promille)", betrag: 100 },
    { label: "Grundsteuer-Jahresbetrag (Hebesatz 350%)", betrag: 350 },
    { label: "Minderung (10%)", betrag: -9.999999999999998 },
    { label: "Monatsbetrag (1/12)", betrag: 29 },
  ],
};

describe("W4-Invarianten — GEGENPROBE gegen den realen Audit-Befund", () => {
  it("WIRKUNG: die ausgewiesene Minderung ohne Wirkung auf den Tenor wird ERKANNT", () => {
    const befunde = pruefeWirkung(
      ohneMinderung,
      mitMinderung,
      "Feld anliegen.ermaessigungstatbestand",
    );
    expect(befunde).toHaveLength(1);
    expect(befunde[0]!.invariante).toBe("wirkung");
    expect(befunde[0]!.meldung).toMatch(/widerspricht sich selbst/);
  });

  it("SUMME: Positionssumme 469 gegen Festsetzung 350 wird ERKANNT", () => {
    const befunde = pruefeSumme(mitMinderung);
    expect(befunde).toHaveLength(1);
    expect(befunde[0]!.meldung).toMatch(/469/);
    expect(befunde[0]!.meldung).toMatch(/§ 157 Abs. 1 S. 2 AO/);
  });

  it("CENT-FORMAT: das Float-Artefakt -9.999999999999998 wird ERKANNT", () => {
    const befunde = pruefeCentFormat(mitMinderung);
    expect(befunde).toHaveLength(1);
    expect(befunde[0]!.invariante).toBe("cent-format");
  });
});

// ── GRÜN: die Überblockungs-Probe (kein zehnter Falsch-Blocker) ────────────────────────────────────────────
describe("W4-Invarianten — ÜBERBLOCKUNG: legitime Fälle bleiben grün", () => {
  const korrektOhne: BerechnungsForm = {
    betrag: 350,
    status: "final",
    positionen: [
      { label: "Grundbetrag", betrag: 300 },
      { label: "Zuschlag", betrag: 50 },
    ],
  };
  const korrektMit: BerechnungsForm = {
    betrag: 315,
    status: "final",
    positionen: [
      { label: "Grundbetrag", betrag: 300 },
      { label: "Zuschlag", betrag: 50 },
      { label: "Minderung 10 %", betrag: -35 },
    ],
  };

  it("eine WIRKSAME Minderung erzeugt keinen Befund", () => {
    expect(pruefeWirkung(korrektOhne, korrektMit)).toEqual([]);
    expect(pruefeSumme(korrektMit)).toEqual([]);
    expect(pruefeCentFormat(korrektMit)).toEqual([]);
  });

  it("ein VORLÄUFIGES Ergebnis (status provisional) löst nichts aus", () => {
    const vorlaeufig: BerechnungsForm = {
      ...mitMinderung,
      status: "provisional",
    };
    expect(pruefeSumme(vorlaeufig)).toEqual([]);
    expect(pruefeWirkung(vorlaeufig, mitMinderung)).toEqual([]);
  });

  it("EINE zusammenfassende Position (keine Aufschlüsselung) löst die Summen-Invariante nicht aus", () => {
    expect(
      pruefeSumme({
        betrag: 120,
        status: "final",
        positionen: [{ label: "Gebühr", betrag: 120 }],
      }),
    ).toEqual([]);
  });

  it("Verfahren OHNE Positionen (reine Feststellung/Festgebühr) laufen leer-grün durch", () => {
    const ohnePositionen: BerechnungsForm = {
      betrag: 0,
      status: "final",
      positionen: [],
    };
    expect(pruefeSumme(ohnePositionen)).toEqual([]);
    expect(pruefeWirkung(ohnePositionen, ohnePositionen)).toEqual([]);
    expect(pruefeCentFormat(ohnePositionen)).toEqual([]);
  });

  it("reine LABEL-Änderung ohne Geld-Wirkung erzeugt keinen Wirkungs-Befund", () => {
    const a: BerechnungsForm = {
      betrag: 100,
      status: "final",
      positionen: [{ label: "Gebühr (Variante A)", betrag: 100 }],
    };
    const b: BerechnungsForm = {
      betrag: 100,
      status: "final",
      positionen: [{ label: "Gebühr (Variante B)", betrag: 100 }],
    };
    expect(pruefeWirkung(a, b)).toEqual([]);
  });

  it("nicht-numerische Positionsbeträge führen zu KEINER Aussage (statt zu einem Falsch-Blocker)", () => {
    expect(
      pruefeSumme({
        betrag: 100,
        status: "final",
        positionen: [
          { label: "A", betrag: "auf Antrag" },
          { label: "B", betrag: 100 },
        ],
      }),
    ).toEqual([]);
  });
});
