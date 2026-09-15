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
import { enabledEqualsProductive } from "./composable-subject.js";

describe("composables.config — deklarierte Composables dieses Fachverfahrens", () => {
  it("alle deklarierten Composables sind wohlgeformt (inkl. Spine-Governance)", () => {
    for (const c of composables) {
      expect(() => assertComposable(c)).not.toThrow();
    }
  });

  // ── THE SUBJECT COMES FROM THE REGISTRY, NOT FROM A NAME ────────────────────────────────────────────────
  // This used to read `reg.get("musterverfahren")` and `listEnabled() === ["musterverfahren"]`. Both held ONLY
  // in this template: in a built procedure `createComposableRegistry` MOUNTS the emitted places and states about
  // itself that the generated truth REPLACES the demo patterns. So the witness contradicted the documented intent
  // of the file it tests — and was red in EVERY generated procedure (measured 2026-08-31 against two independent
  // procedures, identical in both).
  // The property at stake is twofold: the registry BUILDS (assertComposable would throw while building), and
  // `enabled` is EXACTLY the productively usable set — not a copied list of names.
  it("the registry builds without error and carries at least one place", () => {
    const reg = createComposableRegistry();
    // POSITIVE CONTROL: without it, "the property holds" would be indistinguishable from "the registry is empty"
    // — an empty set satisfies every universal claim below it.
    expect(reg.list().length).toBeGreaterThan(0);
  });

  it("`enabled` is EXACTLY the productively usable set (certified/active) — not a copied list", () => {
    expect(enabledEqualsProductive(createComposableRegistry())).toBe(true);
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
