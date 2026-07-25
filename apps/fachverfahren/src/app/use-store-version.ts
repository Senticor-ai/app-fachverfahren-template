// use-store-version — Reaktivität: die Kit-Bausteine lesen `port.list()` synchron. Über
// diesen Hook re-rendert eine Routen-Sicht, sobald sich der Store ändert (neuer Antrag,
// Status-Übergang) — der Store bleibt die EINE Quelle.
import { useSyncExternalStore } from "react";
import type { FachverfahrenStore } from "@senticor/fachverfahren-kit";
import { store } from "../store.js";

/** Abonniert einen Store-Snapshot. Ohne Argument der Bürger-Store (rückwärtskompatibel); die
 *  Amts-Sichten reichen ihren eigenen (behörden-scoped) Store herein. */
export function useStoreVersion(
  welcher: FachverfahrenStore<Record<string, unknown>> = store,
): unknown {
  return useSyncExternalStore(
    (cb) => welcher.use.subscribe(cb),
    () => welcher.use.getState().vorgaenge,
    () => welcher.use.getState().vorgaenge,
  );
}
