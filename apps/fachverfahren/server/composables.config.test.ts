// composables.config.test — der Vertrag der deklarierten Composables dieses Fachverfahrens: sie müssen
// wohlgeformt sein (assertComposable, inkl. Spine-Governance) UND das zertifizierte Musterverfahren muss
// vollständig sein (certificationReadiness). Ein Agent, der externe Composables domänen-spezifisch erzeugt,
// erbt dieses Gate — ein kaputtes/unvollständiges Composable fällt hier auf, nicht erst in Produktion.
import { describe, expect, it } from "vitest";
import {
  assertComposable,
  certificationReadiness,
  createInMemoryComposableRegistry,
  istRechtsnah,
} from "@senticor/public-sector-sdk";
import {
  composables,
  createComposableRegistry,
  musterverfahrenComposable,
} from "./composables.config.js";

describe("composables.config — deklarierte Composables dieses Fachverfahrens", () => {
  it("alle deklarierten Composables sind wohlgeformt (inkl. Spine-Governance)", () => {
    for (const c of composables) {
      expect(() => assertComposable(c)).not.toThrow();
    }
  });

  it("die Registry baut ohne Fehler + findet das Musterverfahren-Composable", () => {
    const reg = createComposableRegistry();
    expect(reg.get("musterverfahren")?.displayName).toContain(
      "Musterverfahren",
    );
    // Nur das certified Musterverfahren ist enabled; der candidate Antrag nicht.
    expect(reg.listEnabled().map((c) => c.id)).toEqual(["musterverfahren"]);
  });

  it("das Musterverfahren-Composable ist zertifizierungsreif (alle Ebenen vollständig)", () => {
    const r = certificationReadiness(musterverfahrenComposable);
    expect(r.certifiable).toBe(true);
    expect(r.fehlend).toEqual([]);
  });

  it("der Musterverfahren-Spine ist rechtsnah und bleibt bei AAL-2 Advise (KI beraet, entscheidet nie)", () => {
    const spine = musterverfahrenComposable.spine!;
    expect(istRechtsnah(spine)).toBe(true);
    expect(spine.autonomy).toBe("AAL-2");
    // Der volle Eskalationspfad des Nutzer-Mandats.
    expect(spine.aufgaben).toContain("subsumtion");
    expect(spine.aufgaben).toContain("review");
  });

  it("die moduleId jedes Composables verweist auf ein Verfahren (deterministische Naht)", () => {
    for (const c of composables) {
      expect(c.moduleId).toBeTruthy();
    }
    // Sanity: die Registry akzeptiert die Liste (assertComposable je Eintrag).
    expect(() => createInMemoryComposableRegistry(composables)).not.toThrow();
  });
});
