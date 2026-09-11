// bedingung-operator — EIN UNBEKANNTER OPERATOR WAR AUF DAUER FALSCH, UND ZWAR LAUTLOS.
//
// Gemessen an drei generierten Verfahren (2026-08-30/31): `op: "="` achtmal, `op: "eq"` je dreimal.
// Beides ist kein `BedingungOperator`. Der Compiler faengt es (tsc2322) — aber `vite build` streicht
// Typen, statt sie zu pruefen: die Anwendung STARTET und wertet die Bedingung von da an als `false`.
// Ein `sichtbarWenn` blendet dann ein Feld dauerhaft aus, ein `pflichtWenn` fordert nie, ein
// Uebergangs-Guard sperrt lautlos. Nichts davon ist an der Oberflaeche sichtbar.
//
// Dieser Zeuge haelt DREI Dinge fest: (1) der unbekannte Operator wirft und nennt seine Abhilfe,
// (2) jeder ERLAUBTE Operator wertet weiterhin normal aus (der Wurf ist keine Ueberblockung),
// (3) Konstante und Union sind deckungsgleich — die Doppelung ist Absicht (der CHOS-Parser braucht die
// Literal-Form), aber sie darf nicht auseinanderlaufen.
import { describe, expect, it } from "vitest";
import {
  BEDINGUNG_OPERATOREN,
  evalBedingung,
  type BedingungOperator,
} from "./rules.js";

const daten = { a: "x", n: 3, leer: "" };

describe("BedingungOperator — unbekannt heisst nicht falsch, sondern unauswertbar", () => {
  it("ein unbekannter Operator WIRFT und nennt Feld, Wert und die erlaubte Menge", () => {
    let fehler: Error | null = null;
    try {
      evalBedingung(
        { feld: "a", op: "eq" as BedingungOperator, wert: "x" },
        daten,
      );
    } catch (e) {
      fehler = e as Error;
    }
    expect(fehler, "der frueher stille Zweig muss jetzt werfen").not.toBeNull();
    const m = String(fehler?.message);
    expect(m).toContain('"eq"'); // was geschrieben wurde
    expect(m).toContain('"=="'); // was gemeint sein koennte
    expect(m).toContain('"nicht-gesetzt"'); // die Menge ist VOLLSTAENDIG genannt
    expect(m).toContain("a"); // an welchem Feld
  });

  it("dasselbe fuer die historisch haeufigste Form `=`", () => {
    expect(() =>
      evalBedingung(
        { feld: "a", op: "=" as BedingungOperator, wert: "x" },
        daten,
      ),
    ).toThrow();
  });

  it("KEINE UEBERBLOCKUNG: jeder erlaubte Operator wertet aus, ohne zu werfen", () => {
    // POSITIV-KONTROLLE ueber die GANZE Menge — sonst waere «wirft nicht» eine Aussage ueber einen Wert.
    for (const op of BEDINGUNG_OPERATOREN) {
      const b = {
        feld: op === "in" || op === "nicht-in" ? "a" : "n",
        op,
        wert: op === "in" || op === "nicht-in" ? ["x"] : 3,
      };
      expect(
        () => evalBedingung(b, daten),
        `Operator "${op}" darf nicht werfen`,
      ).not.toThrow();
    }
    // Und die Semantik steht weiterhin (der Wurf hat den Schalter nicht verstellt).
    expect(evalBedingung({ feld: "a", op: "==", wert: "x" }, daten)).toBe(true);
    expect(evalBedingung({ feld: "a", op: "!=", wert: "x" }, daten)).toBe(
      false,
    );
    expect(evalBedingung({ feld: "leer", op: "nicht-gesetzt" }, daten)).toBe(
      true,
    );
  });

  it("eine FEHLENDE Bedingung bleibt neutral erfuellt — der Wurf gilt nur dem falschen Operator", () => {
    expect(evalBedingung(undefined, daten)).toBe(true);
    expect(evalBedingung({ alle: [] }, daten)).toBe(true);
  });

  it("Konstante und Union sind deckungsgleich (die Doppelung ist Absicht, kein Drift)", () => {
    // Die Typ-Ebene haelt beide Richtungen bereits; hier steht die Zahl, damit ein Leser sie sieht.
    expect(new Set(BEDINGUNG_OPERATOREN).size).toBe(
      BEDINGUNG_OPERATOREN.length,
    );
    expect(BEDINGUNG_OPERATOREN).toContain("==");
    expect(BEDINGUNG_OPERATOREN).toContain("nicht-gesetzt");
    expect(BEDINGUNG_OPERATOREN.length).toBe(10);
  });
});
