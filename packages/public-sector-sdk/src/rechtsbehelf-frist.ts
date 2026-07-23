// rechtsbehelf-frist — die SERVER-AUTORITATIVE Fristberechnung für einen Rechtsbehelf (Issue #61,
// Akzeptanzkriterium „verspäteter Rechtsbehelf erkannt"). Rein + deterministisch (kein Date.now, keine DOM/
// Netz/Random): der Aufrufer (BFF) reicht Bekanntgabe-Anker + Regime + `nowIso` herein.
//
// BEWUSST server-seitig UND getrennt von der Client-Frist (`fachverfahren-kit/lib/frist.ts`, dort für die
// ANZEIGE der Fälligkeit): die Zulässigkeits-relevante Fristberechnung darf nie von Client-Code abhängen
// (Autorität nur server-seitig). Gleiche Kalender-Arithmetik (Monatsende-Klemmung), anderer Herr.
//
// Regime als DATEN: `fristWert`/`fristEinheit` stammen aus dem EINGEFRORENEN Rechtsbehelf des VA
// (regime-neutral — Widerspruch/Einspruch/Klage), nie aus einem hart kodierten „1 Monat".
import type { RechtsbehelfConfig } from "./domain-kernel.js";
import { addKalenderMonate } from "./kalender.js";

/** Das für die Fristberechnung nötige Minimum aus dem (eingefrorenen) Rechtsbehelf-Regime. */
export type RechtsbehelfFristRegime = Pick<
  RechtsbehelfConfig,
  "fristWert" | "fristEinheit"
>;

/**
 * Der EXKLUSIVE Verfristungs-Zeitpunkt: der Beginn (00:00 UTC) des Tages NACH dem Fristablauf. Die Frist
 * endet mit ABLAUF (24:00) ihres letzten Tages (§ 57 VwGO / § 222 ZPO i. V. m. §§ 187 Abs. 1, 188 BGB —
 * Standardfall); ab dem zurückgegebenen Zeitpunkt ist ein Rechtsbehelf verfristet, UNABHÄNGIG von der
 * Bekanntgabe-Uhrzeit (die Frist endet um 24:00, nicht zur Uhrzeit der Bekanntgabe).
 *
 * Standardfall: Der Ereignistag (Bekanntgabe) zählt nicht (§ 187 Abs. 1); eine Monatsfrist endet an dem Tag,
 * dessen Zahl dem Bekanntgabetag entspricht (§ 188 Abs. 2) → Anker + n Monate. Wochen = 7 Tage, Tage direkt.
 *
 * `null`, wenn der Anker kein gültiges Datum ist. Gibt einen ISO-8601-Zeitstempel zurück.
 *
 * @example
 * rechtsbehelfVerfristetAb("2026-01-15T10:00:00.000Z", { fristWert: 1, fristEinheit: "monat" })
 * // "2026-02-16T00:00:00.000Z" — am 15.02. (ganztags) noch fristgerecht, ab 16.02. 00:00 verfristet.
 */
export function rechtsbehelfVerfristetAb(
  bekanntgabeIso: string,
  regime: RechtsbehelfFristRegime,
): string | null {
  const anker = new Date(bekanntgabeIso);
  if (Number.isNaN(anker.getTime())) return null;
  const d = new Date(anker.getTime()); // Kopie — Anker bleibt unverändert.
  switch (regime.fristEinheit) {
    case "tag":
      d.setUTCDate(d.getUTCDate() + regime.fristWert);
      break;
    case "woche":
      d.setUTCDate(d.getUTCDate() + regime.fristWert * 7);
      break;
    case "monat":
      addKalenderMonate(d, regime.fristWert);
      break;
  }
  // Die Frist läuft mit ENDE des berechneten Tages ab → verfristet ist alles ab dem Folgetag 00:00 UTC.
  const ablauf = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return ablauf.toISOString();
}

/**
 * Ist ein zum `nowIso` eingelegter Rechtsbehelf verfristet? Standardfall (§§ 187 Abs. 1, 188 BGB).
 *
 * EHRLICH statt falscher Sicherheit: § 58 Abs. 2 VwGO (fehlende/falsche Rechtsbehelfsbelehrung → Jahresfrist)
 * und die Wiedereinsetzung in den vorigen Stand (§ 60 VwGO / § 32 VwVfG) werden NICHT geprüft — die
 * Zulässigkeits-ENTSCHEIDUNG bleibt der Behörde. Dieser Wert FLAGGT nur den regulären Fristablauf, damit die
 * Sachbearbeitung ihn sieht; er weist einen Rechtsbehelf nie von sich aus zurück.
 *
 * `null`, wenn Anker oder `nowIso` kein gültiges Datum ist (Frist unbestimmbar → nicht als verfristet werten).
 */
export function istRechtsbehelfVerfristet(
  bekanntgabeIso: string,
  regime: RechtsbehelfFristRegime,
  nowIso: string,
): boolean | null {
  const ab = rechtsbehelfVerfristetAb(bekanntgabeIso, regime);
  if (ab === null) return null;
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return null;
  return now.getTime() >= new Date(ab).getTime();
}
