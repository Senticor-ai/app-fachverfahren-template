import { describe, it, expect } from "vitest";
import type {
  Bedingung,
  Codeliste,
  FeldDef,
  LeistungConfig,
  StepDef,
  Tarif,
} from "../types.js";
import {
  effektiveBerechnung,
  effektiveNachweise,
  evalBedingung,
  feldFehlerVollstaendig,
  feldRegelFehler,
  interpretNachweise,
  interpretTarif,
  stepGueltigVollstaendig,
} from "./interpreter.js";

// Bewusst VERFAHRENSFREIE Beispieldaten (objekt/posten/kategorie) — der Interpreter ist domänen-agnostisch.
const feld = (
  f: Partial<FeldDef> & Pick<FeldDef, "name" | "typ">,
): FeldDef => ({ label: f.label ?? f.name, ...f });

// ── evalBedingung ─────────────────────────────────────────────────────────────
describe("evalBedingung — generische, typ-tolerante Subsumtion", () => {
  const daten = {
    objekt: { anzahl: 3, kategorie: "premium", aktiv: false },
    kontakt: { plz: "12345" },
  };

  it("fehlende Bedingung ist immer erfüllt (Auffang/Default)", () => {
    expect(evalBedingung(undefined, daten)).toBe(true);
  });

  it("== / != vergleichen typ-tolerant (String-Wert gegen String-Ziel)", () => {
    expect(
      evalBedingung(
        { feld: "objekt.kategorie", op: "==", wert: "premium" },
        daten,
      ),
    ).toBe(true);
    expect(
      evalBedingung(
        { feld: "objekt.kategorie", op: "!=", wert: "premium" },
        daten,
      ),
    ).toBe(false);
  });

  it("numerische Schwellen greifen, auch wenn der Wert als String vorliegt", () => {
    const roh = { objekt: { anzahl: "3" } };
    expect(
      evalBedingung({ feld: "objekt.anzahl", op: ">=", wert: 2 }, roh),
    ).toBe(true);
    expect(
      evalBedingung({ feld: "objekt.anzahl", op: ">", wert: 3 }, roh),
    ).toBe(false);
    expect(
      evalBedingung({ feld: "objekt.anzahl", op: "<=", wert: 3 }, roh),
    ).toBe(true);
    expect(
      evalBedingung({ feld: "objekt.anzahl", op: "<", wert: 3 }, roh),
    ).toBe(false);
  });

  it("gesetzt / nicht-gesetzt prüfen nur Anwesenheit", () => {
    expect(evalBedingung({ feld: "kontakt.plz", op: "gesetzt" }, daten)).toBe(
      true,
    );
    expect(
      evalBedingung({ feld: "kontakt.email", op: "nicht-gesetzt" }, daten),
    ).toBe(true);
    expect(
      evalBedingung({ feld: "kontakt.plz", op: "nicht-gesetzt" }, daten),
    ).toBe(false);
  });

  it("in / nicht-in prüfen Mengenzugehörigkeit", () => {
    expect(
      evalBedingung(
        { feld: "objekt.kategorie", op: "in", wert: ["premium", "spezial"] },
        daten,
      ),
    ).toBe(true);
    expect(
      evalBedingung(
        { feld: "objekt.kategorie", op: "nicht-in", wert: ["standard"] },
        daten,
      ),
    ).toBe(true);
  });

  it("Boolean-Vergleich koerziert false/true korrekt", () => {
    expect(
      evalBedingung({ feld: "objekt.aktiv", op: "==", wert: false }, daten),
    ).toBe(true);
    expect(
      evalBedingung({ feld: "objekt.aktiv", op: "==", wert: true }, daten),
    ).toBe(false);
  });

  it("Gruppen alle/eine/nicht verknüpfen rekursiv", () => {
    const alle: Bedingung = {
      alle: [
        { feld: "objekt.kategorie", op: "==", wert: "premium" },
        { feld: "objekt.anzahl", op: ">=", wert: 3 },
      ],
    };
    expect(evalBedingung(alle, daten)).toBe(true);
    const eine: Bedingung = {
      eine: [
        { feld: "objekt.kategorie", op: "==", wert: "standard" },
        { feld: "objekt.anzahl", op: ">=", wert: 3 },
      ],
    };
    expect(evalBedingung(eine, daten)).toBe(true);
    const nicht: Bedingung = {
      nicht: { feld: "objekt.kategorie", op: "==", wert: "standard" },
    };
    expect(evalBedingung(nicht, daten)).toBe(true);
  });
});

// ── interpretTarif ────────────────────────────────────────────────────────────
describe("interpretTarif — Gebührentabelle als DATEN → Berechnung", () => {
  const tarif: Tarif = {
    einheit: "EUR/Jahr",
    label: "Jahresgebühr",
    staffeln: [
      {
        label: "Premium",
        bedingung: { feld: "objekt.kategorie", op: "==", wert: "premium" },
        betrag: 600,
      },
      {
        label: "Zuschlag",
        bedingung: { feld: "posten.anzahl", op: ">=", wert: 2 },
        betrag: 180,
      },
      { label: "Grundbetrag", betrag: 120 }, // Auffang (keine Bedingung)
    ],
  };

  it("erste-treffende: die ERSTE passende Staffel gilt (Kaskade)", () => {
    const b = interpretTarif(tarif, {
      objekt: { kategorie: "premium" },
      posten: { anzahl: 2 },
    });
    expect(b.betrag).toBe(600);
    expect(b.einheit).toBe("EUR/Jahr");
    expect(b.label).toBe("Jahresgebühr");
    expect(b.status).toBe("final");
    expect(b.positionen).toEqual([{ label: "Premium", betrag: 600 }]);
  });

  it("erste-treffende: fällt bei fehlender Bedingung auf den Auffang zurück", () => {
    const b = interpretTarif(tarif, {
      objekt: { kategorie: "standard" },
      posten: { anzahl: 1 },
    });
    expect(b.betrag).toBe(120);
    expect(b.status).toBe("final");
  });

  it("summe: alle treffenden Staffeln werden addiert", () => {
    const summe: Tarif = { ...tarif, modus: "summe" };
    const b = interpretTarif(summe, {
      objekt: { kategorie: "premium" },
      posten: { anzahl: 2 },
    });
    // Premium (600) + Zuschlag (180) + Grundbetrag-Auffang (120) = 900
    expect(b.betrag).toBe(900);
    expect(b.positionen).toHaveLength(3);
  });

  it("provisional, wenn KEINE Staffel trifft (kein Auffang)", () => {
    const ohneAuffang: Tarif = {
      einheit: "EUR",
      staffeln: [{ bedingung: { feld: "x", op: "==", wert: "y" }, betrag: 5 }],
    };
    const b = interpretTarif(ohneAuffang, {});
    expect(b.status).toBe("provisional");
    expect(b.betrag).toBe(0);
  });
});

// ── interpretNachweise ─────────────────────────────────────────────────────────
describe("interpretNachweise — Nachweise aus codelisten-belege der Auswahl", () => {
  const config: Pick<LeistungConfig, "antrag" | "codelisten"> = {
    antrag: {
      steps: [
        {
          id: "angaben",
          titel: "Angaben",
          felder: [
            feld({
              name: "objekt.kategorie",
              typ: "select",
              optionsRef: "kategorien",
            }),
          ],
        },
      ],
    },
    codelisten: {
      kategorien: {
        id: "kategorien",
        label: "Kategorien",
        eintraege: [
          {
            value: "premium",
            label: "Premium",
            belege: ["Nachweis A", "Nachweis B"],
          },
          { value: "standard", label: "Standard" },
        ],
      },
    },
  };

  it("leitet die belege des gewählten Eintrags als erforderliche Nachweise ab", () => {
    const nw = interpretNachweise(config, { objekt: { kategorie: "premium" } });
    expect(nw.map((n) => n.label)).toEqual(["Nachweis A", "Nachweis B"]);
    expect(nw.every((n) => n.erforderlich && !n.hochgeladen)).toBe(true);
    expect(nw[0]!.id).toBe("nachweis-a"); // stabile Id aus dem Label
  });

  it("keine belege / keine Auswahl → keine Nachweise", () => {
    expect(
      interpretNachweise(config, { objekt: { kategorie: "standard" } }),
    ).toEqual([]);
    expect(interpretNachweise(config, {})).toEqual([]);
  });
});

// ── feldRegelFehler / feldFehlerVollstaendig ────────────────────────────────────
describe("feldRegelFehler — norm-abgeleitete Feldregeln", () => {
  it("bedingte Pflicht (required-wenn): greift nur, wenn `wenn` erfüllt ist", () => {
    const f = feld({
      name: "objekt.nachweis",
      typ: "file",
      regeln: [
        {
          art: "pflicht",
          wenn: { feld: "objekt.kategorie", op: "==", wert: "premium" },
          meldung: "Für Premium ist ein Nachweis Pflicht.",
        },
      ],
    });
    // premium ohne Nachweis → Fehler
    expect(feldRegelFehler(f, { objekt: { kategorie: "premium" } })).toBe(
      "Für Premium ist ein Nachweis Pflicht.",
    );
    // standard ohne Nachweis → kein Fehler (Bedingung nicht erfüllt)
    expect(
      feldRegelFehler(f, { objekt: { kategorie: "standard" } }),
    ).toBeNull();
    // premium MIT Nachweis → kein Fehler
    expect(
      feldRegelFehler(f, {
        objekt: {
          kategorie: "premium",
          nachweis: { name: "beleg.pdf", groesse: 10 },
        },
      }),
    ).toBeNull();
  });

  it("format-Regel prüft ein Pattern (leer bleibt ungeprüft)", () => {
    const f = feld({
      name: "kontakt.plz",
      typ: "text",
      regeln: [{ art: "format", pattern: "^\\d{5}$" }],
    });
    expect(feldRegelFehler(f, { kontakt: { plz: "1234" } })).toBe(
      "Eingabe entspricht nicht dem erwarteten Format.",
    );
    expect(feldRegelFehler(f, { kontakt: { plz: "12345" } })).toBeNull();
    expect(feldRegelFehler(f, { kontakt: {} })).toBeNull();
  });

  it("bereich-Regel prüft inklusive Grenzen", () => {
    const f = feld({
      name: "posten.anzahl",
      typ: "number",
      regeln: [{ art: "bereich", min: 1, max: 5 }],
    });
    expect(feldRegelFehler(f, { posten: { anzahl: 0 } })).toBe("Mindestens 1.");
    expect(feldRegelFehler(f, { posten: { anzahl: 6 } })).toBe("Höchstens 5.");
    expect(feldRegelFehler(f, { posten: { anzahl: 3 } })).toBeNull();
  });

  it("erlaubte-werte inline UND per codelisteRef", () => {
    const inline = feld({
      name: "objekt.kategorie",
      typ: "text",
      regeln: [{ art: "erlaubte-werte", werte: ["standard", "basis"] }],
    });
    expect(
      feldRegelFehler(inline, { objekt: { kategorie: "unbekannt" } }),
    ).toBe("Wert ist nicht zulässig.");
    expect(
      feldRegelFehler(inline, { objekt: { kategorie: "standard" } }),
    ).toBeNull();

    const codeliste: Codeliste = {
      id: "kategorien",
      label: "Kategorien",
      eintraege: [{ value: "standard", label: "Standard" }],
    };
    const perRef = feld({
      name: "objekt.kategorie",
      typ: "text",
      regeln: [{ art: "erlaubte-werte", codelisteRef: "kategorien" }],
    });
    expect(
      feldRegelFehler(
        perRef,
        { objekt: { kategorie: "unbekannt" } },
        { codelisten: { kategorien: codeliste } },
      ),
    ).toBe("Wert ist nicht zulässig.");
    expect(
      feldRegelFehler(
        perRef,
        { objekt: { kategorie: "standard" } },
        { codelisten: { kategorien: codeliste } },
      ),
    ).toBeNull();
  });

  it("feldFehlerVollstaendig bündelt Kurzform (required) UND Regeln", () => {
    const f = feld({
      name: "kontakt.plz",
      typ: "text",
      required: true,
      regeln: [{ art: "format", pattern: "^\\d{5}$" }],
    });
    // required schlägt zuerst
    expect(feldFehlerVollstaendig(f, { kontakt: {} })).toBe(
      "Pflichtangabe — bitte ausfüllen.",
    );
    // dann die Regel
    expect(feldFehlerVollstaendig(f, { kontakt: { plz: "12" } })).toBe(
      "Eingabe entspricht nicht dem erwarteten Format.",
    );
    expect(feldFehlerVollstaendig(f, { kontakt: { plz: "12345" } })).toBeNull();
  });

  it("stepGueltigVollstaendig ist erst gültig, wenn alle Felder (inkl. Regeln) passen", () => {
    const step: StepDef = {
      id: "s",
      titel: "S",
      felder: [
        feld({ name: "objekt.kategorie", typ: "text" }),
        feld({
          name: "objekt.nachweis",
          typ: "file",
          regeln: [
            {
              art: "pflicht",
              wenn: { feld: "objekt.kategorie", op: "==", wert: "premium" },
            },
          ],
        }),
      ],
    };
    expect(
      stepGueltigVollstaendig(step, { objekt: { kategorie: "premium" } }),
    ).toBe(false);
    expect(
      stepGueltigVollstaendig(step, { objekt: { kategorie: "standard" } }),
    ).toBe(true);
  });
});

// ── Escape-Hatch-Auflösung ──────────────────────────────────────────────────────
describe("effektiveBerechnung — berechne (Escape-Hatch) ODER tarif (Default)", () => {
  const tarif: Tarif = {
    einheit: "EUR",
    staffeln: [{ label: "Pauschal", betrag: 42 }],
  };

  it("berechne hat Vorrang, wenn gesetzt", () => {
    const config = {
      berechne: () => ({
        betrag: 7,
        einheit: "EUR",
        label: "Custom",
        begruendung: "Escape-Hatch",
        status: "final" as const,
      }),
      tarif,
    };
    expect(effektiveBerechnung(config, {})!.betrag).toBe(7);
  });

  it("fällt auf tarif zurück, wenn berechne fehlt (Default = Daten-Auswertung)", () => {
    expect(effektiveBerechnung({ tarif }, {})!.betrag).toBe(42);
  });

  it("undefined, wenn weder berechne noch tarif deklariert ist", () => {
    expect(effektiveBerechnung({}, {})).toBeUndefined();
  });

  it("ein fehlerhafter berechne-Escape-Hatch crasht nicht", () => {
    const config = {
      berechne: () => {
        throw new Error("kaputt");
      },
    };
    expect(effektiveBerechnung(config, {})).toBeUndefined();
  });
});

describe("effektiveNachweise — nachweise (Escape-Hatch) ODER codelisten (Default)", () => {
  const codelisten = {
    kategorien: {
      id: "kategorien",
      label: "Kategorien",
      eintraege: [
        { value: "premium", label: "Premium", belege: ["Nachweis A"] },
      ],
    },
  };
  const antrag = {
    steps: [
      {
        id: "s",
        titel: "S",
        felder: [
          feld({
            name: "objekt.kategorie",
            typ: "select",
            optionsRef: "kategorien",
          }),
        ],
      },
    ],
  };

  it("nachweise-Funktion hat Vorrang", () => {
    const config = {
      antrag,
      codelisten,
      nachweise: () => [{ id: "x", label: "Custom", hochgeladen: false }],
    };
    expect(
      effektiveNachweise(config, { objekt: { kategorie: "premium" } })[0]!
        .label,
    ).toBe("Custom");
  });

  it("leitet sonst aus codelisten ab (Default)", () => {
    const nw = effektiveNachweise(
      { antrag, codelisten },
      { objekt: { kategorie: "premium" } },
    );
    expect(nw.map((n) => n.label)).toEqual(["Nachweis A"]);
  });
});
