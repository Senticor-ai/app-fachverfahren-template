// composables.config — die Composable-NAHT dieses Fachverfahrens (CHOS Blueprint v5.0). Der Laufzeit-Einstieg:
// `createComposableRegistry` liefert die aktive Composable-Wahrheit an den BFF (index.ts / mesh-harness).
//
// CHOS GENERATES (Ziel-1 S8, „never hand-code"): sind im Verfahrens-Build die adressierbaren Stellen-Manifeste
// EMITTIERT worden (`.chos/mesh/composables/<id>.json`, Schreiber CHOS `mesh-emit.writeComposableManifests`), sind
// SIE die Composable-Wahrheit — `createComposableRegistry` MOUNTET sie (composables-mounted → mapManifestToComposable)
// statt der hier hand-deklarierten Muster. So ist die Verdrahtung GENERIERT, nicht mehr hand-geschrieben.
//
// Die hand-deklarierten MUSTER (composables.muster — I/O-frei, gate-ladbar) bleiben der saubere Fallback, solange
// kein Build gelaufen ist (Template ohne `.chos/`). Sie werden von der generierten Wahrheit ERSETZT (kein Vermischen).
//
// KONSUMENTEN-HOHEIT (wie procedure.config): template:update überschreibt diese Datei NICHT.
import {
  createInMemoryComposableRegistry,
  type ComposableRegistry,
} from "@senticor/public-sector-sdk";
import {
  loadMountedComposables,
  resolveMountedComposablesDir,
} from "./composables-mounted.js";
import { composables } from "./composables.muster.js";

// Die Muster-Composables (Fallback) re-exportieren — bestehende Konsumenten/Gates beziehen sie weiter von hier.
export {
  composables,
  musterverfahrenComposable,
  musterantragComposable,
} from "./composables.muster.js";

/**
 * Die ComposableRegistry dieses Fachverfahrens (wirft bei einem wohlgeformten Verstoß schon beim Bauen).
 *
 * CHOS GENERATES: liegen im Verfahrens-Build EMITTIERTE Manifeste vor (`.chos/mesh/composables/*.json`), werden SIE
 * gemountet (mapManifestToComposable — Governance erzwungen, certified/active ohne verdienten Beleg auf candidate
 * gekappt). Fehlt das Verzeichnis / lädt nichts, fällt es sauber auf die hand-deklarierten Muster zurück. Der
 * Mount-Scan ist best-effort (wirft nie); die generierte Wahrheit ERSETZT die Muster (kein Vermischen).
 */
export function createComposableRegistry(
  env: NodeJS.ProcessEnv = process.env,
): ComposableRegistry {
  const { composables: mounted } = loadMountedComposables(
    resolveMountedComposablesDir(env),
  );
  return createInMemoryComposableRegistry(
    mounted.length ? mounted : composables,
  );
}
