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
  log: (msg: string) => void = (msg) => console.warn(msg),
): ComposableRegistry {
  const dir = resolveMountedComposablesDir(env);
  const {
    composables: mounted,
    uebersprungen,
    archetypBrueche,
  } = loadMountedComposables(dir);
  // EHRLICHER RÜCKFALL (E3/E4): der Rückfall auf die Muster war bisher STILL — ein Deploy ohne die generierten
  // Stellen sah exakt aus wie ein Template-Start, und niemand konnte den Unterschied sehen. Er wird jetzt benannt,
  // mitsamt dem geprüften Verzeichnis und den fail-closed übersprungenen Manifesten.
  if (!mounted.length) {
    log(
      `[composables] Keine gemounteten Stellen unter ${dir} — Rückfall auf die ${composables.length} Muster-Composables.` +
        (uebersprungen.length
          ? ` ${uebersprungen.length} Manifest(e) fail-closed übersprungen: ${uebersprungen.map((u) => `${u.file} (${u.grund})`).join(" · ")}`
          : " Kein Manifest gefunden (Template-Start oder Deploy ohne .chos/mesh/composables)."),
    );
  } else if (uebersprungen.length) {
    log(
      `[composables] ${mounted.length} Stelle(n) gemountet, ${uebersprungen.length} fail-closed übersprungen: ${uebersprungen.map((u) => `${u.file} (${u.grund})`).join(" · ")}`,
    );
  }
  // ARCHETYP-BRUCH benennen — unabhängig davon, ob gemountet oder zurückgefallen wurde.
  //
  // WARUM EIGENER ZWEIG: ein Bruch ist kein Mount-Fehler. Die Stelle ist wohlgeformt, sie lädt, sie arbeitet — nur
  // widerspricht ihre BEFUGNIS dem Archetyp, aus dem sie abgeleitet wurde (ein Initiator, der Bescheide erlässt).
  // Er wäre in den beiden Zweigen oben nie aufgetaucht: dort ist nichts übersprungen und nichts leer.
  //
  // NICHT BLOCKEND, UND DAS IST DIE ENTSCHEIDUNG: ob ein Bruch den Start verhindert, gehört in die Verfassung —
  // dieses Kit BENENNT ihn. Ein stiller Bruch dagegen wäre genau die Klasse, gegen die die Vorlagen gebaut wurden.
  if (archetypBrueche.length) {
    log(
      `[composables] ${archetypBrueche.length} ARCHETYP-BRUCH: ` +
        archetypBrueche.map((b) => `${b.id} — ${b.bruch}`).join(" · "),
    );
  }
  return createInMemoryComposableRegistry(
    mounted.length ? mounted : composables,
  );
}
