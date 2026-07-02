// format — EINE Wahrheit für die Betrags-Anzeige aus einer Berechnung/Position.
//
// Konvention (siehe types.ts `Berechnung.betrag`): bei WÄHRUNGS-Einheiten (EUR/…) ist `betrag` in der KLEINSTEN Einheit
// (Cent, ganzzahlig, währungssicher) → für die Anzeige durch 100 teilen und als Währung formatieren. Nicht-Währungs-
// Einheiten ("Stück", "je Einheit") sind ganzzahlig je Einheit → unverändert als Zahl + Einheit.
//
// Ohne diese Teilung erschien 12000 Cent (= 120,00 €) fälschlich als „12.000,00 €" — ein 100×-Fehler in JEDER
// Betrags-Anzeige des Kits (Antrag-Live-Berechnung, Bescheid, Aufsicht, E-Payment). Diese EINE Funktion ersetzt die
// zuvor 4 divergierenden, cent-blinden Formatierer.

const CURRENCY_RE = /\b(EUR|USD|CHF|GBP)\b/i;

/** Formatiert `betrag` (bei Währungs-`einheit` in Cent) für die Anzeige. `einheit` z. B. "EUR/Jahr", "EUR", "Stück". */
export function formatBetrag(betrag: number, einheit: string): string {
  const m = (einheit ?? "").match(CURRENCY_RE);
  if (m) {
    const currency = m[1].toUpperCase();
    const suffix = einheit.replace(m[0], "").trim(); // "EUR/Jahr" → "/Jahr"; "EUR" → ""
    let txt: string;
    try {
      txt = new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency,
      }).format(betrag / 100);
    } catch {
      txt = new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(betrag / 100);
    }
    return suffix ? `${txt}${suffix.startsWith("/") ? "" : " "}${suffix}` : txt;
  }
  return `${new Intl.NumberFormat("de-DE").format(betrag)} ${einheit ?? ""}`.trim();
}
