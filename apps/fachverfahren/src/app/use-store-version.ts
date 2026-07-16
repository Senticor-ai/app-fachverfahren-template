// use-store-version — Reaktivität: zustand-Subscription für Seitenkomponenten, die beim
// Remount erneut laden müssen. Die Kit-Bausteine (Arbeitsvorrat, AufsichtDashboard,
// ReviewWorkspace) laden Daten über useVorgaenge/useVorgang (async) beim Mounten selbst.
// Dieser Hook sorgt dafür, dass Seitenkomponenten beim Store-Wechsel neu rendern und damit
// die Kit-Bausteine nach Navigation-Remounts frische Daten laden.
import { useSyncExternalStore } from "react";
import { store } from "../store.js";

export function useStoreVersion(): unknown {
  return useSyncExternalStore(
    (cb) => store.use.subscribe(cb),
    () => store.use.getState().vorgaenge,
    () => store.use.getState().vorgaenge,
  );
}
