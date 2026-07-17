import { describe, expect, it } from "vitest";
import {
  slugifyAction,
  statusMachineToProcedureVersion,
  type StatusMachineSource,
} from "./procedure-from-status-machine.js";

const quelle: StatusMachineSource = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  requiredPermission: "case.decision.prepare",
  states: [
    { key: "eingegangen" },
    { key: "in_pruefung" },
    { key: "festgesetzt", terminal: true },
    { key: "abgelehnt", terminal: true },
  ],
  transitions: [
    { from: "eingegangen", to: "in_pruefung", label: "In Prüfung nehmen" },
    {
      from: "in_pruefung",
      to: "festgesetzt",
      label: "Festsetzen",
      vierAugen: true,
    },
    { from: "in_pruefung", to: "abgelehnt", label: "Ablehnen" },
  ],
};

describe("slugifyAction", () => {
  it("transliteriert Umlaute und ist deterministisch/ASCII-sicher", () => {
    expect(slugifyAction("In Prüfung nehmen")).toBe("in-pruefung-nehmen");
    expect(slugifyAction("Festsetzen (Zweitfreigabe)")).toBe(
      "festsetzen-zweitfreigabe",
    );
    expect(slugifyAction("Ablehnen")).toBe("ablehnen");
  });
});

describe("statusMachineToProcedureVersion", () => {
  it("bildet Zustände und Übergänge verlustfrei ab (action = Slug des Labels)", () => {
    const pv = statusMachineToProcedureVersion(quelle);
    expect(pv.procedureId).toBe("musterantrag");
    expect(pv.allowedStates).toEqual([
      "eingegangen",
      "in_pruefung",
      "festgesetzt",
      "abgelehnt",
    ]);
    expect(pv.allowedTransitions.map((t) => t.action)).toEqual([
      "in-pruefung-nehmen",
      "festsetzen",
      "ablehnen",
    ]);
    // Jeder Übergang trägt die Permission.
    expect(
      pv.allowedTransitions.every(
        (t) => t.requiredPermission === "case.decision.prepare",
      ),
    ).toBe(true);
  });

  it("setzt requiresFourEyes nur bei vierAugen — und lässt es sonst WEG (nicht false)", () => {
    const pv = statusMachineToProcedureVersion(quelle);
    const festsetzen = pv.allowedTransitions.find(
      (t) => t.action === "festsetzen",
    );
    const ablehnen = pv.allowedTransitions.find((t) => t.action === "ablehnen");
    expect(festsetzen?.requiresFourEyes).toBe(true);
    expect("requiresFourEyes" in ablehnen!).toBe(false);
  });

  it("setzt closesCase bei einem Übergang IN einen Endzustand — data-driven, ohne Zustandsnamen zu kennen", () => {
    const pv = statusMachineToProcedureVersion(quelle);
    // festgesetzt UND abgelehnt sind terminal → beide Übergänge schliessen.
    expect(
      pv.allowedTransitions.find((t) => t.to === "festgesetzt")?.closesCase,
    ).toBe(true);
    expect(
      pv.allowedTransitions.find((t) => t.to === "abgelehnt")?.closesCase,
    ).toBe(true);
    // Der Eröffnungs-Übergang schliesst NICHT.
    expect(
      "closesCase" in
        pv.allowedTransitions.find((t) => t.to === "in_pruefung")!,
    ).toBe(false);
  });

  it("WIRFT bei mehrdeutigen (from, action) — dieselbe Invariante wie check:procedure-contract", () => {
    // Zwei Übergänge desselben Ausgangszustands mit gleichem Label → gleiche action → mehrdeutig.
    const mehrdeutig: StatusMachineSource = {
      ...quelle,
      transitions: [
        { from: "in_pruefung", to: "festgesetzt", label: "Entscheiden" },
        { from: "in_pruefung", to: "abgelehnt", label: "Entscheiden" },
      ],
    };
    expect(() => statusMachineToProcedureVersion(mehrdeutig)).toThrow(
      /mehrdeutig/,
    );
  });
});
