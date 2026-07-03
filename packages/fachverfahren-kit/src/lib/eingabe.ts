// fachverfahren-kit/lib/eingabe — die EINE, testbare Wahrheit über das PARSEN und PRÜFEN von EINGABEN (de-DE).
//
// Das Gegenstück zu `format.ts` (das AUSGABEN formatiert) und `interpreter.ts` (das norm-abgeleitete `regeln` über
// die GESAMTEN Antragsdaten auswertet): hier wird die EINGABE-Seite abgedeckt — deutsche Geld-/Zahl-/Datums-Eingaben
// robust parsen und ein EINZELFELD gegen eine DATEN-getriebene Regel (`EingabeRegel`) prüfen. Rein (kein
// Date.now/Math.random/DOM/Netz), deterministisch, de-DE — damit Betrags-Felder, IBAN-Prüfung und Datumsparsen
// überall identisch und testbar sind. Beträge werden in der NATÜRLICHEN Haupteinheit (Euro, NICHT Cent) geführt,
// konsistent mit `formatBetrag`. Fehlermeldungen sind generisch, klar, handlungsleitend und deutsch — nie über die
// Feldgröße kommuniziert, nie mit Domänen-Literalen.
import { asString } from "./antrag-felder.js";

// ── de-DE Zahl-Parsing (die gemeinsame Wurzel für Betrag/Dezimal/Ganzzahl) ────────────────────────
/** Whitespace als Tausender-Trenner (de-DE). `\s` matcht in JS auch geschuetztes (U+00A0) und schmales (U+202F) Leerzeichen. */
const WHITESPACE_RE = /\s/g;
/** Währungssymbole/-codes, die `parseBetrag` vor dem Zahl-Parsing entfernt (kein `\b`, damit „1200EUR" greift). */
const WAEHRUNGS_RE = /[€$£]|eur|usd|gbp|chf/gi;

/**
 * Parst eine deutsche Zahl-Eingabe zu einer Zahl oder `null`. Konvention de-DE: Komma ist der Dezimaltrenner (höchstens
 * eines), Punkt und Leerzeichen sind Tausender-Trenner. Beispiele: „1.234,56" → 1234.56, „1234,5" → 1234.5,
 * „1 200,00" → 1200. Alles außer Ziffern/Punkt/Komma/Leerzeichen/Vorzeichen ⇒ `null`.
 */
function parseDeutscheZahl(text: string): number | null {
  if (typeof text !== "string") return null;
  // Tausender-Leerzeichen entfernen; führendes Vorzeichen abtrennen.
  let s = text.replace(WHITESPACE_RE, "");
  if (s === "") return null;
  let vorzeichen = 1;
  if (s.startsWith("-")) {
    vorzeichen = -1;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  // Ab hier sind NUR Ziffern, Punkt und Komma zulässig.
  if (s === "" || !/^[0-9.,]+$/.test(s)) return null;
  // Höchstens EIN Dezimalkomma.
  const kommas = (s.match(/,/g) ?? []).length;
  if (kommas > 1) return null;
  let ganzteil: string;
  let bruchteil = "";
  if (kommas === 1) {
    const idx = s.indexOf(",");
    ganzteil = s.slice(0, idx).replace(/\./g, ""); // Punkte im Ganzteil = Tausender-Trenner
    bruchteil = s.slice(idx + 1);
    if (bruchteil.includes(".")) return null; // im Nachkommateil gibt es keinen Tausender-Punkt
  } else {
    ganzteil = s.replace(/\./g, ""); // ohne Komma sind alle Punkte Tausender-Trenner
  }
  if (ganzteil === "" && bruchteil === "") return null;
  const zahl = Number(`${ganzteil || "0"}.${bruchteil || "0"}`);
  return Number.isNaN(zahl) ? null : vorzeichen * zahl;
}

/**
 * Parst eine deutsche GELD-Eingabe zur Zahl in der Haupteinheit (Euro, NICHT Cent) oder `null`. Toleriert
 * Währungssymbole/-codes (€, EUR, USD, GBP, CHF) sowie Tausender-Trenner: „26 €" → 26, „1.234,56" → 1234.56,
 * „1 200,00 EUR" → 1200. Ungültige Eingabe ⇒ `null`.
 */
export function parseBetrag(text: string): number | null {
  if (typeof text !== "string") return null;
  return parseDeutscheZahl(text.replace(WAEHRUNGS_RE, " "));
}

/** Parst eine deutsche DEZIMAL-Zahl (Komma-Dezimaltrenner, Punkt/Leerzeichen als Tausender) oder `null`. */
export function parseDezimal(text: string): number | null {
  return parseDeutscheZahl(text);
}

/** Parst eine deutsche GANZE Zahl oder `null`. Eine Eingabe mit Nachkommastelle (z. B. „3,5") ist KEINE Ganzzahl. */
export function parseGanzzahl(text: string): number | null {
  const n = parseDeutscheZahl(text);
  if (n === null) return null;
  return Number.isInteger(n) ? n : null;
}

// ── IBAN (Formatprüfung + Mod-97-Prüfsumme, rein, ohne Netz) ──────────────────────────────────────
/** Grobformat einer IBAN: 2 Buchstaben (Land) + 2 Ziffern (Prüfziffer) + 11–30 alphanumerische Stellen (BBAN). */
const IBAN_FORMAT_RE = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;

/**
 * Prüft eine IBAN auf gültiges Format UND Mod-97-Prüfsumme (rein, ohne Netz/Registerabruf). Leerzeichen werden
 * ignoriert, Groß-/Kleinschreibung ist egal. Die Prüfsumme wird iterativ modulo 97 berechnet (kein BigInt, keine
 * Überläufe): die ersten vier Zeichen ans Ende, Buchstaben → Zahlen (A=10 … Z=35), Ergebnis muss 1 sein.
 */
export function istIban(text: string): boolean {
  if (typeof text !== "string") return false;
  const s = text.replace(WHITESPACE_RE, "").toUpperCase();
  if (!IBAN_FORMAT_RE.test(s)) return false;
  const umgestellt = s.slice(4) + s.slice(0, 4);
  let rest = 0;
  for (const zeichen of umgestellt) {
    // Buchstabe → zweistellige Zahl (A=10 … Z=35); Ziffer bleibt sich selbst.
    const stück =
      zeichen >= "A" && zeichen <= "Z"
        ? String(zeichen.charCodeAt(0) - 55)
        : zeichen;
    for (const ziffer of stück) {
      rest = (rest * 10 + (ziffer.charCodeAt(0) - 48)) % 97;
    }
  }
  return rest === 1;
}

// ── Datum (de-DE TT.MM.JJJJ → ISO) ────────────────────────────────────────────────────────────────
const DATUM_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** Anzahl Tage im Monat (1–12) unter Beachtung des Schaltjahrs — rein, ohne `Date`. */
function tageImMonat(jahr: number, monat: number): number {
  const schaltjahr = (jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0;
  const tage = [
    31,
    schaltjahr ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return tage[monat - 1] ?? 31;
}

/**
 * Parst ein deutsches Datum (TT.MM.JJJJ) zu einem ISO-Datum (JJJJ-MM-TT) oder `null`. Prüft Monat (1–12) und
 * Tag gegen die tatsächliche Monatslänge inkl. Schaltjahr — „31.04.2024" und „29.02.2023" sind ungültig. Rein
 * (kein `Date`), damit das Parsen deterministisch und zeitzonen-unabhängig bleibt.
 */
export function parseDatum(text: string): string | null {
  if (typeof text !== "string") return null;
  const m = text.trim().match(DATUM_RE);
  if (!m) return null;
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  const jahr = Number(m[3]);
  if (monat < 1 || monat > 12) return null;
  if (tag < 1 || tag > tageImMonat(jahr, monat)) return null;
  const tt = String(tag).padStart(2, "0");
  const mm = String(monat).padStart(2, "0");
  return `${jahr}-${mm}-${tt}`;
}

/** Ist die Eingabe ein gültiges deutsches Datum (TT.MM.JJJJ, kalendarisch existent)? */
export function istDatum(text: string): boolean {
  return parseDatum(text) !== null;
}

// ── DATEN-getriebene Feld-Validierung (EingabeRegel) ──────────────────────────────────────────────
/** Erwarteter fachlicher Typ einer Eingabe — steuert das Parsen/Prüfen in `validiereFeld`. */
export type EingabeTyp = "betrag" | "iban" | "datum" | "zahl" | "text";

/**
 * Eine generische, vendor-neutrale EINGABE-REGEL als DATEN. Bündelt Anwesenheit (`pflicht`), numerischen Bereich
 * (`min`/`max`, nur für `typ` „betrag"/„zahl"), Zeichenlänge (`minLaenge`/`maxLaenge`), ein Format-Muster (`muster`
 * als RegExp-Quelle) und einen erwarteten `typ`. `eigeneMeldung` ersetzt — falls gesetzt — die generische
 * Fehlermeldung für JEDE Verletzung dieses Feldes. Keine Domänen-Literale; die Werte liefert das Verfahren.
 */
export interface EingabeRegel {
  /** Pflichtangabe — eine leere Eingabe ist dann ungültig. */
  pflicht?: boolean;
  /** Numerischer Mindestwert (nur `typ` „betrag"/„zahl"). */
  min?: number;
  /** Numerischer Höchstwert (nur `typ` „betrag"/„zahl"). */
  max?: number;
  /** Mindest-Zeichenzahl der (getrimmten) Eingabe. */
  minLaenge?: number;
  /** Höchst-Zeichenzahl der (getrimmten) Eingabe. */
  maxLaenge?: number;
  /** Format-Muster als RegExp-Quelle (ein defektes Muster blockiert nicht — fail-open wie im Interpreter). */
  muster?: string;
  /** Erwarteter fachlicher Typ; steuert Parsen/Prüfung (Default „text"). */
  typ?: EingabeTyp;
  /** Ersetzt die generische Fehlermeldung dieses Feldes (eine Meldung je Regel). */
  eigeneMeldung?: string;
}

/** Das Ergebnis einer Feld-Prüfung: gültig (`ok`) oder mit einer handlungsleitenden `fehler`-Meldung. */
export interface FeldPruefung {
  ok: boolean;
  fehler?: string;
}

function fehlgeschlagen(fehler: string): FeldPruefung {
  return { ok: false, fehler };
}

/**
 * Prüft EINEN Feldwert gegen eine `EingabeRegel` — DATEN-getrieben, rein. Reihenfolge: Anwesenheit (Pflicht) →
 * Typ-Parsing (Betrag/Zahl/IBAN/Datum) → numerischer Bereich → Zeichenlänge → Format-Muster; die ERSTE Verletzung
 * liefert ihre Meldung. Eine leere, NICHT pflichtige Eingabe ist gültig. `eigeneMeldung` überschreibt — falls
 * gesetzt — die jeweilige Standardmeldung.
 */
export function validiereFeld(
  regel: EingabeRegel,
  wert: unknown,
): FeldPruefung {
  const text = asString(wert).trim();
  const meldung = (standard: string): string => regel.eigeneMeldung ?? standard;

  // 1. Anwesenheit — eine leere optionale Eingabe ist gültig.
  if (text === "") {
    return regel.pflicht
      ? fehlgeschlagen(meldung("Pflichtfeld."))
      : { ok: true };
  }

  // 2. Typ-Parsing (liefert für „betrag"/„zahl" die geparste Zahl für die Bereichsprüfung).
  let zahl: number | null = null;
  switch (regel.typ) {
    case "betrag":
      zahl = parseBetrag(text);
      if (zahl === null)
        return fehlgeschlagen(meldung("Bitte einen gültigen Betrag eingeben."));
      break;
    case "zahl":
      zahl = parseDezimal(text);
      if (zahl === null)
        return fehlgeschlagen(meldung("Bitte eine gültige Zahl eingeben."));
      break;
    case "iban":
      if (!istIban(text))
        return fehlgeschlagen(meldung("Bitte eine gültige IBAN eingeben."));
      break;
    case "datum":
      if (!istDatum(text))
        return fehlgeschlagen(
          meldung("Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben."),
        );
      break;
    default:
      break; // „text"/undefined: kein Typ-Parsing
  }

  // 3. Numerischer Bereich (nur bei erfolgreichem Zahl-/Betrag-Parsing).
  if (zahl !== null) {
    if (regel.min !== undefined && zahl < regel.min)
      return fehlgeschlagen(meldung(`Mindestens ${regel.min}.`));
    if (regel.max !== undefined && zahl > regel.max)
      return fehlgeschlagen(meldung(`Höchstens ${regel.max}.`));
  }

  // 4. Zeichenlänge.
  if (regel.minLaenge !== undefined && text.length < regel.minLaenge)
    return fehlgeschlagen(
      meldung(`Bitte mindestens ${regel.minLaenge} Zeichen eingeben.`),
    );
  if (regel.maxLaenge !== undefined && text.length > regel.maxLaenge)
    return fehlgeschlagen(
      meldung(`Bitte höchstens ${regel.maxLaenge} Zeichen eingeben.`),
    );

  // 5. Format-Muster (ein defektes Muster darf nicht blockieren).
  if (regel.muster) {
    try {
      if (!new RegExp(regel.muster).test(text))
        return fehlgeschlagen(
          meldung("Eingabe entspricht nicht dem erwarteten Format."),
        );
    } catch {
      /* fail-open: defektes Muster wird ignoriert */
    }
  }

  return { ok: true };
}

/**
 * Prüft MEHRERE Felder gegen ihre Regeln und liefert eine Fehler-Abbildung `feld → meldung` — nur für Felder MIT
 * Fehler (leer, wenn alles gültig ist). Passt direkt auf eine Fehlerzusammenfassung (`ErrorSummary`: feldId → text).
 */
export function validiereAlle(
  regeln: Record<string, EingabeRegel>,
  werte: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [feld, regel] of Object.entries(regeln)) {
    const pruefung = validiereFeld(regel, werte[feld]);
    if (!pruefung.ok && pruefung.fehler) out[feld] = pruefung.fehler;
  }
  return out;
}
