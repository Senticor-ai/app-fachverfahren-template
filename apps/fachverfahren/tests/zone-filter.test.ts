// zone-filter.test — der ZONEN-EXPERIENCE-FILTER des Frontends (app/zone.ts). Filtert die Routen-Deskriptoren nach den
// erlaubten Flächen der Zone: `persona`-Routen bleiben nur, wenn ihre Persona erlaubt ist; alles andere (public/session/
// permission) bleibt IMMER. `null`/leer ⇒ fail-open (alle Routen). Pur + deterministisch — dieselbe ZONE_SURFACES-Wahrheit
// wie das BFF-Route-Gate + die NetworkPolicy (aus readZoneModel) → Frontend, BFF und Deploy können nicht divergieren.
import { describe, expect, it } from "vitest";
import { appRoutes } from "../src/app/routes.js";
import { filterRoutesByZone } from "../src/app/zone.js";

const personaOf = (route: (typeof appRoutes)[number]): string | null =>
  route.gate.kind === "persona" ? route.gate.persona : null;
const personasIn = (
  routes: readonly (typeof appRoutes)[number][],
): Set<string> =>
  new Set(routes.map(personaOf).filter((p): p is string => p !== null));
const nonPersonaCount = (
  routes: readonly (typeof appRoutes)[number][],
): number => routes.filter((r) => r.gate.kind !== "persona").length;

describe("filterRoutesByZone", () => {
  it("null ⇒ unverändert (NICHT zoniert ⇒ fail-open, Ein-App)", () => {
    expect(filterRoutesByZone(appRoutes, null)).toHaveLength(appRoutes.length);
  });

  it("leere Liste (zonierte STRUKTUR-Zone) ⇒ KEINE persona-Route, nur Nicht-Persona — NICHT fail-open", () => {
    // Sentinel-Disziplin: `[]` ≠ `null`. Eine zonierte Daten-Zone blendet ALLE Flächen aus (nie fail-open).
    const filtered = filterRoutesByZone(appRoutes, []);
    expect(personasIn(filtered).size).toBe(0);
    expect(filtered.length).toBe(nonPersonaCount(appRoutes));
  });

  it("['buerger'] ⇒ nur buerger-Persona-Routen; keine sachbearbeitung/aufsicht", () => {
    const filtered = filterRoutesByZone(appRoutes, ["buerger"]);
    expect(personasIn(filtered)).toEqual(new Set(["buerger"]));
  });

  it("['sachbearbeitung','aufsicht'] ⇒ keine buerger-Persona-Route", () => {
    const filtered = filterRoutesByZone(appRoutes, [
      "sachbearbeitung",
      "aufsicht",
    ]);
    expect(personasIn(filtered).has("buerger")).toBe(false);
    expect(personasIn(filtered).has("sachbearbeitung")).toBe(true);
  });

  it("Nicht-Persona-Routen (public/session/permission) bleiben IMMER erhalten", () => {
    const total = nonPersonaCount(appRoutes);
    for (const allow of [
      ["buerger"],
      ["aufsicht"],
      ["sachbearbeitung", "aufsicht"],
    ]) {
      expect(nonPersonaCount(filterRoutesByZone(appRoutes, allow))).toBe(total);
    }
  });

  it("die gefilterte Menge ist stets eine Teilmenge der Originalrouten (nie erfunden)", () => {
    const filtered = filterRoutesByZone(appRoutes, ["buerger"]);
    for (const route of filtered) expect(appRoutes).toContain(route);
  });
});
