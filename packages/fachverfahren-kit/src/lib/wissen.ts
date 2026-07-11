// lib/wissen — reine Helfer für die Wissensbasis/Wiki: Volltext-Filter + mehrstufige Hierarchie (Baum).
//
// Rein & deterministisch (kein DOM/Date/Netz), damit die Wiki-Navigation testbar ist und die Komponente reines
// Rendering bleibt. Vendor-neutral: arbeitet nur auf den Config-Artikeln.
import type { WissensArtikel } from "../types.js";

/** Ein Baum-Eintrag: der Artikel + seine Tiefe (0 = Wurzel) für die eingerückte Navigation. */
export interface WissensBaumEintrag {
  artikel: WissensArtikel;
  tiefe: number;
}

/**
 * Volltext-Filter über `titel` + `markdown` (case-insensitive, getrimmt). Leere Suche ⇒ alle Artikel unverändert
 * (Reihenfolge bewahrt). So findet die Sachbearbeitung einen Artikel, ohne die Kategorie zu kennen.
 */
export function filtereWissen(
  artikel: readonly WissensArtikel[],
  suche: string,
): WissensArtikel[] {
  const q = suche.trim().toLowerCase();
  if (q === "") return [...artikel];
  return artikel.filter(
    (a) =>
      a.titel.toLowerCase().includes(q) || a.markdown.toLowerCase().includes(q),
  );
}

/**
 * Ordnet die Artikel zu einer MEHRSTUFIGEN Hierarchie (Tiefensuche ab den Wurzeln) und liefert sie FLACH mit
 * `tiefe` für die eingerückte Darstellung. Wurzeln = Artikel ohne `parentId` ODER mit einem `parentId`, das kein
 * bekannter Artikel ist (defensive Config). Kinder folgen ihrem Elternteil in Einfüge-Reihenfolge. Zyklen/
 * Doppelbesuche werden über ein `gesehen`-Set abgefangen (kein Infinite-Loop), verwaiste Reste am Ende angehängt
 * — kein Artikel geht verloren. Rein.
 */
export function wissensBaum(
  artikel: readonly WissensArtikel[],
): WissensBaumEintrag[] {
  const bekannt = new Set(artikel.map((a) => a.id));
  const kinder = new Map<string, WissensArtikel[]>();
  for (const a of artikel) {
    if (a.parentId !== undefined && bekannt.has(a.parentId)) {
      const liste = kinder.get(a.parentId) ?? [];
      liste.push(a);
      kinder.set(a.parentId, liste);
    }
  }
  const out: WissensBaumEintrag[] = [];
  const gesehen = new Set<string>();
  const besuche = (a: WissensArtikel, tiefe: number): void => {
    if (gesehen.has(a.id)) return;
    gesehen.add(a.id);
    out.push({ artikel: a, tiefe });
    for (const kind of kinder.get(a.id) ?? []) besuche(kind, tiefe + 1);
  };
  for (const a of artikel)
    if (a.parentId === undefined || !bekannt.has(a.parentId)) besuche(a, 0);
  // Verwaiste (nur über einen Zyklus erreichbar) defensiv anhängen — nichts verlieren.
  for (const a of artikel) if (!gesehen.has(a.id)) besuche(a, 0);
  return out;
}

/** True, wenn IRGENDEIN Artikel eine (gültige) `parentId` trägt — dann rendert die Navigation den Baum statt der
 *  flachen Kategorie-Gruppierung. */
export function hatHierarchie(artikel: readonly WissensArtikel[]): boolean {
  const bekannt = new Set(artikel.map((a) => a.id));
  return artikel.some(
    (a) => a.parentId !== undefined && bekannt.has(a.parentId),
  );
}
