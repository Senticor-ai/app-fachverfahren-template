// zone — der ZONEN-EXPERIENCE-FILTER des Frontends (BSI-Netzsegmentierung). Läuft eine Instanz in einer Zone (Deploy-Env
// ZONE_SURFACES → runtime-config.json), blendet das Frontend die Flächen (Personas) außerhalb dieser Zone AUS: die
// internet-exponierte Bürger-Zone zeigt keinen Amt-/Aufsichts-Einstieg. Das ist eine EXPERIENCE-Grenze (wie der Persona-
// Filter selbst) — die HARTE Grenze ist das BFF-Route-Gate (plugin.ts) + die k8s-NetworkPolicy. Dieselbe ZONE_SURFACES-
// Wahrheit wie beide (aus readZoneModel) → Frontend, BFF und Deploy können nicht divergieren. Fail-open: keine/leere
// Zonen-Angabe ⇒ ALLE Flächen (heutiger Ein-App-Zustand).
import { useEffect, useState } from "react";
import { loadRuntimeConfig } from "../runtime-config.js";
import type { AppRouteDefinition } from "./route-definition.js";

/** Filtert die Routen-Deskriptoren nach den erlaubten Flächen der Zone: eine `persona`-Route bleibt NUR, wenn ihre Persona
 *  in `allowedSurfaces` liegt. SENTINEL-DISZIPLIN: `null` ⇒ NICHT zoniert ⇒ alle Routen unverändert (fail-open). Ein LEERES
 *  Array ist etwas ANDERES — eine zonierte Struktur-Zone ⇒ KEINE persona-Route (alle ausgeblendet). Nicht-persona-Routen
 *  (public/session/permission) bleiben IMMER (Infra/quer). Pur + deterministisch (unit-getestet). */
export function filterRoutesByZone(
  routes: readonly AppRouteDefinition[],
  allowedSurfaces: readonly string[] | null,
): AppRouteDefinition[] {
  if (allowedSurfaces === null) return [...routes];
  const allow = new Set(allowedSurfaces);
  return routes.filter(
    (route) => route.gate.kind !== "persona" || allow.has(route.gate.persona),
  );
}

/** Liest die erlaubten Flächen der Zone aus runtime-config.json (async). Startwert `null` (= keine Restriktion, fail-open),
 *  bis die Config geladen ist — die App rendert nie „leer" auf einen Zonen-/Ladefehler. Das SIGNAL ist die PRÄSENZ des
 *  `zone`-Feldes (der Deploy setzt es auf jeder zonierten Instanz): fehlt es ⇒ bleibt `null` (fail-open). Ist es da ⇒ die
 *  (ggf. leere) `allowedSurfaces`-Menge greift — eine leere Menge (Struktur-Zone) blendet ALLE Flächen aus (nie fail-open). */
export function useZoneAllowedSurfaces(): readonly string[] | null {
  const [allowed, setAllowed] = useState<readonly string[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRuntimeConfig().then((config) => {
      const zone = config?.zone;
      if (alive && zone) setAllowed(zone.allowedSurfaces ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);
  return allowed;
}
