import { describe, expect, it } from "vitest";
import {
  evalAutomationen,
  pruefeAutomationen,
  type Aufgabe,
  type AutomationTrigger,
} from "@senticor/fachverfahren-kit";
import { workspaceConfig } from "./verfahren.registry.js";

// Testet die VERDRAHTETEN workspace-weiten Automations-Regeln (DATEN) über die getestete reine Auswertung —
// so ist das sichtbare Regelwerk (RegelwerkPanel) auch verhaltensseitig abgesichert, nicht nur gerendert.
const regeln = workspaceConfig.automationenGlobal ?? [];

function macheAufgabe(over: Partial<Aufgabe> = {}): Aufgabe {
  return {
    id: "task-1",
    vorgangId: "seed-1",
    procedureId: "musterantrag",
    tenantId: workspaceConfig.tenantId,
    authorityId: workspaceConfig.authorityId,
    jurisdictionId: workspaceConfig.jurisdictionId,
    titel: "Test",
    labels: [],
    sortRank: "V",
    version: 1,
    ...over,
  };
}

describe("verfahren.registry — workspace-weite Automations-Regeln", () => {
  it("konfiguriert überhaupt Regeln", () => {
    expect(regeln.length).toBeGreaterThan(0);
  });

  it("keine fail-closed Regel (jede mutierende Regel hat ein `wenn`)", () => {
    expect(pruefeAutomationen(regeln)).toEqual([]);
  });

  it("eskalation.frist feuert bei Fristablauf, wenn Priorität ≠ dringend", () => {
    const effekte = evalAutomationen(
      regeln,
      { art: "frist-erreicht", fristTyp: "bearbeitung" },
      { aufgabe: macheAufgabe({ prioritaet: "hoch" }) },
    );
    expect(effekte).toContainEqual({
      art: "setze-prioritaet",
      wert: "dringend",
    });
    expect(effekte).toContainEqual({ art: "label-hinzufuegen", label: "eilt" });
  });

  it("eskalation.frist feuert NICHT, wenn bereits dringend", () => {
    const effekte = evalAutomationen(
      regeln,
      { art: "frist-erreicht", fristTyp: "bearbeitung" },
      { aufgabe: macheAufgabe({ prioritaet: "dringend" }) },
    );
    expect(effekte.some((e) => e.art === "setze-prioritaet")).toBe(false);
  });

  it("inaktive Regel (zuweisung.eilige) feuert nie; aktive audit.uebergang hingegen schon", () => {
    const ereignis: AutomationTrigger = { art: "beim-uebergang" };
    const effekte = evalAutomationen(regeln, ereignis, {
      aufgabe: macheAufgabe({ prioritaet: "dringend" }),
    });
    expect(effekte.some((e) => e.art === "zuweisen")).toBe(false);
    expect(effekte).toContainEqual({
      art: "audit",
      aktion: "statuswechsel-protokolliert",
    });
  });
});
