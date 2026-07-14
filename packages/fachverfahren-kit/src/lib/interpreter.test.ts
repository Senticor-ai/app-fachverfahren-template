import { describe, it, expect } from "vitest";
import type {
  Bedingung,
  Codeliste,
  FeldDef,
  LeistungConfig,
  Nachweis,
  StepDef,
  Tarif,
} from "../types.js";
import {
  abgeleiteteFelder,
  effektiveBerechnung,
  effektiveNachweise,
  evalBedingung,
  feldFehlerVollstaendig,
  feldHinweise,
  feldRegelFehler,
  interpretNachweise,
  interpretTarif,
  istRegisterAbruf,
  nachweisBezugsweg,
  sichtbareSchritte,
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

  it("== gegen amtliche Code-Strings mit führender Null kollabiert NICHT numerisch (01 ≠ 1)", () => {
    // Regression: gleich koerzierte „1"/„01" beide zu 1 → fail-open. Amtliche Schlüssel (Bundesland 01–16, AGS)
    // müssen strikt als String verglichen werden — konsistent zu interpretNachweise/feldAnzeige.
    expect(
      evalBedingung({ feld: "land", op: "==", wert: "01" }, { land: "1" }),
    ).toBe(false);
    expect(
      evalBedingung({ feld: "land", op: "==", wert: "01" }, { land: "01" }),
    ).toBe(true);
    expect(
      evalBedingung(
        { feld: "land", op: "in", wert: ["01", "02"] },
        { land: "1" },
      ),
    ).toBe(false);
    // Echte Quantitäten bleiben typ-tolerant (String-Formularwert gegen Zahl-Ziel).
    expect(evalBedingung({ feld: "n", op: "==", wert: 2 }, { n: "2" })).toBe(
      true,
    );
    expect(
      evalBedingung({ feld: "n", op: "==", wert: 1.5 }, { n: "1,5" }),
    ).toBe(true);
  });

  it("== false trifft NICHT auf ein fehlendes/unbeantwortetes Feld (undefined ≠ false)", () => {
    // Regression: gleich(undefined,false) war true → ein unbeantworteter Tatbestand erfüllte „== false" und
    // erzeugte ein verfrühtes „final"/0-€-Ergebnis. Ein fehlendes Feld ist weder Ja noch Nein.
    expect(
      evalBedingung({ feld: "objekt.gewerblich", op: "==", wert: false }, {}),
    ).toBe(false);
    expect(
      evalBedingung({ feld: "objekt.gewerblich", op: "==", wert: true }, {}),
    ).toBe(false);
    // Ein ANWESENDES false erfüllt „== false" weiterhin korrekt.
    expect(
      evalBedingung(
        { feld: "objekt.aktiv", op: "==", wert: false },
        { objekt: { aktiv: false } },
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

// ── feldHinweise (weiche, nicht sperrende Plausibilitäts-Hinweise) ───────────────
describe("feldHinweise — bedingte, nicht sperrende Hinweise", () => {
  it("liefert nur die Hinweise, deren `wenn` erfüllt ist (Bedingung über die Antragsdaten)", () => {
    const f = feld({
      name: "posten.anzahl",
      typ: "number",
      hinweise: [
        {
          wenn: { feld: "posten.anzahl", op: ">", wert: 10 },
          text: "Ungewöhnlich hoch — bitte prüfen.",
          ton: "warn",
        },
        { text: "Immer sichtbarer Hinweis." },
      ],
    });
    // anzahl 12 → beide Hinweise (bedingter + unbedingter)
    const aktiv = feldHinweise(f, { posten: { anzahl: 12 } });
    expect(aktiv.map((h) => h.text)).toEqual([
      "Ungewöhnlich hoch — bitte prüfen.",
      "Immer sichtbarer Hinweis.",
    ]);
    expect(aktiv[0]!.ton).toBe("warn");
    expect(aktiv[1]!.ton).toBe("info"); // Default-Ton
  });

  it("blendet den bedingten Hinweis aus, wenn `wenn` nicht erfüllt ist", () => {
    const f = feld({
      name: "posten.anzahl",
      typ: "number",
      hinweise: [
        {
          wenn: { feld: "posten.anzahl", op: ">", wert: 10 },
          text: "Ungewöhnlich hoch — bitte prüfen.",
        },
      ],
    });
    expect(feldHinweise(f, { posten: { anzahl: 3 } })).toEqual([]);
  });

  it("Hinweise sind NICHT sperrend (feldFehlerVollstaendig bleibt unberührt)", () => {
    const f = feld({
      name: "posten.anzahl",
      typ: "number",
      hinweise: [{ text: "Nur ein Hinweis." }],
    });
    // trotz aktivem Hinweis kein Fehler → der Antrag wird nicht blockiert
    expect(feldFehlerVollstaendig(f, { posten: { anzahl: 999 } })).toBeNull();
    expect(feldHinweise(f, { posten: { anzahl: 999 } })).toHaveLength(1);
  });

  it("ein Feld ohne `hinweise` liefert eine leere Liste", () => {
    const f = feld({ name: "x", typ: "text" });
    expect(feldHinweise(f, {})).toEqual([]);
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
        positionen: [],
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

// ── M1: abgeleiteteFelder (Codelisten-Merkmal → Antragsfeld, VOR der Berechnung) ─────────────────
describe("abgeleiteteFelder — M1 Codelisten-Merkmal in ein Zielfeld projizieren", () => {
  const config: Pick<LeistungConfig, "antrag" | "codelisten"> = {
    antrag: {
      steps: [
        {
          id: "s",
          titel: "S",
          felder: [
            feld({ name: "tier.art", typ: "select", optionsRef: "arten" }),
          ],
        },
      ],
    },
    codelisten: {
      arten: {
        id: "arten",
        label: "Arten",
        ableitungen: [
          {
            ausMerkmal: "markiert",
            setzeFeld: "tier.istMarkiert",
            default: false,
          },
        ],
        eintraege: [
          { value: "a", label: "A", merkmale: { markiert: true } },
          { value: "b", label: "B" }, // kein Merkmal → default greift
        ],
      },
    },
  };

  it("schreibt das Merkmal des GEWÄHLTEN Eintrags in das Zielfeld (ersetzt manuelles Flag)", () => {
    expect(abgeleiteteFelder(config, { tier: { art: "a" } })).toEqual({
      tier: { art: "a", istMarkiert: true },
    });
  });

  it("fällt auf den default zurück, wenn der Eintrag das Merkmal nicht trägt", () => {
    expect(abgeleiteteFelder(config, { tier: { art: "b" } })).toEqual({
      tier: { art: "b", istMarkiert: false },
    });
  });

  it("setzt den default auch OHNE Auswahl (Normalfall) und ist IDEMPOTENT", () => {
    const einmal = abgeleiteteFelder(config, {});
    expect(einmal).toEqual({ tier: { istMarkiert: false } });
    expect(abgeleiteteFelder(config, einmal)).toEqual(einmal);
  });

  it("ohne `ableitungen` bleiben die Daten unverändert (rückwärtskompatibel, gleiche Referenz)", () => {
    const ohne: Pick<LeistungConfig, "antrag" | "codelisten"> = {
      antrag: { steps: [] },
    };
    const daten = { x: 1 };
    expect(abgeleiteteFelder(ohne, daten)).toBe(daten);
  });
});

// ── M3: sichtbareSchritte (progressive disclosure + Rollen-Ordnung) ─────────────────────────────
describe("sichtbareSchritte — M3 Filterung + kontext-zuerst", () => {
  it("zieht rolle:kontext nach vorne, pruefung ans Ende (sonst stabil)", () => {
    const steps: StepDef[] = [
      { id: "erhebung", titel: "Erhebung", felder: [] },
      { id: "kontext", titel: "Vorgangsart", rolle: "kontext", felder: [] },
      { id: "abschluss", titel: "Abschluss", rolle: "pruefung", felder: [] },
    ];
    expect(sichtbareSchritte(steps, {}).map((s) => s.id)).toEqual([
      "kontext",
      "erhebung",
      "abschluss",
    ]);
  });

  it("filtert SCHRITTE über sichtbarWenn (Vorgangsart konditioniert)", () => {
    const steps: StepDef[] = [
      { id: "k", titel: "K", rolle: "kontext", felder: [] },
      {
        id: "nur-abmeldung",
        titel: "Nur Abmeldung",
        sichtbarWenn: { feld: "art", op: "==", wert: "abmeldung" },
        felder: [],
      },
    ];
    expect(
      sichtbareSchritte(steps, { art: "anmeldung" }).map((s) => s.id),
    ).toEqual(["k"]);
    expect(
      sichtbareSchritte(steps, { art: "abmeldung" }).map((s) => s.id),
    ).toEqual(["k", "nur-abmeldung"]);
  });

  it("filtert FELDER innerhalb eines Schritts über sichtbarWenn", () => {
    const steps: StepDef[] = [
      {
        id: "s",
        titel: "S",
        felder: [
          feld({ name: "art", typ: "select" }),
          feld({
            name: "extra",
            typ: "text",
            sichtbarWenn: { feld: "art", op: "==", wert: "premium" },
          }),
        ],
      },
    ];
    expect(
      sichtbareSchritte(steps, { art: "basis" })[0]!.felder.map((f) => f.name),
    ).toEqual(["art"]);
    expect(
      sichtbareSchritte(steps, { art: "premium" })[0]!.felder.map(
        (f) => f.name,
      ),
    ).toEqual(["art", "extra"]);
  });

  it("ohne rolle/sichtbarWenn bleiben Menge und Reihenfolge exakt (rückwärtskompatibel)", () => {
    const plain: StepDef[] = [
      { id: "a", titel: "A", felder: [] },
      { id: "b", titel: "B", felder: [] },
    ];
    expect(sichtbareSchritte(plain, {}).map((s) => s.id)).toEqual(["a", "b"]);
  });
});

// ── M5: interpretTarif füllt zwei Begründungs-Ebenen (Bürger vs. Recht) ──────────────────────────
describe("interpretTarif — M5 zwei Begründungs-Ebenen", () => {
  const tarif: Tarif = {
    einheit: "EUR/Jahr",
    label: "Jahresgebühr",
    staffeln: [
      {
        label: "Ausnahme (0 €)",
        bedingung: { feld: "fall", op: "==", wert: "ausnahme" },
        betrag: 0,
        normRef: { norm: "KAG#§4", status: "belegt" },
      },
      {
        label: "Grundbetrag",
        betrag: 120,
        normRef: { norm: "Satzung#§2", status: "annahme" },
      },
    ],
  };

  it("begruendungBuerger OHNE Paragraphen, begruendungRecht MIT belegten Normen", () => {
    const b = interpretTarif(tarif, { fall: "ausnahme" });
    expect(b.betrag).toBe(0);
    expect(b.begruendungBuerger).toBe("Ausnahme (0 €)");
    expect(b.begruendungBuerger).not.toContain("§");
    expect(b.begruendungRecht).toContain("KAG#§4");
  });

  it("provisional: die Bürger-Fassung erklärt, dass noch Angaben fehlen", () => {
    const ohneAuffang: Tarif = {
      einheit: "EUR",
      staffeln: [{ bedingung: { feld: "x", op: "==", wert: "y" }, betrag: 5 }],
    };
    const b = interpretTarif(ohneAuffang, {});
    expect(b.status).toBe("provisional");
    expect(b.begruendungBuerger).toMatch(/vollständig/i);
  });

  it("ohne normRef ist begruendungRecht = begruendung (sauberer Degrade)", () => {
    const ohneNorm: Tarif = {
      einheit: "EUR",
      staffeln: [{ label: "Pauschal", betrag: 10 }],
    };
    const b = interpretTarif(ohneNorm, {});
    expect(b.begruendungRecht).toBe(b.begruendung);
  });
});

// ── M4: nachweisBezugsweg / istRegisterAbruf ────────────────────────────────────────────────────
describe("nachweisBezugsweg — M4 Bezugsweg (Default upload)", () => {
  it("defaultet auf upload, wenn nicht deklariert", () => {
    const n: Nachweis = { id: "x", label: "X", hochgeladen: false };
    expect(nachweisBezugsweg(n)).toBe("upload");
    expect(istRegisterAbruf(n)).toBe(false);
  });

  it("erkennt register-once-only und gefordert", () => {
    const reg: Nachweis = {
      id: "r",
      label: "R",
      hochgeladen: false,
      bezugsweg: "register-once-only",
    };
    expect(nachweisBezugsweg(reg)).toBe("register-once-only");
    expect(istRegisterAbruf(reg)).toBe(true);
    expect(
      nachweisBezugsweg({
        id: "g",
        label: "G",
        hochgeladen: false,
        bezugsweg: "gefordert",
      }),
    ).toBe("gefordert");
  });
});
