// aufbewahrung — die server-autoritative Prüfung einer gesetzlichen AUFBEWAHRUNGSFRIST (Records-Retention,
// Issue #55). Rein + deterministisch (kein Date.now): der Aufrufer reicht Abschlusszeitpunkt + Frist + `nowIso`.
//
// „Verfahren = DATEN": die FRIST selbst (`aufbewahrungMonate`) wird am Verfahren DEKLARIERT (ProcedureVersion),
// nicht hier erfunden — welche §-Frist (z. B. § 84 SGB X: 10 Jahre) gilt, ist eine Fach-/Rechtsentscheidung des
// Konsumenten. Dieses Modul ENFORCED die deklarierte Frist: solange sie läuft, blockiert sie die DSGVO-Löschung
// (Art. 17 Abs. 3 lit. b DSGVO — Aufbewahrung zur Erfüllung einer rechtlichen Verpflichtung).
//
// Gemessen ab FALLABSCHLUSS (`closedAt`): ein offener Fall (kein `closedAt`) hat noch keine laufende
// Aufbewahrungsfrist — seine Daten sind in aktiver Bearbeitung, nicht im Archiv.
import { addKalenderMonate } from "./kalender.js";

/** Das Ende der Aufbewahrungsfrist: `closedAt` + `aufbewahrungMonate` (Kalender, Monatsende-Klemmung).
 *  `null`, wenn kein gültiger Abschlusszeitpunkt vorliegt. Gibt einen ISO-8601-Zeitstempel zurück. */
export function aufbewahrungsende(
  closedAtIso: string,
  aufbewahrungMonate: number,
): string | null {
  const closed = new Date(closedAtIso);
  if (Number.isNaN(closed.getTime())) return null;
  const d = new Date(closed.getTime());
  addKalenderMonate(d, aufbewahrungMonate);
  return d.toISOString();
}

/**
 * Läuft zum Zeitpunkt `nowIso` noch eine gesetzliche Aufbewahrungsfrist? `true` blockiert die Löschung.
 *
 * `false`, wenn keine Frist deklariert ist (`aufbewahrungMonate` fehlt/≤ 0), der Fall NICHT abgeschlossen ist
 * (`closedAt` fehlt — Frist noch nicht angelaufen) oder die Frist bereits abgelaufen ist. So ist das
 * Default-Verhalten (kein deklariertes `aufbewahrungMonate`) unverändert: keine zusätzliche Sperre.
 */
export function aufbewahrungLaeuft(
  closedAtIso: string | null | undefined,
  aufbewahrungMonate: number | undefined,
  nowIso: string,
): boolean {
  if (!aufbewahrungMonate || aufbewahrungMonate <= 0) return false;
  if (!closedAtIso) return false; // Nicht abgeschlossen → Frist nicht angelaufen.
  const ende = aufbewahrungsende(closedAtIso, aufbewahrungMonate);
  if (ende === null) return false;
  const now = new Date(nowIso);
  if (Number.isNaN(now.getTime())) return false;
  return now.getTime() < new Date(ende).getTime();
}
