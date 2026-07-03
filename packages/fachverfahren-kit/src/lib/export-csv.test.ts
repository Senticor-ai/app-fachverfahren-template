import { describe, it, expect } from "vitest";
import { zuCsv, type CsvSpalte } from "./export-csv.js";

// Bewusst VERFAHRENSFREIE Beispieldaten (objekt/posten) — die Serialisierung ist domänen-agnostisch.
const spalten: CsvSpalte[] = [
  { key: "name", label: "Name" },
  { key: "betrag", label: "Betrag" },
];

describe("zuCsv — RFC-4180-konforme Serialisierung", () => {
  it("erzeugt Kopfzeile + Datenzeilen mit Semikolon-Trenner (de-DE) und CRLF", () => {
    const csv = zuCsv(
      [
        { name: "Alpha", betrag: 12 },
        { name: "Beta", betrag: 34 },
      ],
      spalten,
    );
    expect(csv).toBe("Name;Betrag\r\nAlpha;12\r\nBeta;34");
  });

  it("quotet Felder, die den Trenner enthalten", () => {
    const csv = zuCsv([{ name: "A;B", betrag: 1 }], spalten);
    expect(csv).toBe('Name;Betrag\r\n"A;B";1');
  });

  it("verdoppelt enthaltene Anführungszeichen und quotet das Feld", () => {
    const csv = zuCsv([{ name: 'Er sagte "Hallo"', betrag: 1 }], spalten);
    expect(csv).toBe('Name;Betrag\r\n"Er sagte ""Hallo""";1');
  });

  it("quotet Felder mit Zeilenumbruch (LF und CRLF)", () => {
    const csvLf = zuCsv([{ name: "Zeile1\nZeile2", betrag: 1 }], spalten);
    expect(csvLf).toBe('Name;Betrag\r\n"Zeile1\nZeile2";1');

    const csvCrlf = zuCsv([{ name: "Zeile1\r\nZeile2", betrag: 1 }], spalten);
    expect(csvCrlf).toBe('Name;Betrag\r\n"Zeile1\r\nZeile2";1');
  });

  it("serialisiert null/undefined als leeres Feld", () => {
    const csv = zuCsv([{ name: null, betrag: undefined }], spalten, {
      kopfzeile: false,
    });
    expect(csv).toBe(";");
  });

  it("serialisiert Boolean und nicht-endliche Zahlen neutral", () => {
    const csv = zuCsv([{ name: true, betrag: Number.NaN }], spalten, {
      kopfzeile: false,
    });
    // true → "true"; NaN → leeres Feld (kein "NaN" im Export).
    expect(csv).toBe("true;");
  });

  it("stellt optional eine UTF-8-BOM voran", () => {
    const csv = zuCsv([{ name: "Ä", betrag: 1 }], spalten, { bom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Name;Betrag\r\nÄ;1");
  });

  it("respektiert einen abweichenden Trenner und quotet dann dessen Vorkommen", () => {
    const csv = zuCsv([{ name: "A,B", betrag: 1 }], spalten, {
      trenner: ",",
    });
    // Komma ist jetzt Trenner → Feld mit Komma wird gequotet; Semikolon bliebe roh.
    expect(csv).toBe('Name,Betrag\r\n"A,B",1');
  });

  it("nutzt den spaltenspezifischen Formatter für den Zellwert", () => {
    const mitFormat: CsvSpalte[] = [
      { key: "name", label: "Name" },
      {
        key: "betrag",
        label: "Betrag",
        // de-DE-Formatierung erzeugt ein Komma → wird bei Semikolon-Trenner NICHT gequotet.
        format: (wert) => `${Number(wert).toFixed(2).replace(".", ",")} €`,
      },
    ];
    const csv = zuCsv([{ name: "Alpha", betrag: 12 }], mitFormat);
    expect(csv).toBe("Name;Betrag\r\nAlpha;12,00 €");
  });

  it("gibt bei leeren Zeilen nur die Kopfzeile aus", () => {
    expect(zuCsv([], spalten)).toBe("Name;Betrag");
  });

  it("gibt bei leeren Zeilen ohne Kopfzeile eine leere Zeichenkette aus", () => {
    expect(zuCsv([], spalten, { kopfzeile: false })).toBe("");
  });

  it("greift auf fehlende Schlüssel als leeres Feld zurück", () => {
    const csv = zuCsv([{ name: "Alpha" }], spalten, { kopfzeile: false });
    expect(csv).toBe("Alpha;");
  });
});
