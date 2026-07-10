import { describe, it, expect } from "vitest";
import {
  bedingungUnterstuetzt,
  evalBedingungNodeSafe,
} from "./automation-eval.js";

// Diese Erwartungen spiegeln die Semantik von `BedingungOperator`/`evalBedingung` im Kit (types.ts:380 ff.).
describe("evalBedingungNodeSafe — Blatt-Operatoren", () => {
  const daten = {
    betrag: 500,
    status: "offen",
    kategorie: "A",
    leer: "",
    tags: ["eilig", "wohngeld"],
  };

  it("Vergleiche ==/!=", () => {
    expect(
      evalBedingungNodeSafe({ feld: "status", op: "==", wert: "offen" }, daten),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe({ feld: "status", op: "!=", wert: "zu" }, daten),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe({ feld: "status", op: "==", wert: "zu" }, daten),
    ).toBe(false);
  });

  it("numerische Schwellen >/>=/</<= (mit String-Koerzierung)", () => {
    expect(
      evalBedingungNodeSafe({ feld: "betrag", op: ">=", wert: 500 }, daten),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe({ feld: "betrag", op: ">", wert: 500 }, daten),
    ).toBe(false);
    expect(
      evalBedingungNodeSafe({ feld: "betrag", op: "<", wert: "1000" }, daten),
    ).toBe(true);
    // Nicht-Zahl gegen numerischen Operator ⇒ false.
    expect(
      evalBedingungNodeSafe({ feld: "status", op: ">", wert: 3 }, daten),
    ).toBe(false);
  });

  it("Mengen in/nicht-in", () => {
    expect(
      evalBedingungNodeSafe(
        { feld: "kategorie", op: "in", wert: ["A", "B"] },
        daten,
      ),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe(
        { feld: "kategorie", op: "nicht-in", wert: ["B", "C"] },
        daten,
      ),
    ).toBe(true);
  });

  it("gesetzt/nicht-gesetzt (Anwesenheit)", () => {
    expect(
      evalBedingungNodeSafe({ feld: "status", op: "gesetzt" }, daten),
    ).toBe(true);
    expect(evalBedingungNodeSafe({ feld: "leer", op: "gesetzt" }, daten)).toBe(
      false,
    );
    expect(
      evalBedingungNodeSafe({ feld: "fehlt", op: "nicht-gesetzt" }, daten),
    ).toBe(true);
  });
});

describe("evalBedingungNodeSafe — Gruppen (alle/eine/nicht)", () => {
  const daten = { betrag: 800, status: "offen" };

  it("UND (alle)", () => {
    expect(
      evalBedingungNodeSafe(
        {
          alle: [
            { feld: "betrag", op: ">=", wert: 500 },
            { feld: "status", op: "==", wert: "offen" },
          ],
        },
        daten,
      ),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe(
        {
          alle: [
            { feld: "betrag", op: ">=", wert: 500 },
            { feld: "status", op: "==", wert: "zu" },
          ],
        },
        daten,
      ),
    ).toBe(false);
  });

  it("ODER (eine) + NICHT (nicht)", () => {
    expect(
      evalBedingungNodeSafe(
        {
          eine: [
            { feld: "status", op: "==", wert: "zu" },
            { feld: "betrag", op: ">", wert: 100 },
          ],
        },
        daten,
      ),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe(
        { nicht: { feld: "status", op: "==", wert: "zu" } },
        daten,
      ),
    ).toBe(true);
  });

  it("fehlende Bedingung ⇒ erfüllt (undefined/null)", () => {
    expect(evalBedingungNodeSafe(undefined, daten)).toBe(true);
    expect(evalBedingungNodeSafe(null, daten)).toBe(true);
  });
});

describe("Kit-Parität der Koerzierung (Regel entscheidet server-seitig wie im Client)", () => {
  it("de-DE-Dezimalkomma wird zur Zahl (kein falsches Feuern unter Negation)", () => {
    // Wie der Kit: nur Dezimalkomma, KEIN Tausender-Trennzeichen (Number("1234,50".replace) → 1234.5).
    const daten = { betrag: "1234,50" };
    expect(
      evalBedingungNodeSafe({ feld: "betrag", op: ">", wert: "1000" }, daten),
    ).toBe(true);
    // "3,5" > 3 muss numerisch greifen, nicht als NaN → false.
    expect(
      evalBedingungNodeSafe({ feld: "x", op: ">=", wert: 3 }, { x: "3,5" }),
    ).toBe(true);
    // Unter != darf ein de-DE-Wert NICHT fälschlich als „ungleich" feuern.
    expect(
      evalBedingungNodeSafe({ feld: "x", op: "!=", wert: 3.5 }, { x: "3,5" }),
    ).toBe(false);
  });

  it("Boolean-Koerzierung: 'ja'/'true'/1 == true", () => {
    expect(
      evalBedingungNodeSafe(
        { feld: "flag", op: "==", wert: true },
        { flag: "ja" },
      ),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe(
        { feld: "flag", op: "==", wert: true },
        { flag: "1" },
      ),
    ).toBe(true);
    // 'nein' ist nicht true → unter != feuert es NICHT fälschlich.
    expect(
      evalBedingungNodeSafe(
        { feld: "flag", op: "!=", wert: true },
        { flag: "nein" },
      ),
    ).toBe(true);
  });

  it("gesetzt/nicht-gesetzt: Array/Objekt zählen wie im Kit NICHT als gesetzt", () => {
    // asString eines Nicht-Datei-Objekts/Arrays = "" → gesetzt=false.
    expect(evalBedingungNodeSafe({ feld: "a", op: "gesetzt" }, { a: [] })).toBe(
      false,
    );
    expect(
      evalBedingungNodeSafe({ feld: "a", op: "gesetzt" }, { a: ["x"] }),
    ).toBe(false);
    expect(
      evalBedingungNodeSafe({ feld: "a", op: "gesetzt" }, { a: { k: 1 } }),
    ).toBe(false);
    // Ein Datei-Wert {name,groesse} zählt als gesetzt.
    expect(
      evalBedingungNodeSafe(
        { feld: "a", op: "gesetzt" },
        { a: { name: "n.pdf", groesse: 10 } },
      ),
    ).toBe(true);
  });

  it("in/nicht-in akzeptieren auch einen Skalar-Vergleichswert (alsMenge)", () => {
    expect(
      evalBedingungNodeSafe({ feld: "k", op: "in", wert: "A" }, { k: "A" }),
    ).toBe(true);
    expect(
      evalBedingungNodeSafe({ feld: "k", op: "in", wert: "B" }, { k: "A" }),
    ).toBe(false);
  });
});

describe("Fail-closed gegen unbekannte Formen", () => {
  it("unbekannter Operator ⇒ false + nicht unterstützt", () => {
    expect(
      evalBedingungNodeSafe({ feld: "x", op: "regex", wert: ".*" }, {}),
    ).toBe(false);
    expect(bedingungUnterstuetzt({ feld: "x", op: "regex", wert: ".*" })).toBe(
      false,
    );
  });
  it("unbekannte Objektform ⇒ false + nicht unterstützt", () => {
    expect(evalBedingungNodeSafe({ irgendwas: true }, {})).toBe(false);
    expect(bedingungUnterstuetzt({ irgendwas: true })).toBe(false);
  });
  it("unterstützte Formen werden erkannt", () => {
    expect(bedingungUnterstuetzt({ feld: "a", op: "==", wert: 1 })).toBe(true);
    expect(
      bedingungUnterstuetzt({ alle: [{ feld: "a", op: ">", wert: 1 }] }),
    ).toBe(true);
    expect(bedingungUnterstuetzt(undefined)).toBe(true);
  });
});
