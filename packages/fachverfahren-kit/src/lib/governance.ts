// fachverfahren-kit/lib/governance — die MONOTONE Governance-Derivation (Dual-Mode Phase 2), bewusst SELF-CONTAINED:
// nur `import type` (keine Value-Imports), damit die strip-types-Gates (check:leistung-contract / emit-contract, die
// `node --experimental-strip-types` direkt auf die .ts-Quellen fahren) dieses Modul UND `contract-snapshot` laden
// koennen, ohne an einem unaufloesbaren `.js`-Value-Import zu scheitern. So teilen DEV-Store, PROD-Contract und Gate
// EINE Wahrheit der abgeleiteten Governance — keine zweite, praezedenzlose Quelle.
import type { LeistungConfig, Transition } from "../types.js";

const transitionKey = (t: { from: string; to: string }) => `${t.from} ${t.to}`;

/** Die EFFEKTIVEN Transitionen: die deklarierten `statusMachine.transitions`, wobei jede Transition, die
 *  `governance.zusaetzlicheVierAugen` (from→to) nennt, zusaetzlich `vierAugen: true` traegt. Schaltet Vier-Augen
 *  NUR AN, NIE ab (Obermenge) — die Governance-Opt-in-Monotonie. Ohne `governance` (oder ohne Eintraege) wird die
 *  deklarierte Liste UNVERAENDERT (per Referenz) zurueckgegeben — Byte-identisches Verhalten. Rein (kein Datum/
 *  Random): DEV-Store, PROD-Contract UND Gate leiten dieselbe EINE Wahrheit ab, ohne eine zweite zu erzeugen. */
export function abgeleiteteTransitions(
  config: Pick<LeistungConfig, "statusMachine" | "governance">,
): Transition[] {
  const extra = config.governance?.zusaetzlicheVierAugen ?? [];
  if (extra.length === 0) return config.statusMachine.transitions;
  const gefordert = new Set(extra.map(transitionKey));
  return config.statusMachine.transitions.map((t) =>
    !t.vierAugen && gefordert.has(transitionKey(t))
      ? { ...t, vierAugen: true }
      : t,
  );
}

/** Positive Monotonie-Assertion: liefert die deklarierten Vier-Augen-Transitionen, die in der abgeleiteten Menge
 *  NICHT MEHR Vier-Augen-pflichtig sind (die Ableitung darf nur ANschalten). Leer = ok; nicht-leer = die Derivation
 *  hat Governance ABGESCHWAECHT (ein Fehler). Basis fuer Gate + Test — verriegelt, dass Governance-Opt-in strikt
 *  monoton bleibt und store.ts nie schwaechere Regeln als die Config sieht. */
export function governanceMonotonieVerletzungen(
  config: Pick<LeistungConfig, "statusMachine" | "governance">,
): { from: string; to: string }[] {
  const abgeleitetVierAugen = new Set(
    abgeleiteteTransitions(config)
      .filter((t) => t.vierAugen)
      .map(transitionKey),
  );
  return config.statusMachine.transitions
    .filter((t) => t.vierAugen && !abgeleitetVierAugen.has(transitionKey(t)))
    .map((t) => ({ from: t.from, to: t.to }));
}

/** Projiziert eine `LeistungConfig` auf ihre EFFEKTIVE Gestalt: `statusMachine.transitions` traegt die abgeleitete
 *  (governance-monoton verschaerfte) Vier-Augen-Menge. Der Contract-Snapshot wird hierueber gebildet, damit der
 *  committete `leistung.contract.json` — und damit die PROD-Policy, die ihre Vier-Augen-Pflicht AUS dem Contract
 *  liest — dieselbe Governance sieht wie der DEV-Store. Ohne `governance` byte-identisch (Transitions per Referenz). */
export function effektiveLeistungConfig<T = Record<string, unknown>>(
  config: LeistungConfig<T>,
): LeistungConfig<T> {
  const transitions = abgeleiteteTransitions(config);
  if (transitions === config.statusMachine.transitions) return config;
  return {
    ...config,
    statusMachine: { ...config.statusMachine, transitions },
  };
}
