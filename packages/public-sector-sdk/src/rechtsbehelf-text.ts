// rechtsbehelf-text — DER EINE BELEHRUNGSSATZ-BAUER. Rein, deterministisch, domänenfrei.
//
// WARUM DIESE DATEI EXISTIERT (adversariales Fachaudit, Befund S1): der Belehrungstext wurde an ZWEI Stellen
// unabhängig zusammengesetzt — im Web-Bescheid (`fachverfahren-kit/components/BescheidView.tsx`) und im
// PDF-Renderer (`apps/fachverfahren/server/bescheid/pdf.ts`). Die beiden Sätze wichen ab: das PDF schrieb
// `${rb.art}` roh (kleingeschriebenes „widerspruch"/„einspruch") und verdrahtete das Verb hart auf „erhoben"
// (für den Einspruch heißt es „eingelegt"); beide nannten weder SITZ noch FORM. Jeder dieser Mängel für sich
// macht die Belehrung UNRICHTIG — Rechtsfolge: Rechtsbehelfsfrist EIN JAHR statt der Regelfrist
// (§ 356 Abs. 2 AO / § 58 Abs. 2 VwGO), für JEDEN erlassenen Bescheid.
//
// DESHALB: EIN Bauer, zwei Konsumenten (Web + PDF + jede weitere Fläche). Reuse heißt hier „dasselbe Modul
// mounten", nicht „den Satz nachbauen". Der Bauer trägt KEIN Domänen-Literal: Art/Frist/Stelle/Sitz/Form/Norm
// und die Fiktionsnorm sind DATEN aus dem eingefrorenen Regime; ob AO- oder VwVfG-Schiene, entscheidet
// ausschließlich, was der Verwaltungsakt mitführt. Ein Vergabe-/HR-/Justiz-Bescheid rendert damit denselben
// Satzbau mit anderen Daten.
//
// Bewusst KEIN React/DOM/Node — ein reiner String-Bauer, damit ihn Browser (Kit) UND Server (PDF) mounten können.
import type { RechtsbehelfConfig } from "./domain-kernel.js";

/** Die Bekanntgabe-Fiktion, wie sie im VA eingefroren ist (Tage + Norm der EIGENEN Verfahrensschiene). */
export interface BekanntgabeFiktion {
  fiktionTage: number;
  /** Norm der EIGENEN Schiene: AO-Verfahren „§ 122 Abs. 2 AO", VwVfG-Verfahren „§ 41 Abs. 2 VwVfG". */
  fiktionNorm: string;
}

/** Name des Rechtsbehelfs im Satz — GROSS geschrieben (Substantiv), nie das rohe Enum-Token. */
export function rechtsbehelfName(art: RechtsbehelfConfig["art"]): string {
  return art === "einspruch"
    ? "Einspruch"
    : art === "klage"
      ? "Klage"
      : "Widerspruch";
}

/** Partizip: „eingelegt" (Einspruch) bzw. „erhoben" (Widerspruch/Klage) — grammatisch korrekt je Regime. */
export function rechtsbehelfVerb(art: RechtsbehelfConfig["art"]): string {
  return art === "einspruch" ? "eingelegt" : "erhoben";
}

/** Fristdauer im Dativ, für „innerhalb …": „einem Monat", „zwei Wochen", „14 Tagen". */
export function fristText(
  wert: number,
  einheit: RechtsbehelfConfig["fristEinheit"],
): string {
  const wortEins: Record<RechtsbehelfConfig["fristEinheit"], string> = {
    monat: "einem Monat",
    woche: "einer Woche",
    tag: "einem Tag",
  };
  const wortPlural: Record<RechtsbehelfConfig["fristEinheit"], string> = {
    monat: "Monaten",
    woche: "Wochen",
    tag: "Tagen",
  };
  return wert === 1 ? wortEins[einheit] : `${wert} ${wortPlural[einheit]}`;
}

/** Ordinalzahl-Wort für die Bekanntgabefiktion („am vierten Tag"); 1–7 ausgeschrieben, sonst „N.". */
export function ordinalTag(n: number): string {
  const w: Record<number, string> = {
    1: "ersten",
    2: "zweiten",
    3: "dritten",
    4: "vierten",
    5: "fünften",
    6: "sechsten",
    7: "siebten",
  };
  return w[n] ?? `${n}.`;
}

/**
 * Welche PFLICHT-SLOTS der Belehrung fehlen? Leeres Array = vollständig.
 *
 * Die Slots sind die gesetzlichen Mindestangaben einer Rechtsbehelfsbelehrung, schienen-neutral formuliert:
 * ART des Rechtsbehelfs, die BEHÖRDE/Stelle, deren SITZ, die FRIST und die FORM (§ 356 Abs. 1, § 357 Abs. 1 AO;
 * § 58 Abs. 1, § 70 Abs. 1 VwGO). Reine Prüffunktion ohne Seiteneffekt — der Server nutzt sie fail-closed am
 * Erlass, die Fabrik als Gate.
 */
export function fehlendeBelehrungsSlots(
  rb: Partial<RechtsbehelfConfig> | undefined | null,
): string[] {
  const fehlt: string[] = [];
  const leer = (v: unknown): boolean =>
    typeof v !== "string" || v.trim().length === 0;
  if (!rb) return ["art", "stelle", "sitz", "frist", "form", "norm"];
  if (leer(rb.art)) fehlt.push("art");
  if (leer(rb.stelle)) fehlt.push("stelle");
  if (leer(rb.sitz)) fehlt.push("sitz");
  if (
    typeof rb.fristWert !== "number" ||
    !Number.isFinite(rb.fristWert) ||
    rb.fristWert <= 0 ||
    leer(rb.fristEinheit)
  )
    fehlt.push("frist");
  if (leer(rb.form)) fehlt.push("form");
  if (leer(rb.norm)) fehlt.push("norm");
  return fehlt;
}

/**
 * DER EINE Belehrungssatz. Baut aus dem (eingefrorenen) Regime + der Bekanntgabe-Fiktion den vollständigen,
 * grammatisch korrekten Text — identisch auf JEDER Fläche (Web, PDF, Vorschau, Postfach).
 *
 * Der Satz nennt: ART · STELLE · SITZ · FRIST · FORM · NORM des Rechtsbehelfs sowie die Bekanntgabe-Fiktion
 * mit der Norm der EIGENEN Schiene. Fehlt ein Pflicht-Slot, wird er NICHT still weggelassen (das erzeugte
 * genau den Audit-Befund) — der Bauer wirft. Wer eine Belehrung braucht, muss ein vollständiges Regime haben;
 * wer keines hat, darf keinen Bescheid erlassen (`fehlendeBelehrungsSlots` vorher prüfen, fail-closed).
 */
export function formatRechtsbehelfsbelehrung(
  rb: RechtsbehelfConfig,
  fiktion: BekanntgabeFiktion,
): string {
  const fehlt = fehlendeBelehrungsSlots(rb);
  if (fehlt.length > 0)
    throw new Error(
      `Rechtsbehelfsbelehrung unvollständig — es fehlen: ${fehlt.join(", ")}. ` +
        "Eine unvollständige Belehrung ist eine UNRICHTIGE Belehrung (Frist ein Jahr statt Regelfrist, " +
        "§ 356 Abs. 2 AO / § 58 Abs. 2 VwGO). Das Verfahren muss das Regime vollständig deklarieren.",
    );
  const name = rechtsbehelfName(rb.art);
  const verb = rechtsbehelfVerb(rb.art);
  return (
    `Gegen diesen Bescheid kann innerhalb von ${fristText(rb.fristWert, rb.fristEinheit)} nach Bekanntgabe ` +
    `${name} ${verb} werden (${rb.norm}). Der ${name} ist bei ${rb.stelle}, ${rb.sitz}, ` +
    `${rb.form} anzubringen. Die Frist beginnt mit dem Tag der Bekanntgabe dieses Bescheides. Erfolgt die ` +
    `Bekanntgabe durch die Post im Inland, gilt der Bescheid am ${ordinalTag(fiktion.fiktionTage)} Tag nach ` +
    `Aufgabe zur Post als bekannt gegeben (${fiktion.fiktionNorm}). Wird der ${name} nicht oder nicht ` +
    `fristgerecht ${verb}, wird der Bescheid bestandskräftig.`
  );
}
