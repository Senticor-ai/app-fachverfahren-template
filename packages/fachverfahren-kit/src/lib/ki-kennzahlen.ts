// lib/ki-kennzahlen — EINE Wahrheit für die KI-Aggregate über einen Vorgangsbestand.
//
// KERNREGEL: Bezugsgröße jeder KI-Quote sind die BEWERTETEN Vorgänge (`ki !== undefined`), NIE der
// Gesamtbestand. Ein Vorgang ohne KI-Einschätzung wurde von keinem Modell angefasst — er ist kein
// „0 % sicher"-Fall. Ihn mitzuzählen erfindet eine Modell-Aussage, die nie stattgefunden hat.
//
// WARUM ES DIESE DATEI GIBT: AufsichtDashboard und ReportingPanel rechneten die Quoten JEWILS SELBST,
// beide über `vorgaenge.length`. Dadurch mittelten sie die hart kodierten Seed-Konfidenzen (0.94) mit
// dem hart kodierten `confidence: 0` des echten Einreiche-Pfads zu einem „Ø KI-Konfidenz 94 %" — einer
// Leistungskennzahl, die niemand je gemessen hat, an ZWEI Orten unabhängig voneinander. Eine geteilte
// reine Funktion macht die Regel testbar und verhindert, dass die Wahrheiten wieder auseinanderlaufen.
//
// REIN: kein Date/Random/DOM/Netz — deterministisch aus den übergebenen Daten (wie interpreter.ts).
import type { Vorgang } from "../types.js";

/** Aggregierte KI-Kennzahlen eines Vorgangsbestands. Quoten sind 0..1 (die Sicht formatiert). */
export interface KiKennzahlen {
  /** Vorgänge im Bestand insgesamt (bewertet ODER nicht). */
  total: number;
  /** Vorgänge MIT KI-Einschätzung — die Bezugsgröße aller Quoten unten. */
  bewertet: number;
  /** Ist überhaupt etwas bewertet? `false` heißt: kein Modell gebunden → Quoten sind bezugslos und
   *  DÜRFEN nicht als Messwert (z. B. „0 %") dargestellt werden. Sichten zeigen dann „—". */
  aktiv: boolean;
  /** Bewertete Vorgänge mit Konfidenz ≥ Schwelle UND ohne Flags. */
  autonomFaehig: number;
  /** autonomFaehig / bewertet (0 wenn nichts bewertet). */
  autonomQuote: number;
  /** Mittlere Konfidenz über die BEWERTETEN (0 wenn nichts bewertet). */
  avgConfidence: number;
  /** Bewertete Vorgänge mit mindestens einem Flag (Review-Indikator). */
  mitFlags: number;
  /** mitFlags / bewertet (0 wenn nichts bewertet). */
  flagQuote: number;
}

/**
 * Aggregiert die KI-Kennzahlen eines Bestands — ausschließlich über bewertete Vorgänge.
 *
 * @param vorgaenge Der Bestand (bewertete und unbewertete gemischt).
 * @param schwelle  Konfidenz-Schwelle für „autonom-fähig" (aus `config.ki.schwelleAutonom`).
 */
export function kiKennzahlen<T>(
  vorgaenge: Vorgang<T>[],
  schwelle: number,
): KiKennzahlen {
  const total = vorgaenge.length;
  const bewertete = vorgaenge.filter((v) => v.ki !== undefined);
  const bewertet = bewertete.length;
  if (bewertet === 0) {
    return {
      total,
      bewertet: 0,
      aktiv: false,
      autonomFaehig: 0,
      autonomQuote: 0,
      avgConfidence: 0,
      mitFlags: 0,
      flagQuote: 0,
    };
  }
  let autonomFaehig = 0;
  let mitFlags = 0;
  let summeConfidence = 0;
  for (const v of bewertete) {
    // Non-null via Filter oben; optionale Kette hält es unter strictNullChecks lesbar.
    const confidence = v.ki?.confidence ?? 0;
    const flags = v.ki?.flags ?? [];
    summeConfidence += confidence;
    if (confidence >= schwelle && flags.length === 0) autonomFaehig += 1;
    if (flags.length > 0) mitFlags += 1;
  }
  return {
    total,
    bewertet,
    aktiv: true,
    autonomFaehig,
    autonomQuote: autonomFaehig / bewertet,
    avgConfidence: summeConfidence / bewertet,
    mitFlags,
    flagQuote: mitFlags / bewertet,
  };
}

/** Bezugsgrößen-Text für eine KPI-Kachel: „3 von 12 bewertet" bzw. offen „kein KI-Modell aktiv". */
export function kiBezugText(k: KiKennzahlen): string {
  return k.aktiv
    ? `${k.bewertet} von ${k.total} bewertet`
    : "kein KI-Modell aktiv";
}
