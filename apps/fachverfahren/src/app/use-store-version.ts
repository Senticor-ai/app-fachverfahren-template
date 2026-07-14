// use-store-version — Reaktivität: die Kit-Bausteine lesen `port.list()` synchron. Über
// diesen Hook re-rendert eine Routen-Sicht, sobald sich der Store ändert (neuer Antrag,
// Status-Übergang) — der Store bleibt die EINE Quelle.
import { useSyncExternalStore } from "react";
import { store } from "../store.js";

export function useStoreVersion(): unknown {
  return useSyncExternalStore(
    (cb) => store.use.subscribe(cb),
    () => store.use.getState().vorgaenge,
    () => store.use.getState().vorgaenge,
  );
}
