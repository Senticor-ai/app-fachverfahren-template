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
  } else {
    // DER ERFOLG WAR STUMM — und damit war der Null-Zustand von aussen nicht vom Erfolg zu unterscheiden.
    //
    // GEMESSEN (2026-07-30, erzeugtes Verfahren `grundsteuer`): der Server lief mit 0 gemounteten Stellen, weil sein
    // kompiliertes `dist-server` ZWEI TAGE aelter war als seine Quelle und noch den alten, relativ aufgeloesten
    // Mount-Pfad trug. Nach dem Neubau montierten 9 von 9 Manifesten, 0 uebersprungen. Beide Zustaende sahen im
    // Betrieb IDENTISCH aus: der Rueckfall-Zweig meldet nur die Abwesenheit, und die 9 Muster-Composables des Kits
    // tragen dieselben Namen wie die generierten Stellen — es gab keine Zeile, an der man den Unterschied sah.
    //
    // Eine Zusicherung braucht ihre POSITIV-KONTROLLE. Deshalb sagt der Erfolg jetzt, WIE VIELE Stellen aus WELCHEM
    // Verzeichnis leben und WIE sie heissen. Das ist die einzige Zeile, an der ein Betrieb den Unterschied zwischen
    // „die generierten Stellen arbeiten" und „das Template-Muster arbeitet" ablesen kann.
    // UND DIE VIERTE ZAHL, die bisher fehlte: GEMOUNTET ist nicht WAEHLBAR.
    //
    // GEMESSEN (2026-07-30, drei erzeugte Verfahren): 6/6, 8/8 und 9/9 Manifeste gemountet, 0 uebersprungen — und
    // `registry.listEnabled()` = 0 an ALLEN dreien. Die Laufzeit-Auswahl geht ueber `istEnabled` (status ∈
    // certified|active); die generierten Stellen stehen im Lebenszyklus auf `incubated`/`candidate`. Drei
    // uebereinstimmende Mount-Zahlen koennen also vollstaendig taeuschen, weil der Konsument nach einem VIERTEN
    // Kriterium auswaehlt. Diese Zeile ist der Ort, an dem ein Betrieb das sieht.
    const waehlbar = mounted.filter(
      (c) => c.status === "certified" || c.status === "active",
    );
    const stati = [
      ...new Set(mounted.map((c) => String(c.status ?? "(ohne status)"))),
    ].sort();
    log(
      `[composables] ${mounted.length} generierte Stelle(n) gemountet aus ${dir}: ${mounted.map((c) => c.id).join(", ")}` +
        ` — davon ${waehlbar.length} laufzeit-waehlbar (status: ${stati.join("/")}` +
        `${waehlbar.length === 0 ? "; waehlbar wird eine Stelle mit certified/active, also ueber eine Zertifizierung — nicht ueber ein Flag" : ""}).`,
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
