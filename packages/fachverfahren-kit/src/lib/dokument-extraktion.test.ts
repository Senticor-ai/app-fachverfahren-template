import { describe, it, expect } from "vitest";
import type { StepDef } from "../types.js";
import {
  createStubExtraktionPort,
  extraktionsZielFelder,
  type ExtraktionsZielFeld,
} from "./dokument-extraktion.js";

// Bewusst VERFAHRENSFREIE Beispieldaten — der Extraktions-PORT ist domaenen-agnostisch.
const datei = { name: "beleg.pdf", groesse: 2048 };

const ziele: ExtraktionsZielFeld[] = [
  { feld: "person.nachname", label: "Nachname", typ: "text" },
  { feld: "person.plz", label: "PLZ", typ: "plz" },
  { feld: "objekt.anzahl", label: "Anzahl", typ: "number" },
];

describe("createStubExtraktionPort — deterministischer Vorschlag aus DATEN (kein Modell)", () => {
  it("schlaegt genau die Felder vor, fuer die ein Muster existiert (Rest gilt als nicht erkannt)", async () => {
    const port = createStubExtraktionPort({
      quelle: "Test-Stub",
      muster: {
        "person.nachname": {
          wert: "Muster",
          konfidenz: 0.94,
          fundstelle: "Kopf",
        },
        "objekt.anzahl": { wert: "3" },
      },
      standardKonfidenz: 0.7,
      hinweise: ["Bitte Vorschlaege pruefen."],
    });
    const ergebnis = await port.extrahiere(datei, ziele);

    expect(ergebnis.quelle).toBe("Test-Stub");
    expect(ergebnis.hinweise).toEqual(["Bitte Vorschlaege pruefen."]);
    // Nur nachname + anzahl (plz hat kein Muster) — Reihenfolge = Zielfeld-Reihenfolge.
    expect(ergebnis.felder.map((f) => f.feld)).toEqual([
      "person.nachname",
      "objekt.anzahl",
    ]);
    const nachname = ergebnis.felder[0]!;
    expect(nachname.wert).toBe("Muster");
    expect(nachname.konfidenz).toBe(0.94);
    expect(nachname.fundstelle).toBe("Kopf");
    // ohne eigene Konfidenz greift standardKonfidenz
    expect(ergebnis.felder[1]!.konfidenz).toBe(0.7);
    expect(ergebnis.felder[1]!.fundstelle).toBeUndefined();
  });

  it("kappt Konfidenz auf 0..1 und faellt ohne Muster/Hinweise auf leere, sichere Defaults", async () => {
    const port = createStubExtraktionPort({
      muster: { "person.nachname": { wert: "X", konfidenz: 5 } },
    });
    const ergebnis = await port.extrahiere(datei, ziele);
    expect(ergebnis.felder[0]!.konfidenz).toBe(1); // gekappt
    expect(ergebnis.quelle).toContain("Stub");
    expect(ergebnis.hinweise).toBeUndefined();
  });

  it("ohne jedes Muster erkennt der Stub nichts (leeres, aber gueltiges Ergebnis)", async () => {
    const port = createStubExtraktionPort();
    const ergebnis = await port.extrahiere(datei, ziele);
    expect(ergebnis.felder).toEqual([]);
  });

  it("ein generator hat Vorrang vor muster und darf `null` (nicht erkannt) liefern", async () => {
    const port = createStubExtraktionPort({
      muster: { "person.nachname": { wert: "ausMuster" } },
      generator: (ziel, d) =>
        ziel.typ === "number" ? { wert: `${d.groesse}` } : null,
    });
    const ergebnis = await port.extrahiere(datei, ziele);
    // Nur das number-Feld (anzahl) wird erkannt; das Muster wird vom generator verdraengt.
    expect(ergebnis.felder.map((f) => f.feld)).toEqual(["objekt.anzahl"]);
    expect(ergebnis.felder[0]!.wert).toBe("2048");
  });
});

describe("extraktionsZielFelder — extrahierbare Ziele aus den Schritten (data-driven)", () => {
  const steps: StepDef[] = [
    {
      id: "s1",
      titel: "Angaben",
      felder: [
        { name: "person.nachname", label: "Nachname", typ: "text" },
        { name: "person.geburt", label: "Geburtsdatum", typ: "date" },
        { name: "nachweis", label: "Beleg", typ: "file" },
        { name: "einwilligung", label: "Einwilligung", typ: "checkbox" },
        { name: "objekt.auffaellig", label: "Auffaellig?", typ: "ja-nein" },
        { name: "objekt.anzahl", label: "Anzahl", typ: "number" },
      ],
    },
  ];

  it("nimmt Text/Datum/Zahl auf, laesst file/checkbox/ja-nein aus", () => {
    const ziele = extraktionsZielFelder(steps);
    expect(ziele.map((z) => z.feld)).toEqual([
      "person.nachname",
      "person.geburt",
      "objekt.anzahl",
    ]);
    expect(ziele[0]).toEqual({
      feld: "person.nachname",
      label: "Nachname",
      typ: "text",
    });
  });

  it("liefert bei leeren Schritten eine leere Liste", () => {
    expect(extraktionsZielFelder([])).toEqual([]);
  });
});
