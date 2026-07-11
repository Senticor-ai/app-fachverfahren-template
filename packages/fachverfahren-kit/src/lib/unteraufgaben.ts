// Sub-Issues / Unteraufgaben (Plane-Muster) als REINE Ableitung aus dem flachen Aufgabenbestand — kein eigener
// Store-Zustand, keine Netz-/DOM-/Zeit-Abhängigkeit. Eine Aufgabe verweist über `parentAufgabeId` auf ihre
// übergeordnete Aufgabe (flache Ein-Ebenen-Gruppierung, s. types.ts). Diese Helfer bilden daraus die Eltern-/
// Kind-Sicht: Wurzeln fürs Board (kein Doppel-Eintrag), Kinder + Anzahl je Elternteil fürs Detail/Rollup.
import type { Aufgabe } from "../types.js";

/** Eine Aufgabe ist eine WURZEL, wenn sie keiner anderen untergeordnet ist (kein `parentAufgabeId`). Reines
 *  Pro-Element-Prädikat („ist das KEIN Sub-Issue"). Fürs Board-Filtern siehe `boardWurzeln` (behandelt Waisen). */
export function istWurzel(a: Aufgabe): boolean {
  return !a.parentAufgabeId;
}

/** Die Aufgaben, die das Board als EIGENE Karten zeigt: echte Wurzeln (kein Parent) UND „Waisen", deren Parent NICHT
 *  (mehr) im Bestand ist — sonst verschwände eine Unteraufgabe unter einem fehlenden Elternteil unsichtbar. So
 *  bleibt jede Aufgabe erreichbar; nur Kinder mit EXISTIERENDEM Parent sind aufs Detail beschränkt. */
export function boardWurzeln(alle: readonly Aufgabe[]): Aufgabe[] {
  const ids = new Set(alle.map((a) => a.id));
  return alle.filter((a) => !a.parentAufgabeId || !ids.has(a.parentAufgabeId));
}

/** Die Karten, die das GEFILTERTE Board zeigt: jede Board-Wurzel PLUS jedes (gefilterte) Kind, dessen Parent im
 *  gefilterten Bestand NICHT sichtbar ist. Ohne die zweite Bedingung würde eine filter-treffende Unteraufgabe
 *  UNSICHTBAR/unerreichbar, wenn ihr Parent den Filter nicht erfüllt (der Parent zeigt sie nicht im Detail, weil er
 *  selbst weggefiltert ist — z. B. „Nur meine", Kind mir zugewiesen, Parent nicht). Kinder mit SICHTBAREM Parent
 *  bleiben aufs Detail beschränkt (kein Doppel-Board-Eintrag). `alleUngefiltert` bestimmt die Wurzel-/Waisen-Menge,
 *  `gefiltert` ist das bereits gefilterte `listTasks(filter)`. */
export function boardKarten(
  alleUngefiltert: readonly Aufgabe[],
  gefiltert: readonly Aufgabe[],
): Aufgabe[] {
  const wurzelIds = new Set(boardWurzeln(alleUngefiltert).map((a) => a.id));
  const sichtbar = new Set(gefiltert.map((a) => a.id));
  return gefiltert.filter(
    (a) => wurzelIds.has(a.id) || !sichtbar.has(a.parentAufgabeId ?? ""),
  );
}

/** Die direkten Unteraufgaben von `parentId`, in stabiler Rang-Reihenfolge (wie `listTasks` bereits liefert). */
export function unteraufgabenVon(
  alle: readonly Aufgabe[],
  parentId: string,
): Aufgabe[] {
  return alle.filter((a) => a.parentAufgabeId === parentId);
}

/** Kind-Anzahl je Elternaufgabe (für das Rollup-Badge auf der Board-Karte). Verweise auf nicht (mehr) vorhandene
 *  Eltern werden ignoriert — die Anzahl zählt nur real existierende Kinder. */
export function kinderAnzahl(alle: readonly Aufgabe[]): Map<string, number> {
  const zaehler = new Map<string, number>();
  for (const a of alle) {
    if (!a.parentAufgabeId) continue;
    zaehler.set(a.parentAufgabeId, (zaehler.get(a.parentAufgabeId) ?? 0) + 1);
  }
  return zaehler;
}
