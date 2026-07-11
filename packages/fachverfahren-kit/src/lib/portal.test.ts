import { describe, it, expect } from "vitest";
import type { LeistungConfig, WorkspaceConfig } from "../types.js";
import { waehleVerfahren } from "./portal.js";

const leistung = (id: string): LeistungConfig => ({
  id,
  label: id,
  kommune: "Musterstadt",
  rechtsgrundlagen: [],
  antrag: { steps: [] },
  statusMachine: {
    initial: "eingegangen",
    states: [{ key: "eingegangen", label: "Eingegangen", tone: "neu" }],
    transitions: [],
  },
  register: { suchfelder: [] },
  detailSektionen: [],
});

const config: WorkspaceConfig = {
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  verfahren: [
    { procedureId: "steuern", config: leistung("steuern") },
    { procedureId: "soziales", config: leistung("soziales") },
    { procedureId: "bau", config: leistung("bau") },
  ],
  prioritaeten: [],
  labels: [],
};

describe("waehleVerfahren — Portal bietet eine Teilmenge der Verfahren", () => {
  it("ohne Auswahl bleiben ALLE Verfahren (rückwärtskompatibel)", () => {
    expect(waehleVerfahren(config).verfahren.map((v) => v.procedureId)).toEqual(
      ["steuern", "soziales", "bau"],
    );
    expect(waehleVerfahren(config, []).verfahren).toHaveLength(3);
  });

  it("beschränkt auf die freigeschalteten procedureIds (Reihenfolge erhalten)", () => {
    const portal = waehleVerfahren(config, ["bau", "steuern"]);
    // Reihenfolge folgt der Registry (erstes bleibt primär), nicht der Auswahl-Reihenfolge.
    expect(portal.verfahren.map((v) => v.procedureId)).toEqual([
      "steuern",
      "bau",
    ]);
  });

  it("ignoriert unbekannte IDs; trifft die Auswahl KEIN Verfahren → unverändert (fail-safe, kein leeres Portal)", () => {
    expect(
      waehleVerfahren(config, ["soziales", "gibtsnicht"]).verfahren.map(
        (v) => v.procedureId,
      ),
    ).toEqual(["soziales"]);
    expect(
      waehleVerfahren(config, ["nur-unbekannt"]).verfahren.map(
        (v) => v.procedureId,
      ),
    ).toEqual(["steuern", "soziales", "bau"]);
  });

  it("lässt tenant/authority/prioritäten/labels unangetastet", () => {
    const portal = waehleVerfahren(config, ["steuern"]);
    expect(portal.tenantId).toBe("t1");
    expect(portal.authorityId).toBe("b1");
    expect(portal.jurisdictionId).toBe("de");
  });
});
