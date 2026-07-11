// lib/portal — reine Helfer für DATEN-getriebene Portale (mehrere Bürger-Applikationen aus EINER Registry).
//
// Ein „Portal" (eine konkrete Bürger-/Behörden-App) bietet i. d. R. nur eine TEILMENGE der bekannten Verfahren an
// (z. B. das Steuer-Portal andere als das Sozial-Portal). `waehleVerfahren` filtert die verfahrensübergreifende
// WorkspaceConfig auf die für DIESES Portal freigeschalteten Verfahren — additiv, rückwärtskompatibel: ohne Auswahl
// bleiben alle Verfahren aktiv. Rein & deterministisch (kein DOM/Env/Netz).
import type { WorkspaceConfig } from "../types.js";

/**
 * Beschränkt die `verfahren` einer WorkspaceConfig auf die im Portal freigeschalteten `enabledProcedures`
 * (procedureIds). Fehlt/leer die Auswahl ⇒ Config unverändert (alle Verfahren). FAIL-SAFE: trifft die Auswahl KEIN
 * bekanntes Verfahren (Fehlkonfiguration), bleibt die Config ebenfalls unverändert — ein Portal ohne jedes Verfahren
 * wäre unbenutzbar. Reihenfolge der ausgewählten Verfahren bleibt erhalten (das erste bleibt das primäre).
 */
export function waehleVerfahren(
  config: WorkspaceConfig,
  enabledProcedures?: readonly string[],
): WorkspaceConfig {
  if (!enabledProcedures || enabledProcedures.length === 0) return config;
  const erlaubt = new Set(enabledProcedures);
  const gefiltert = config.verfahren.filter((v) => erlaubt.has(v.procedureId));
  if (gefiltert.length === 0) return config;
  return { ...config, verfahren: gefiltert };
}
