// lib/frist — Typisierte Fristen als DATEN: EINE Wahrheit für Dauer-Anzeige + kalendergenaue Fälligkeit.
//
// Eine Frist wird als { wert, einheit } modelliert (eine Monatsfrist z. B. als { wert: 1, einheit: "monat" }),
// NICHT als roher Tage-Wert — sonst kollabiert „1 Monat" zu „1 Tag" bzw. muss über „30 Tage" genähert werden
// (genau die Wurzel des Content-Audits). `formatFristDauer` rendert die Dauer in korrektem Deutsch (Singular/
// Plural); `faelligkeitAb` leitet aus einem Ankerdatum die Fälligkeit über ECHTE Kalender-Arithmetik ab
// (addMonths-/addYears-Äquivalent mit Monatsende-Klemmung — kein Tage×30) — stabil-absolut, ohne Date.now.
//
// GENERISCH + data-driven: keine Domänen-Literale. Die Einheit steuert Anzeige UND Arithmetik; alles kommt als
// Daten herein. Die Zeit-Einheit-Enumeration lebt in ../types (EINE Wahrheit, geteilt mit FristTyp/FristItem).
import type { FristDauer, FristEinheit } from "../types.js";

/** Default-Einheit, wenn eine Dauer keine `einheit` trägt — ein reiner Zahl-Wert bleibt so als Tage lesbar. */
export const FRIST_EINHEIT_DEFAULT: FristEinheit = "tag";

/** Singular/Plural-Beschriftung je Zeit-Einheit (deutsche Amtssprache). */
const EINHEIT_LABEL: Record<
  FristEinheit,
  { singular: string; plural: string }
> = {
  tag: { singular: "Tag", plural: "Tage" },
  woche: { singular: "Woche", plural: "Wochen" },
  monat: { singular: "Monat", plural: "Monate" },
  jahr: { singular: "Jahr", plural: "Jahre" },
};

/**
 * Rendert eine typisierte Frist-Dauer in korrektem Deutsch: 1 → „1 Monat", 4 → „4 Monate", 1 → „1 Tag",
 * 4 → „4 Tage", 4 → „4 Jahre". Fehlt `einheit`, gilt der Default "tag" (ein reiner Zahl-Wert bleibt lesbar).
 * Die Einheit bestimmt das Wort — eine Monatsfrist wird NIE als „1 Tag"/„30 Tage" gerendert.
 */
export function formatFristDauer(
  wert: number,
  einheit: FristEinheit = FRIST_EINHEIT_DEFAULT,
): string {
  const meta = EINHEIT_LABEL[einheit] ?? EINHEIT_LABEL[FRIST_EINHEIT_DEFAULT];
  const zahl = new Intl.NumberFormat("de-DE").format(wert);
  // |wert| === 1 ⇒ Singular („1 Monat"), sonst Plural („4 Monate", „0 Tage").
  const wort = Math.abs(wert) === 1 ? meta.singular : meta.plural;
  return `${zahl} ${wort}`;
}

/** Bequemer Wrapper für ein `FristDauer`-Objekt (Default-Einheit "tag" bei fehlender `einheit`). */
export function formatFristDauerObj(dauer: FristDauer): string {
  return formatFristDauer(dauer.wert, dauer.einheit ?? FRIST_EINHEIT_DEFAULT);
}

/**
 * Parst einen Anker-ISO-Zeitstempel STABIL als UTC. Ein ISO-8601-Zeitanteil OHNE Offset (kein „Z", kein
 * „±hh[:mm]") wird von ECMAScript als LOKALZEIT interpretiert — die daraus abgeleitete Fälligkeit hinge dann an
 * der Server-Zeitzone (nicht reproduzierbar, entgegen der dokumentierten UTC-Semantik). Wir lesen einen
 * offsetlosen Zeitanteil daher als UTC (Suffix „Z"). Date-only-Formen ("2026-01-15") sind laut Spec bereits UTC;
 * Zeitanteile mit Offset bleiben unverändert absolut. Nur der Bereich NACH dem „T" wird auf einen Offset geprüft
 * (das Datum enthält „-", das sonst fälschlich als Offset zählte).
 */
function ankerAlsUtc(iso: string): Date {
  const t = iso.indexOf("T");
  const hatOffset =
    t >= 0 && /(?:[zZ]|[+-]\d{2}(?::?\d{2})?)$/.test(iso.slice(t));
  return new Date(t >= 0 && !hatOffset ? `${iso}Z` : iso);
}

/** Addiert `n` Kalendermonate auf `d` (UTC-Kalender) mit Monatsende-Klemmung: 31.01. + 1 Monat → 28./29.02.
 *  (nicht 03.03.). Zuerst auf den 1. setzen verhindert den Monatsüberlauf, dann auf den geklemmten Tag. */
function addKalenderMonate(d: Date, n: number): void {
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  // Letzter Tag des Zielmonats: Tag 0 des Folgemonats.
  const letzterTag = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(tag, letzterTag));
}

/**
 * Leitet aus einem Anker-ISO-Zeitstempel die Fälligkeit ab — ECHTE Kalender-Arithmetik (kein Tage×30):
 * Monate/Jahre über die Kalender-Komponenten (mit Monatsende-Klemmung), Wochen = 7 Tage, Tage direkt.
 * Stabil-absolut: rechnet allein aus `ankerIso` (kein Date.now → reproduzierbar). Gibt einen ISO-8601-
 * Zeitstempel zurück; `null`, wenn der Anker kein gültiges Datum ist.
 *
 * @example
 * faelligkeitAb("2026-01-15T00:00:00.000Z", 1, "monat") // "2026-02-15T00:00:00.000Z"
 * faelligkeitAb("2026-01-31T00:00:00.000Z", 1, "monat") // "2026-02-28T00:00:00.000Z" (Monatsende-Klemmung)
 */
export function faelligkeitAb(
  ankerIso: string,
  wert: number,
  einheit: FristEinheit = FRIST_EINHEIT_DEFAULT,
): string | null {
  const anker = ankerAlsUtc(ankerIso);
  if (Number.isNaN(anker.getTime())) return null;
  const d = new Date(anker.getTime()); // Kopie — Anker bleibt unverändert.
  switch (einheit) {
    case "tag":
      d.setUTCDate(d.getUTCDate() + wert);
      break;
    case "woche":
      d.setUTCDate(d.getUTCDate() + wert * 7);
      break;
    case "monat":
      addKalenderMonate(d, wert);
      break;
    case "jahr":
      addKalenderMonate(d, wert * 12);
      break;
  }
  return d.toISOString();
}

/** Bequemer Wrapper für ein `FristDauer`-Objekt (Default-Einheit "tag" bei fehlender `einheit`). */
export function faelligkeitAbDauer(
  ankerIso: string,
  dauer: FristDauer,
): string | null {
  return faelligkeitAb(
    ankerIso,
    dauer.wert,
    dauer.einheit ?? FRIST_EINHEIT_DEFAULT,
  );
}
