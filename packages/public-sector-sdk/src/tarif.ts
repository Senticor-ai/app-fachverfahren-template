// tarif — SERVER-AUTORITATIVE Betragsberechnung als DATEN (SDK). Löst den Root-Cause der client-berechneten
// Tenor-/Sollstellungs-Herkunft: ein DEKLARATIVER Tarif (Kategorie → Betrag) ist server-NACHRECHENBAR, anders
// als der client-only `berechne`-Escape-Hatch (leistung.config, Client-TS). Damit kann der Server sowohl den
// Bescheid-Tenor server-verifizieren (tenorHerkunft „server-nachgerechnet") ALS AUCH die Rückforderungs-
// Sollstellung (#62) autoritativ bestimmen — OHNE einen client-gelieferten Betrag zu übernehmen. Die vom
// Client stammende KATEGORIE ist eine zulässige Eingabe (was beantragt wurde); die HÖHE bestimmt allein der
// server-hinterlegte Tarif (wie eine Gebührensatzung). Rein, deterministisch, GANZZAHLIGE Cent.

/** Eine Tarif-Position: für eine Kategorie ein fester Betrag (Cent). */
export interface TarifPosition {
  kategorie: string;
  betragCent: number;
  label?: string;
}

/** Der server-hinterlegte Tarif (Gebührensatzung als DATEN). `defaultCent` greift bei unbekannter Kategorie. */
export interface TarifTabelle {
  positionen: readonly TarifPosition[];
  /** Betrag bei nicht gelisteter Kategorie (Default 0 → „unbekannt", nicht verrechenbar). */
  defaultCent?: number;
}

export interface TarifErgebnis {
  betragCent: number;
  kategorie: string;
  /** War die Kategorie im Tarif hinterlegt? `false` ⇒ Fallback/`defaultCent` — ehrliche Provenienz. */
  bekannt: boolean;
  label?: string;
}

/** Nur ganzzahlige, endliche, nicht-negative Cent zählen (defensiv gegen fehlerhaft gepflegte Tarife). */
function normCent(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Berechnet den server-autoritativen Betrag für eine Kategorie aus dem hinterlegten Tarif. Die erste
 * passende Position gewinnt (deterministisch). Unbekannte Kategorie → `defaultCent` (Default 0) + `bekannt:false`.
 */
export function berechneTarif(
  tabelle: TarifTabelle,
  kategorie: string,
): TarifErgebnis {
  const treffer = tabelle.positionen.find((p) => p.kategorie === kategorie);
  if (treffer) {
    return {
      betragCent: normCent(treffer.betragCent),
      kategorie,
      bekannt: true,
      ...(treffer.label !== undefined ? { label: treffer.label } : {}),
    };
  }
  return {
    betragCent: normCent(tabelle.defaultCent ?? 0),
    kategorie,
    bekannt: false,
  };
}
