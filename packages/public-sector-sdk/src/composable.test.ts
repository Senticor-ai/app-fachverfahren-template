import { describe, expect, it } from "vitest";
import {
  assertComposable,
  assertSpineAgent,
  certificationReadiness,
  istRechtsnah,
  type AgenticComposable,
  type SpineAgent,
} from "./composable.js";

function spine(over: Partial<SpineAgent> = {}): SpineAgent {
  return {
    role: "musterverfahren-spine",
    autonomy: "AAL-2",
    aufgaben: ["assistenz", "strukturierung"],
    skills: ["vollstaendigkeitspruefung"],
    knowledgeDomains: ["musterverfahren"],
    ...over,
  };
}

function composable(over: Partial<AgenticComposable> = {}): AgenticComposable {
  return {
    id: "musterverfahren",
    version: "1.0.0",
    displayName: "Musterverfahren",
    klasse: "outcome",
    status: "candidate",
    assurance: "CAL-2",
    outcome: {
      fuerWen: "Sachbearbeitung",
      ergebnis: "beschiedener Antrag",
      messung: "Durchlaufzeit",
      nichtScope: [],
    },
    owners: { capabilityOwner: "amt", serviceOwner: "fachbereich" },
    moduleId: "musterverfahren",
    spine: spine(),
    evals: ["eval:musterverfahren-smoke"],
    replaceableBy: [],
    ...over,
  };
}

describe("assertSpineAgent — Governance-Invarianten (Blueprint §7)", () => {
  it("akzeptiert einen wohlgeformten AAL-2-Advise-Spine", () => {
    expect(() => assertSpineAgent(spine())).not.toThrow();
  });

  it("lehnt AAL-4/AAL-5 ab (kein Produktivstandard für rechtsnahe Verfahren)", () => {
    expect(() => assertSpineAgent(spine({ autonomy: "AAL-4" }))).toThrow(
      /Obergrenze/,
    );
    expect(() => assertSpineAgent(spine({ autonomy: "AAL-5" }))).toThrow();
  });

  it("erzwingt bei rechtsnaher Aufgabe höchstens AAL-2 (KI berät, entscheidet nie)", () => {
    // pruefung/subsumtion/review sind HITL-pflichtig → AAL-3 „Act with Approval" ist dort unzulässig.
    expect(() =>
      assertSpineAgent(spine({ aufgaben: ["subsumtion"], autonomy: "AAL-3" })),
    ).toThrow(/AAL-2/);
    // Als reine Advise-Aufgabe ist AAL-2 erlaubt.
    expect(() =>
      assertSpineAgent(spine({ aufgaben: ["subsumtion"], autonomy: "AAL-2" })),
    ).not.toThrow();
  });

  it("erlaubt AAL-3 nur für NICHT rechtsnahe Aufgaben (z. B. reine Strukturierung)", () => {
    expect(() =>
      assertSpineAgent(
        spine({ aufgaben: ["strukturierung"], autonomy: "AAL-3" }),
      ),
    ).not.toThrow();
  });

  it("verlangt mindestens eine Aufgabe + eine Rolle", () => {
    expect(() => assertSpineAgent(spine({ aufgaben: [] }))).toThrow(/Aufgabe/);
    expect(() => assertSpineAgent(spine({ role: "" }))).toThrow(/role/);
  });
});

describe("istRechtsnah", () => {
  it("erkennt HITL-pflichtige Aufgaben", () => {
    expect(istRechtsnah(spine({ aufgaben: ["assistenz"] }))).toBe(false);
    expect(istRechtsnah(spine({ aufgaben: ["assistenz", "pruefung"] }))).toBe(
      true,
    );
    expect(istRechtsnah(spine({ aufgaben: ["review"] }))).toBe(true);
  });
});

describe("certificationReadiness — Vollständigkeit (Blueprint §19/§28)", () => {
  it("ein vollständiges Composable ist zertifizierbar", () => {
    const r = certificationReadiness(composable());
    expect(r.certifiable).toBe(true);
    expect(r.fehlend).toEqual([]);
  });

  it("nennt konkret fehlende Ebenen (Owner, Outcome, Modul, Evals)", () => {
    // moduleId weglassen (nicht `undefined` setzen — exactOptionalPropertyTypes).
    const { moduleId: _weg, ...ohneModul } = composable({
      owners: { capabilityOwner: "", serviceOwner: "" },
      outcome: { fuerWen: "", ergebnis: "", messung: "", nichtScope: [] },
      evals: [],
    });
    void _weg;
    const r = certificationReadiness(ohneModul);
    expect(r.certifiable).toBe(false);
    expect(r.fehlend).toContain("owners.capabilityOwner");
    expect(r.fehlend).toContain("outcome.ergebnis");
    expect(r.fehlend).toContain("moduleId (deterministische Naht)");
    expect(r.fehlend).toContain("evals");
  });

  it("ein Spine ohne Knowledge-/Skill-Bezug ist nicht produktiv (§28)", () => {
    const r = certificationReadiness(
      composable({ spine: spine({ skills: [], knowledgeDomains: [] }) }),
    );
    expect(r.fehlend).toContain("spine.skills");
    expect(r.fehlend).toContain("spine.knowledgeDomains");
  });
});

describe("assertComposable", () => {
  it("wirft bei fehlender id/displayName + prüft den Spine mit", () => {
    expect(() => assertComposable(composable({ id: "" }))).toThrow(/id/);
    expect(() => assertComposable(composable({ displayName: "" }))).toThrow(
      /displayName/,
    );
    expect(() =>
      assertComposable(composable({ spine: spine({ autonomy: "AAL-5" }) })),
    ).toThrow();
  });
});
