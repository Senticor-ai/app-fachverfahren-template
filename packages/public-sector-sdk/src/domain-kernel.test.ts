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

  it("stempelt closedAt bei closesCase-Übergängen und entfernt es bei Wiederaufnahme (data-driven, kein 'closed'-Literal)", () => {
    const procedureVersion: ProcedureVersion = {
      procedureId: "procedure.test",
      version: "1",
      effectiveFrom: "2026-01-01",
      legalBasisIds: ["legal.test"],
      allowedStates: ["aktiv", "abgeschlossen"],
      allowedTransitions: [
        {
          from: "aktiv",
          to: "abgeschlossen",
          action: "abschließen",
          requiredPermission: "case.decision.prepare",
          closesCase: true,
        },
        {
          from: "abgeschlossen",
          to: "aktiv",
          action: "wiederaufnehmen",
          requiredPermission: "case.decision.prepare",
        },
      ],
    };
    const aktiverFall: Case = {
      caseId: "case.test",
      procedureId: "procedure.test",
      procedureVersion: "1",
      tenantId: "tenant.test",
      authorityId: "authority.test",
      jurisdictionId: "de",
      state: "aktiv",
      version: 1,
      subjectIds: ["subject.test"],
      openedAt: "2026-01-02T00:00:00.000Z",
    };

    // Abschluss: `closedAt` wird gesetzt (obwohl der Zielzustand NICHT „closed" heißt).
    const geschlossen = transitionCase(
      aktiverFall,
      procedureVersion,
      "abschließen",
      1,
    );
    expect(geschlossen.state).toBe("abgeschlossen");
    expect(typeof geschlossen.closedAt).toBe("string");

    // Wiederaufnahme: `closedAt` wird wieder entfernt — ein wiederaufgenommener Fall ist nicht „geschlossen am".
    const wiederaufgenommen = transitionCase(
      geschlossen,
      procedureVersion,
      "wiederaufnehmen",
      2,
    );
    expect(wiederaufgenommen.state).toBe("aktiv");
    expect(wiederaufgenommen.closedAt).toBeUndefined();
  });
});
