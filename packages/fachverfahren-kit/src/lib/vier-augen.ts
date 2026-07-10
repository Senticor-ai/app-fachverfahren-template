// fachverfahren-kit/lib/vier-augen — die reine Vier-Augen-Kernregel für die DEV-Laufzeit.
//
// Die Regel „Vorbereiter einer kritischen Entscheidung ≠ Freigeber" braucht den VORBEREITER: den Akteur des LETZTEN
// fachlichen STATUS-Übergangs (`art === "uebergang"`), NICHT irgendeinen History-Akteur — sonst „vergiften" Label-/
// Zuweisungs-/Automations-Vermerke die Prüfung. Diese reine Funktion ist die EINE DEV-seitige Wahrheit; sie wird vom
// DEV-Store genutzt. Die server-autoritative Seite (public-sector-sdk) prüft dieselbe Regel gegen das Audit-Log
// (`eventType.startsWith("case.")`) — die Simulation (tests/simulation) erzwingt den Gleichlauf beider Seiten.
import type { VorgangHistorie } from "../types.js";

/** Kanonische `art`-Marke eines fachlichen Statusübergangs in der Historie (load-bearing für Vier-Augen). */
export const HISTORIE_ART_UEBERGANG = "uebergang" as const;

/**
 * Der Akteur des LETZTEN fachlichen Übergangs (der Vorbereiter), oder `undefined`, wenn es keinen gibt. Rein.
 * Ignoriert bewusst alle Nicht-Übergangs-Vermerke (`art !== "uebergang"`), damit Metadaten-/Automations-Einträge die
 * Vier-Augen-Prüfung nicht aushebeln.
 */
export function letzterVorbereiter(
  history: readonly VorgangHistorie[],
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i]!;
    if (h.art === HISTORIE_ART_UEBERGANG && h.akteur) return h.akteur;
  }
  return undefined;
}
