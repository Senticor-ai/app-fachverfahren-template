// fachverfahren-kit/lib/status-machine — die EINE Wahrheit über die Status-State-Machine.
//
// „Erlaubten Übergang finden" und „erlaubte Übergänge listen" waren zuvor 5-fach handkopiert (store.uebergang,
// store.transitionsFrom, automation-run, VorgangBoard, indirekt im Server-Katalog). Diese reinen Funktionen sind die
// einzige Quelle; alle Aufrufer im Kit importieren sie. `validiereStatusMachine` prüft die strukturelle
// Vollständigkeit (Erreichbarkeit, Endzustände, Kanten-Konsistenz) — die Basis der Simulations-Invariante.
import type { StatusDef, StatusMachine, Transition } from "../types.js";

/** Findet den EINEN erlaubten Übergang `from → to` (optional rollen-gefiltert), oder `undefined`. Tolerant gegen
 *  eine unvollständige/fehlende Machine (defensiv wie der bestehende Store). */
export function findeUebergang(
  sm: StatusMachine | undefined,
  from: string,
  to: string,
  rolle?: string,
): Transition | undefined {
  return (sm?.transitions ?? []).find(
    (t) =>
      t.from === from &&
      t.to === to &&
      (rolle === undefined || t.rollen.includes(rolle)),
  );
}

/** Alle von `from` aus erlaubten Übergänge (optional rollen-gefiltert). */
export function erlaubteUebergaenge(
  sm: StatusMachine | undefined,
  from: string,
  rolle?: string,
): Transition[] {
  return (sm?.transitions ?? []).filter(
    (t) => t.from === from && (rolle === undefined || t.rollen.includes(rolle)),
  );
}

/** Ein strukturelles Problem einer StatusMachine. */
export interface StatusMachineProblem {
  art:
    | "initial-fehlt"
    | "kante-unbekannter-state"
    | "sackgasse"
    | "terminal-mit-ausgang"
    | "unerreichbar"
    | "keine-states";
  state?: string;
  meldung: string;
}

/**
 * Prüft die StatusMachine auf strukturelle VOLLSTÄNDIGKEIT (rein): `initial` liegt in `states`; jede Kante referenziert
 * existierende States; jeder NICHT-terminale State hat ≥1 Ausgang (keine Sackgasse); jeder TERMINALE State hat 0
 * Ausgänge; jeder State ist vom `initial` aus erreichbar. Liefert die Liste der Verstöße (leer = wohlgeformt).
 */
export function validiereStatusMachine(
  sm: StatusMachine,
): StatusMachineProblem[] {
  const probleme: StatusMachineProblem[] = [];
  const states = sm.states ?? [];
  if (states.length === 0) {
    probleme.push({
      art: "keine-states",
      meldung: "StatusMachine ohne states.",
    });
    return probleme;
  }
  const byKey = new Map<string, StatusDef>(states.map((s) => [s.key, s]));

  if (!byKey.has(sm.initial))
    probleme.push({
      art: "initial-fehlt",
      state: sm.initial,
      meldung: `Initialzustand „${sm.initial}" ist kein deklarierter State.`,
    });

  const ausgaenge = new Map<string, number>();
  for (const t of sm.transitions ?? []) {
    if (!byKey.has(t.from))
      probleme.push({
        art: "kante-unbekannter-state",
        state: t.from,
        meldung: `Übergang aus unbekanntem State „${t.from}".`,
      });
    if (!byKey.has(t.to))
      probleme.push({
        art: "kante-unbekannter-state",
        state: t.to,
        meldung: `Übergang in unbekannten State „${t.to}".`,
      });
    ausgaenge.set(t.from, (ausgaenge.get(t.from) ?? 0) + 1);
  }

  for (const s of states) {
    const anzahl = ausgaenge.get(s.key) ?? 0;
    if (s.terminal && anzahl > 0)
      probleme.push({
        art: "terminal-mit-ausgang",
        state: s.key,
        meldung: `Endzustand „${s.key}" hat ${anzahl} ausgehende Übergänge.`,
      });
    if (!s.terminal && anzahl === 0)
      probleme.push({
        art: "sackgasse",
        state: s.key,
        meldung: `Nicht-terminaler State „${s.key}" ist eine Sackgasse (kein Ausgang).`,
      });
  }

  // Erreichbarkeit vom initial (BFS).
  const erreichbar = new Set<string>();
  const queue: string[] = byKey.has(sm.initial) ? [sm.initial] : [];
  while (queue.length) {
    const cur = queue.shift()!;
    if (erreichbar.has(cur)) continue;
    erreichbar.add(cur);
    for (const t of sm.transitions ?? [])
      if (t.from === cur && byKey.has(t.to) && !erreichbar.has(t.to))
        queue.push(t.to);
  }
  for (const s of states)
    if (!erreichbar.has(s.key))
      probleme.push({
        art: "unerreichbar",
        state: s.key,
        meldung: `State „${s.key}" ist vom Initialzustand aus nicht erreichbar.`,
      });

  return probleme;
}
