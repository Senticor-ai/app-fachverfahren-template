import { describe, it, expect } from "vitest";
import type { Codeliste, FeldDef, StepDef } from "../types.js";
import {
  asString,
  codelisteOptionen,
  feldAnzeige,
  feldFehler,
  feldHint,
  feldLabel,
  feldLabelFachlich,
  feldOptionen,
  getPath,
  parsePath,
  istBeantwortet,
  istDateiWert,
  resolveFeld,
  resolveSteps,
  setPath,
  stepGueltig,
  typisiereAntragsdaten,
  typisiereFeldwert,
} from "./antrag-felder.js";

const feld = (
  f: Partial<FeldDef> & Pick<FeldDef, "name" | "typ">,
): FeldDef => ({
  label: f.label ?? f.name,
  ...f,
});

describe("getPath / setPath — verschachtelter, immutabler Zugriff", () => {
  it("liest und setzt über Punkt-Pfade, ohne die Quelle zu mutieren", () => {
    const a = { halter: { nachname: "Muster" } };
    expect(getPath(a, "halter.nachname")).toBe("Muster");
    const b = setPath(a, "posten.anzahl", "2");
    expect(getPath(b, "posten.anzahl")).toBe("2");
    expect(getPath(a, "posten.anzahl")).toBeUndefined(); // Original unberührt
    expect(getPath(b, "halter.nachname")).toBe("Muster"); // Nachbarpfad erhalten
  });

  it("ARRAY-INDIZES: liest und setzt 'posten[0].wert' als Array (Wurzel des 0-Bugs: Eingabe erreicht die Berechnung nie)", () => {
    // Antrag erhebt je Listeneintrag mehrere Felder → die Berechnung liest a.posten als ARRAY. Der Pfad MUSS als
    // Array-Index landen, nicht als Literal-Key "posten[0]" (sonst a.posten=undefined → immer 0/provisional).
    let d = setPath({}, "posten[0].name", "A");
    d = setPath(d, "posten[0].wert", "10");
    d = setPath(d, "posten[1].name", "B");
    expect(Array.isArray((d as { posten?: unknown }).posten)).toBe(true);
    expect(getPath(d, "posten[0].name")).toBe("A");
    expect(getPath(d, "posten[1].name")).toBe("B");
    // Die Berechnung liest a.posten als echtes Array (Länge + Feldzugriff):
    const posten = (d as { posten: { name: string; wert?: string }[] }).posten;
    expect(posten.length).toBe(2);
    expect(posten[0].wert).toBe("10");
    // Seed-Richtung (Detailsicht): getPath auf ein vorbelegtes Array-Objekt liest korrekt (war vorher leer).
    const seed = { posten: [{ name: "Seed", wert: "5" }] };
    expect(getPath(seed, "posten[0].wert")).toBe("5");
    // Immutabilität + Nachbarpfad-Erhalt bei Array-Set:
    const base = { posten: [{ name: "A" }], halter: { nachname: "X" } };
    const upd = setPath(base, "posten[0].name", "B");
    expect(getPath(upd, "posten[0].name")).toBe("B");
    expect(getPath(base, "posten[0].name")).toBe("A"); // Original unberührt
    expect(getPath(upd, "halter.nachname")).toBe("X"); // Nachbarzweig erhalten
  });

  it("parsePath: zerlegt Punkt- und Index-Pfade robust", () => {
    expect(parsePath("posten[0].wert")).toEqual(["posten", 0, "wert"]);
    expect(parsePath("a.b.c")).toEqual(["a", "b", "c"]);
    expect(parsePath("x[1][2]")).toEqual(["x", 1, 2]);
    expect(parsePath("plain")).toEqual(["plain"]);
  });
});

describe("typisiereFeldwert — je FeldTyp den fachlichen Typ liefern", () => {
  it("number: getippter String wird ZAHL (Wurzel des Staffel-Bugs: switch(anzahl) matcht sonst nie)", () => {
    const f = feld({ name: "posten.anzahl", typ: "number" });
    expect(typisiereFeldwert(f, "2")).toBe(2);
    expect(typisiereFeldwert(f, "2")).not.toBe("2");
    expect(typisiereFeldwert(f, 3)).toBe(3);
  });

  it("number: leere Eingabe → undefined, Dezimalkomma toleriert, Nicht-Zahl bleibt String", () => {
    const f = feld({ name: "n", typ: "number" });
    expect(typisiereFeldwert(f, "")).toBeUndefined();
    expect(typisiereFeldwert(f, "  ")).toBeUndefined();
    expect(typisiereFeldwert(f, "1,5")).toBe(1.5);
    expect(typisiereFeldwert(f, "abc")).toBe("abc");
  });

  it("select: NUMERISCHE Options → Zahl, Enum-Options bleiben String", () => {
    const numerisch = feld({
      name: "stufe",
      typ: "select",
      options: [
        { value: "1", label: "Eins" },
        { value: "2", label: "Zwei" },
      ],
    });
    const enumFeld = feld({
      name: "geschlecht",
      typ: "select",
      options: [
        { value: "m", label: "männlich" },
        { value: "w", label: "weiblich" },
      ],
    });
    expect(typisiereFeldwert(numerisch, "2")).toBe(2);
    expect(typisiereFeldwert(enumFeld, "w")).toBe("w");
  });

  it("ja-nein / checkbox: boolean bleibt, String-Repräsentationen werden boolean, undefined bleibt offen", () => {
    const j = feld({ name: "merkmal", typ: "ja-nein" });
    expect(typisiereFeldwert(j, true)).toBe(true);
    expect(typisiereFeldwert(j, false)).toBe(false);
    expect(typisiereFeldwert(j, "ja")).toBe(true);
    expect(typisiereFeldwert(j, "nein")).toBe(false);
    expect(typisiereFeldwert(j, undefined)).toBeUndefined();
    const c = feld({ name: "einwilligung", typ: "checkbox" });
    expect(typisiereFeldwert(c, "true")).toBe(true);
  });

  it("file / text: unverändert durchgereicht", () => {
    const datei = { name: "beleg.pdf", groesse: 1024 };
    expect(typisiereFeldwert(feld({ name: "f", typ: "file" }), datei)).toBe(
      datei,
    );
    expect(typisiereFeldwert(feld({ name: "t", typ: "text" }), "Hallo")).toBe(
      "Hallo",
    );
  });
});

describe("typisiereAntragsdaten — Regression: Anzahl-Staffel greift über echte Zahlen", () => {
  const steps: StepDef[] = [
    {
      id: "posten",
      titel: "Posten",
      felder: [feld({ name: "posten.anzahl", typ: "number" })],
    },
  ];
  // Fachliche Subsumtion, wie ein generiertes Verfahren sie schreibt (Staffel je Anzahl).
  const stufe = (anzahl: unknown): number => {
    switch (anzahl) {
      case 1:
        return 120;
      case 2:
        return 180;
      default:
        return 240;
    }
  };

  it("String-Eingaben 1/2/3 ergeben nach Typisierung die RICHTIGE Stufe (nicht alle den Default)", () => {
    for (const [eingabe, erwartet] of [
      ["1", 120],
      ["2", 180],
      ["3", 240],
    ] as const) {
      const roh = setPath({}, "posten.anzahl", eingabe);
      // Vor der Typisierung fiele der switch IMMER in den Default (String matcht keinen Zahl-Case).
      expect(stufe(getPath(roh, "posten.anzahl"))).toBe(240);
      const typ = typisiereAntragsdaten(steps, roh);
      expect(stufe(getPath(typ, "posten.anzahl"))).toBe(erwartet);
    }
  });

  it("lässt unbeteiligte Pfade unangetastet und mutiert die Eingabe nicht", () => {
    const roh = { posten: { anzahl: "2" }, halter: { name: "Muster" } };
    const typ = typisiereAntragsdaten(steps, roh);
    expect(getPath(typ, "posten.anzahl")).toBe(2);
    expect(getPath(typ, "halter.name")).toBe("Muster");
    expect(getPath(roh, "posten.anzahl")).toBe("2"); // Original unverändert
  });
});

describe("feldFehler — required-Semantik je FeldTyp", () => {
  it("ja-nein required: NEIN ist eine gültige Antwort — sperrt den Antrag NICHT (Kern von Wurzel 2)", () => {
    const f = feld({ name: "merkmal", typ: "ja-nein", required: true });
    expect(feldFehler(f, undefined)).toBe("Bitte Ja oder Nein auswählen.");
    expect(feldFehler(f, false)).toBeNull();
    expect(feldFehler(f, true)).toBeNull();
  });

  it("checkbox required: MUSS bejaht werden (Zustimmung/Bestätigung)", () => {
    const f = feld({ name: "einwilligung", typ: "checkbox", required: true });
    expect(feldFehler(f, undefined)).toBe("Bitte bestätigen.");
    expect(feldFehler(f, false)).toBe("Bitte bestätigen.");
    expect(feldFehler(f, true)).toBeNull();
  });

  it("file required: ohne Datei blockiert, mit Datei frei", () => {
    const f = feld({ name: "nachweis", typ: "file", required: true });
    expect(feldFehler(f, undefined)).toBe("Bitte eine Datei auswählen.");
    expect(feldFehler(f, { name: "beleg.pdf", groesse: 10 })).toBeNull();
  });

  it("number: Pflicht, Format und min/max", () => {
    const f = feld({
      name: "n",
      typ: "number",
      required: true,
      min: 1,
      max: 5,
    });
    expect(feldFehler(f, "")).toBe("Pflichtangabe — bitte ausfüllen.");
    expect(feldFehler(f, "0")).toBe("Mindestens 1.");
    expect(feldFehler(f, "9")).toBe("Höchstens 5.");
    expect(feldFehler(f, "3")).toBeNull();
    expect(feldFehler(f, 3)).toBeNull(); // bereits typisiert
  });

  it("text: Pflicht + Pattern", () => {
    const f = feld({
      name: "plz",
      typ: "text",
      required: true,
      pattern: "^\\d{5}$",
    });
    expect(feldFehler(f, "")).toBe("Pflichtangabe — bitte ausfüllen.");
    expect(feldFehler(f, "12A")).toBe(
      "Eingabe entspricht nicht dem erwarteten Format.",
    );
    expect(feldFehler(f, "12345")).toBeNull();
  });

  // Regression: OHNE explizites `pattern` prüften plz/email/tel früher NUR „nicht leer" — „12" als PLZ oder
  // „keinemail" passierte den Schritt und wurde abgesendet. Intrinsische Formatprüfung je Typ schliesst das.
  it("plz OHNE pattern: verlangt 5 Ziffern (leerer required-Fall zuerst)", () => {
    const f = feld({ name: "plz", typ: "plz", required: true });
    expect(feldFehler(f, "")).toBe("Pflichtangabe — bitte ausfüllen.");
    expect(feldFehler(f, "12")).toBe(
      "Bitte eine gültige Postleitzahl (5 Ziffern) eingeben.",
    );
    expect(feldFehler(f, "1234a")).toBe(
      "Bitte eine gültige Postleitzahl (5 Ziffern) eingeben.",
    );
    expect(feldFehler(f, "12345")).toBeNull();
  });

  it("email OHNE pattern: verlangt ein wohlgeformtes @-Format", () => {
    const f = feld({ name: "email", typ: "email", required: true });
    expect(feldFehler(f, "keinemail")).toBe(
      "Bitte eine gültige E-Mail-Adresse eingeben.",
    );
    expect(feldFehler(f, "a@b")).toBe(
      "Bitte eine gültige E-Mail-Adresse eingeben.",
    );
    expect(feldFehler(f, "muster@amt.de")).toBeNull();
  });

  it("tel OHNE pattern: verlangt eine plausible Telefonnummer", () => {
    const f = feld({ name: "tel", typ: "tel", required: true });
    expect(feldFehler(f, "ab")).toBe(
      "Bitte eine gültige Telefonnummer eingeben.",
    );
    expect(feldFehler(f, "+49 30 123456")).toBeNull();
  });

  it("plz/email/tel OPTIONAL + leer: gültig (kein erzwungenes Format auf Leerwert)", () => {
    expect(feldFehler(feld({ name: "plz", typ: "plz" }), "")).toBeNull();
    expect(feldFehler(feld({ name: "email", typ: "email" }), "")).toBeNull();
    expect(feldFehler(feld({ name: "tel", typ: "tel" }), "")).toBeNull();
  });

  it("explizites pattern hat Vorrang vor der intrinsischen Typprüfung", () => {
    // Ein 4-stelliges Auslands-PLZ-Pattern soll die 5-Ziffern-Default-Regel überschreiben.
    const f = feld({ name: "plz", typ: "plz", pattern: "^\\d{4}$" });
    expect(feldFehler(f, "1234")).toBeNull();
    expect(feldFehler(f, "12345")).toBe(
      "Eingabe entspricht nicht dem erwarteten Format.",
    );
  });
});

describe("stepGueltig — Schritt gilt, wenn kein Feld einen Fehler meldet", () => {
  const step: StepDef = {
    id: "s",
    titel: "S",
    felder: [
      feld({ name: "name", typ: "text", required: true }),
      feld({ name: "merkmal", typ: "ja-nein", required: true }),
    ],
  };
  it("blockiert bei offener Pflichtangabe, gibt frei sobald beantwortet (auch mit NEIN)", () => {
    expect(stepGueltig(step, {})).toBe(false);
    expect(stepGueltig(step, { name: "Muster", merkmal: false })).toBe(true);
  });
});

describe("feldOptionen / resolveFeld — data-driven Auswahl (Liste als DATEN)", () => {
  const datenlisten = {
    kategorien: [
      { value: "a", label: "Kategorie A" },
      { value: "b", label: "Kategorie B" },
    ],
  };
  it("optionsRef zieht die Optionen aus config.datenlisten", () => {
    const f = feld({
      name: "sache.kategorie",
      typ: "select",
      optionsRef: "kategorien",
    });
    expect(feldOptionen(f, datenlisten)).toEqual(datenlisten.kategorien);
    expect(resolveFeld(f, datenlisten).options).toEqual(datenlisten.kategorien);
  });

  it("inline options haben Vorrang vor optionsRef", () => {
    const inline = [{ value: "x", label: "X" }];
    const f = feld({
      name: "s",
      typ: "select",
      options: inline,
      optionsRef: "kategorien",
    });
    expect(feldOptionen(f, datenlisten)).toBe(inline);
  });

  it("unbekannte Referenz → keine Optionen (kein Crash)", () => {
    const f = feld({ name: "s", typ: "select", optionsRef: "fehlt" });
    expect(feldOptionen(f, datenlisten)).toBeUndefined();
    expect(resolveFeld(f, datenlisten)).toBe(f); // unverändert
  });

  it("resolveSteps materialisiert die Optionen für alle Felder", () => {
    const steps: StepDef[] = [
      {
        id: "posten",
        titel: "Posten",
        felder: [
          feld({ name: "kategorie", typ: "select", optionsRef: "kategorien" }),
        ],
      },
    ];
    const [erster] = resolveSteps(steps, datenlisten);
    expect(erster!.felder[0]!.options).toEqual(datenlisten.kategorien);
  });
});

describe("codelisten — geerdete Auswahl (mit Provenienz) über dieselbe optionsRef-Auflösung", () => {
  const codeliste: Codeliste = {
    id: "kategorien",
    label: "Kategorien",
    normRef: { norm: "Satzung#Anlage1", status: "annahme" },
    eintraege: [
      {
        value: "premium",
        label: "Premium",
        normRef: { norm: "Satzung#§3", status: "belegt" },
      },
      { value: "standard", label: "Standard" },
    ],
  };
  const codelisten = { kategorien: codeliste };

  it("codelisteOptionen projiziert Einträge auf value/label (Provenienz bleibt in der Liste)", () => {
    expect(codelisteOptionen(codeliste)).toEqual([
      { value: "premium", label: "Premium" },
      { value: "standard", label: "Standard" },
    ]);
  });

  it("optionsRef löst gegen codelisten auf, wenn keine gleichnamige datenliste existiert", () => {
    const f = feld({
      name: "objekt.kategorie",
      typ: "select",
      optionsRef: "kategorien",
    });
    expect(feldOptionen(f, undefined, codelisten)).toEqual([
      { value: "premium", label: "Premium" },
      { value: "standard", label: "Standard" },
    ]);
    expect(resolveFeld(f, undefined, codelisten).options).toHaveLength(2);
  });

  it("datenlisten haben Vorrang vor codelisten bei gleicher optionsRef", () => {
    const f = feld({ name: "x", typ: "select", optionsRef: "kategorien" });
    const datenlisten = {
      kategorien: [{ value: "nur-daten", label: "Nur Daten" }],
    };
    expect(feldOptionen(f, datenlisten, codelisten)).toEqual([
      { value: "nur-daten", label: "Nur Daten" },
    ]);
  });
});

describe("istBeantwortet — presence-Wahrheit je FeldTyp (Basis bedingter Pflicht)", () => {
  it("checkbox nur bei true, ja-nein bei Ja UND Nein, file bei Datei, sonst nicht-leer", () => {
    expect(istBeantwortet(feld({ name: "c", typ: "checkbox" }), true)).toBe(
      true,
    );
    expect(istBeantwortet(feld({ name: "c", typ: "checkbox" }), false)).toBe(
      false,
    );
    expect(istBeantwortet(feld({ name: "j", typ: "ja-nein" }), false)).toBe(
      true,
    );
    expect(istBeantwortet(feld({ name: "j", typ: "ja-nein" }), undefined)).toBe(
      false,
    );
    expect(
      istBeantwortet(feld({ name: "f", typ: "file" }), {
        name: "b.pdf",
        groesse: 1,
      }),
    ).toBe(true);
    expect(istBeantwortet(feld({ name: "t", typ: "text" }), "Muster")).toBe(
      true,
    );
    expect(istBeantwortet(feld({ name: "t", typ: "text" }), "   ")).toBe(false);
  });
});

describe("feldAnzeige — Review-Aufbereitung je FeldTyp", () => {
  it("select zeigt das Options-Label (auch nach optionsRef-Auflösung)", () => {
    const roh = feld({
      name: "kategorie",
      typ: "select",
      optionsRef: "kategorien",
    });
    const aufgeloest = resolveFeld(roh, {
      kategorien: [{ value: "b", label: "Kategorie B" }],
    });
    expect(feldAnzeige(aufgeloest, "b")).toBe("Kategorie B");
  });
  it("ja-nein → Ja/Nein/leer, checkbox → Ja/leer, file → Dateiname, number → String", () => {
    expect(feldAnzeige(feld({ name: "j", typ: "ja-nein" }), true)).toBe("Ja");
    expect(feldAnzeige(feld({ name: "j", typ: "ja-nein" }), false)).toBe(
      "Nein",
    );
    expect(feldAnzeige(feld({ name: "j", typ: "ja-nein" }), undefined)).toBe(
      "",
    );
    expect(feldAnzeige(feld({ name: "c", typ: "checkbox" }), true)).toBe("Ja");
    expect(feldAnzeige(feld({ name: "c", typ: "checkbox" }), false)).toBe("");
    expect(
      feldAnzeige(feld({ name: "f", typ: "file" }), {
        name: "beleg.pdf",
        groesse: 10,
      }),
    ).toBe("beleg.pdf");
    expect(feldAnzeige(feld({ name: "n", typ: "number" }), 2)).toBe("2");
  });
});

describe("asString / istDateiWert — Hilfsfunktionen", () => {
  it("asString normalisiert boolean/Datei/leer ohne [object Object]", () => {
    expect(asString(undefined)).toBe("");
    expect(asString(true)).toBe("true");
    expect(asString({ name: "b.pdf", groesse: 1 })).toBe("b.pdf");
    expect(asString({ irgendwas: 1 })).toBe("");
    expect(asString(42)).toBe("42");
  });
  it("istDateiWert erkennt nur { name:string, groesse:number }", () => {
    expect(istDateiWert({ name: "b.pdf", groesse: 1 })).toBe(true);
    expect(istDateiWert({ name: "b.pdf" })).toBe(false);
    expect(istDateiWert(null)).toBe(false);
    expect(istDateiWert("x")).toBe(false);
  });
});

// ── M1: codelisteOptionen reicht markierung/merkmale durch (für den Selektor) ────────────────────
describe("codelisteOptionen — M1 Markierung/Merkmale durchreichen", () => {
  it("reicht markierung + merkmale eines Eintrags durch (nur wenn vorhanden — sonst schlank)", () => {
    const codeliste: Codeliste = {
      id: "kategorien",
      label: "Kategorien",
      eintraege: [
        {
          value: "sonderklasse",
          label: "Sonderklasse",
          markierung: { ton: "warn", label: "Sonderklasse" },
          merkmale: { sonderpflichtig: true, stufe: 1 },
        },
        { value: "standard", label: "Standard" },
      ],
    };
    const opts = codelisteOptionen(codeliste);
    expect(opts[0]).toEqual({
      value: "sonderklasse",
      label: "Sonderklasse",
      markierung: { ton: "warn", label: "Sonderklasse" },
      merkmale: { sonderpflichtig: true, stufe: 1 },
    });
    // Ein Eintrag ohne markierung/merkmale bleibt schlank (keine undefined-Keys).
    expect(opts[1]).toEqual({ value: "standard", label: "Standard" });
  });
});

// ── M2: feldLabel / feldHint / feldLabelFachlich (Sprach-Projektion PRO FELD) ────────────────────
describe("feldLabel / feldHint / feldLabelFachlich — M2 Bürger-/Leichte-/Amtssprache", () => {
  const f = feld({
    name: "kategorie",
    typ: "select",
    label: "Kategorie",
    labelFachlich: "Kategorie gem. Anlage",
    leichteSprache: "Welche Art?",
    hint: "Bitte wählen",
    hintEinfach: "Wähle eine Art aus.",
  });

  it("Standard: Bürger-label und -hint", () => {
    expect(feldLabel(f)).toBe("Kategorie");
    expect(feldHint(f)).toBe("Bitte wählen");
  });

  it("Leichte Sprache: leichteSprache/hintEinfach, wenn gesetzt", () => {
    expect(feldLabel(f, { leicht: true })).toBe("Welche Art?");
    expect(feldHint(f, { leicht: true })).toBe("Wähle eine Art aus.");
  });

  it("Leichte Sprache degradiert sauber auf label/hint, wenn keine Leichte-Fassung existiert", () => {
    const g = feld({
      name: "x",
      typ: "text",
      label: "Nur Standard",
      hint: "H",
    });
    expect(feldLabel(g, { leicht: true })).toBe("Nur Standard");
    expect(feldHint(g, { leicht: true })).toBe("H");
  });

  it("feldLabelFachlich liefert die Amtsbezeichnung (oder undefined)", () => {
    expect(feldLabelFachlich(f)).toBe("Kategorie gem. Anlage");
    expect(feldLabelFachlich(feld({ name: "y", typ: "text" }))).toBeUndefined();
  });
});
