// fachverfahren-kit/lib/export-csv — die EINE, reine Wahrheit für den CSV-Export einer Tabelle.
//
// `zuCsv` serialisiert Datenzeilen (Records) in eine RFC-4180-konforme CSV-Zeichenkette. Voreingestellt ist der
// SEMIKOLON-Trenner, weil im deutschsprachigen Raum (de-DE) das Komma der Dezimaltrenner ist und Tabellen-Programme
// dort Semikolon-getrennte Dateien erwarten. Quoting/Escaping folgen RFC 4180: Ein Feld wird nur dann in doppelte
// Anführungszeichen gesetzt, wenn es den Trenner, ein Anführungszeichen oder einen Zeilenumbruch enthält; enthaltene
// Anführungszeichen werden verdoppelt. Optional wird eine UTF-8-BOM vorangestellt (hilft Tabellen-Programmen bei der
// Kodierungs-Erkennung von Umlauten).
//
// REIN + DETERMINISTISCH: kein Date.now/Math.random, kein DOM, kein Netz — der eigentliche Download ist Sache der
// UI (siehe components/ExportDialog). GENERISCH: keine Domänen-Literale; welche Spalten/Werte exportiert werden,
// gibt ausschließlich der Aufrufer über `spalten` (+ optionalem Formatter) vor.

/** Eine Export-Spalte: aus welchem Zeilen-Schlüssel der Zellwert kommt und wie die Kopfzeile heißt. */
export interface CsvSpalte {
  /** Property-Schlüssel der Zeile, dessen Wert in diese Spalte übernommen wird. */
  key: string;
  /** Spaltenüberschrift (Kopfzeile). */
  label: string;
  /**
   * Optionaler, REINER Formatter für den Zellwert (z. B. Datums-/Betrags-Formatierung durch den Aufrufer).
   * Muss deterministisch sein — keine Seiteneffekte. Fehlt er, greift die neutrale Standard-Serialisierung.
   */
  format?: (wert: unknown, zeile: Readonly<Record<string, unknown>>) => string;
}

/** Optionen für die CSV-Serialisierung. */
export interface CsvOptions {
  /** Feldtrenner. Default ";" (de-DE — Komma ist dort Dezimaltrenner). */
  trenner?: string;
  /** Zeilenumbruch. Default CRLF ("\r\n") gemäß RFC 4180. */
  zeilenumbruch?: string;
  /** UTF-8-BOM (U+FEFF) voranstellen — hilft Tabellen-Programmen bei der Umlaut-Erkennung. Default false. */
  bom?: boolean;
  /** Kopfzeile aus den Spalten-Labels ausgeben. Default true. */
  kopfzeile?: boolean;
}

const DEFAULT_TRENNER = ";";
const DEFAULT_ZEILENUMBRUCH = "\r\n";
const BOM = "﻿";

/** Neutrale Standard-Serialisierung eines Zellwerts — der Aufrufer kann sie je Spalte via `format` überschreiben. */
function zelleZuText(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  if (typeof wert === "string") return wert;
  if (typeof wert === "number")
    return Number.isFinite(wert) ? String(wert) : "";
  if (typeof wert === "boolean") return String(wert);
  if (wert instanceof Date) {
    return Number.isNaN(wert.getTime()) ? "" : wert.toISOString();
  }
  return String(wert);
}

/**
 * Setzt einen Feldwert nach RFC 4180 in Anführungszeichen, WENN nötig (enthält Trenner, Anführungszeichen, CR
 * oder LF). Enthaltene Anführungszeichen werden verdoppelt. Sonst bleibt der Wert unverändert.
 */
function quoteWennNoetig(text: string, trenner: string): string {
  const mussQuoten =
    text.includes(trenner) ||
    text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r");
  if (!mussQuoten) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Serialisiert `zeilen` anhand von `spalten` zu einer RFC-4180-konformen CSV-Zeichenkette.
 *
 * - Semikolon-Trenner als de-DE-Default, überschreibbar via `options.trenner`.
 * - Kopfzeile aus den Spalten-Labels (abschaltbar), danach je Zeile eine CSV-Zeile.
 * - Korrektes Quoting/Escaping von Trenner, Anführungszeichen und Zeilenumbrüchen.
 * - Optionale UTF-8-BOM für die zuverlässige Umlaut-Erkennung.
 *
 * @example
 * const csv = zuCsv(
 *   [{ name: "A;B", betrag: 12 }],
 *   [{ key: "name", label: "Name" }, { key: "betrag", label: "Betrag" }],
 * );
 * // 'Name;Betrag\r\n"A;B";12'
 */
export function zuCsv(
  zeilen: ReadonlyArray<Readonly<Record<string, unknown>>>,
  spalten: ReadonlyArray<CsvSpalte>,
  options: CsvOptions = {},
): string {
  const trenner = options.trenner ?? DEFAULT_TRENNER;
  const zeilenumbruch = options.zeilenumbruch ?? DEFAULT_ZEILENUMBRUCH;
  const mitKopfzeile = options.kopfzeile ?? true;

  const ausgabe: string[] = [];

  if (mitKopfzeile) {
    ausgabe.push(
      spalten.map((s) => quoteWennNoetig(s.label, trenner)).join(trenner),
    );
  }

  for (const zeile of zeilen) {
    const zellen = spalten.map((spalte) => {
      const roh = zeile[spalte.key];
      const text = spalte.format ? spalte.format(roh, zeile) : zelleZuText(roh);
      return quoteWennNoetig(text, trenner);
    });
    ausgabe.push(zellen.join(trenner));
  }

  const csv = ausgabe.join(zeilenumbruch);
  return options.bom ? BOM + csv : csv;
}
