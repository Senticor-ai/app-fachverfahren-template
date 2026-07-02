// format — EINE Wahrheit für die Betrags-Anzeige aus einer Berechnung/Position.
//
// Konvention (siehe types.ts `Berechnung.betrag`): `betrag` ist in der NATÜRLICHEN Haupteinheit der `einheit` —
// bei WÄHRUNGS-Einheiten (EUR/…) also in ganzen Euro (120 = „120,00 €"), NICHT in Cent. Das ist die Einheit, in der
// die Fachkonzepte ihre Sätze/Gebühren führen und in der der governte Build sie in die `leistung.config` generiert
// (z. B. Gebühr 26 = „26 €", Jahres-Satz 120 = „120 €/Jahr"). Nicht-Währungs-Einheiten ("Stück",
// "je Einheit") sind ganzzahlig je Einheit → unverändert als Zahl + Einheit.
//
// EINE Funktion für ALLE Betrags-Anzeigen (Antrag-Live-Berechnung, Bescheid, Aufsicht, E-Payment) — keine
// divergierenden Formatierer, keine Einheiten-Umrechnung, die jede Config an /100 erinnern müsste.

const CURRENCY_RE = /\b(EUR|USD|CHF|GBP)\b/i;

/** Formatiert `betrag` (natürliche Haupteinheit der `einheit`) für die Anzeige. `einheit` z. B. "EUR/Jahr", "EUR", "Stück". */
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
      }).format(betrag);
    } catch {
      txt = new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(betrag);
    }
    return suffix ? `${txt}${suffix.startsWith("/") ? "" : " "}${suffix}` : txt;
  }
  return `${new Intl.NumberFormat("de-DE").format(betrag)} ${einheit ?? ""}`.trim();
}

/** Datei-Größe menschenlesbar (de-DE) — EINE Wahrheit für Datei-Uploads (inline `file`-Feld + DateiUpload). */
export function formatDateiGroesse(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const einheiten = ["KB", "MB", "GB", "TB"];
  let wert = bytes / 1024;
  let i = 0;
  while (wert >= 1024 && i < einheiten.length - 1) {
    wert /= 1024;
    i += 1;
  }
  const gerundet =
    wert >= 10 || Number.isInteger(wert)
      ? Math.round(wert)
      : Math.round(wert * 10) / 10;
  return `${new Intl.NumberFormat("de-DE").format(gerundet)} ${einheiten[i]}`;
}
