import { describe, expect, it } from "vitest";
import {
  transitionCase,
  type Case,
  type ProcedureVersion,
} from "./domain-kernel.js";

describe("domain kernel", () => {
  it("keeps case transitions versioned and optimistic", () => {
    const procedureVersion: ProcedureVersion = {
      procedureId: "procedure.test",
      version: "3.0.0",
      effectiveFrom: "2026-01-01",
      legalBasisIds: ["legal.test"],
      allowedStates: ["open", "in-review"],
      allowedTransitions: [
        {
          from: "open",
          to: "in-review",
          action: "submit-for-review",
          requiredPermission: "case.submit",
        },
      ],
    };
    const currentCase: Case = {
      caseId: "case.test",
      procedureId: "procedure.test",
      procedureVersion: "3.0.0",
      tenantId: "tenant.test",
      authorityId: "authority.test",
      jurisdictionId: "de",
      state: "open",
      version: 7,
      subjectIds: ["subject.test"],
      openedAt: "2026-01-02T00:00:00.000Z",
    };

    expect(
      transitionCase(currentCase, procedureVersion, "submit-for-review", 7),
    ).toMatchObject({ state: "in-review", version: 8 });
  });

  it("stamps closedAt from the injected clock (deterministic, no hidden new Date())", () => {
    const procedureVersion: ProcedureVersion = {
      procedureId: "procedure.test",
      version: "3.0.0",
      effectiveFrom: "2026-01-01",
      legalBasisIds: ["legal.test"],
      allowedStates: ["in-review", "closed"],
      allowedTransitions: [
        {
          from: "in-review",
          to: "closed",
          action: "close",
          requiredPermission: "case.close",
        },
      ],
    };
    const currentCase: Case = {
      caseId: "case.test",
      procedureId: "procedure.test",
      procedureVersion: "3.0.0",
      tenantId: "tenant.test",
      authorityId: "authority.test",
      jurisdictionId: "de",
      state: "in-review",
      version: 2,
      subjectIds: ["subject.test"],
      openedAt: "2026-01-02T00:00:00.000Z",
    };
    const fixed = "2026-07-10T09:00:00.000Z";
    const closed = transitionCase(
      currentCase,
      procedureVersion,
      "close",
      2,
      () => fixed,
    );
    expect(closed).toMatchObject({ state: "closed", closedAt: fixed });
  });
});
