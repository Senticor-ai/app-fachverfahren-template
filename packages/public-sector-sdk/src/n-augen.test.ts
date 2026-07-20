// n-augen.test — die pure N-Augen-Logik (Verallgemeinerung von Vier-Augen). Engine-neutral: lebt auf der
// CaseTransition (ProcedureVersion), egal ob die aus BPMN, Camunda oder n8n abgeleitet wurde.
import { describe, expect, it } from "vitest";
import {
  approvalsSatisfied,
  requiredApprovalsOf,
  type CaseTransition,
} from "./domain-kernel.js";

const base: CaseTransition = {
  from: "a",
  to: "b",
  action: "x",
  requiredPermission: "case.decision.prepare",
};

describe("requiredApprovalsOf (Vier-/N-Augen-Normalisierung)", () => {
  it("ohne Angabe = 1 (keine Freigabe-Pflicht)", () => {
    expect(requiredApprovalsOf(base)).toBe(1);
  });

  it("requiresFourEyes:true ≡ 2 (backward-compat)", () => {
    expect(requiredApprovalsOf({ ...base, requiresFourEyes: true })).toBe(2);
  });

  it("requiredApprovals gewinnt und generalisiert (N-Augen)", () => {
    expect(requiredApprovalsOf({ ...base, requiredApprovals: 3 })).toBe(3);
    // requiredApprovals hat Vorrang vor requiresFourEyes.
    expect(
      requiredApprovalsOf({
        ...base,
        requiresFourEyes: true,
        requiredApprovals: 4,
      }),
    ).toBe(4);
  });

  it("clampt auf ≥ 1 und ganze Zahlen", () => {
    expect(requiredApprovalsOf({ ...base, requiredApprovals: 0 })).toBe(1);
    expect(requiredApprovalsOf({ ...base, requiredApprovals: 2.9 })).toBe(2);
  });
});

describe("approvalsSatisfied (N-Augen-Gate)", () => {
  it("2-Augen: 1 Freigebender reicht NICHT, 2 reichen", () => {
    const t = { ...base, requiresFourEyes: true };
    expect(approvalsSatisfied(1, t)).toBe(false);
    expect(approvalsSatisfied(2, t)).toBe(true);
    expect(approvalsSatisfied(3, t)).toBe(true);
  });

  it("N-Augen (3): erst 3 distinkte Freigebende erfüllen die Freigabe", () => {
    const t = { ...base, requiredApprovals: 3 };
    expect(approvalsSatisfied(2, t)).toBe(false);
    expect(approvalsSatisfied(3, t)).toBe(true);
  });

  it("ohne Freigabe-Pflicht genügt 1 (der auslösende Akteur)", () => {
    expect(approvalsSatisfied(1, base)).toBe(true);
  });
});
