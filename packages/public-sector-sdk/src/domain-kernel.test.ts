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

  it("data-driven GUARD: der Übergang ist nur bei erfüllter Bedingung über case.data erlaubt", () => {
    const procedureVersion: ProcedureVersion = {
      procedureId: "procedure.test",
      version: "1",
      effectiveFrom: "2026-01-01",
      legalBasisIds: ["legal.test"],
      allowedStates: ["offen", "eskaliert"],
      allowedTransitions: [
        {
          from: "offen",
          to: "eskaliert",
          action: "eskalieren",
          requiredPermission: "case.decision.prepare",
          // Nur eskalieren, wenn der Betrag über 1000 liegt.
          guard: { feld: "berechnung.betrag", op: ">", wert: 1000 },
        },
      ],
    };
    const basis: Case = {
      caseId: "c1",
      procedureId: "procedure.test",
      procedureVersion: "1",
      tenantId: "t",
      authorityId: "a",
      jurisdictionId: "de",
      state: "offen",
      version: 1,
      subjectIds: [],
      openedAt: "2026-01-02T00:00:00.000Z",
    };

    // Bedingung erfüllt (1500 > 1000) → Übergang erlaubt.
    expect(
      transitionCase(basis, procedureVersion, "eskalieren", 1, {
        berechnung: { betrag: 1500 },
      }).state,
    ).toBe("eskaliert");

    // Bedingung NICHT erfüllt (500) → wirft „guard not satisfied".
    expect(() =>
      transitionCase(basis, procedureVersion, "eskalieren", 1, {
        berechnung: { betrag: 500 },
      }),
    ).toThrow(/guard not satisfied/);

    // Fehlende Daten → Bedingung nicht erfüllt → wirft.
    expect(() =>
      transitionCase(basis, procedureVersion, "eskalieren", 1, {}),
    ).toThrow(/guard not satisfied/);
  });

  it("ohne guard bleibt der Übergang unverändert erlaubt (rückwärtskompatibel)", () => {
    const pv: ProcedureVersion = {
      procedureId: "p",
      version: "1",
      effectiveFrom: "2026-01-01",
      legalBasisIds: ["l"],
      allowedStates: ["a", "b"],
      allowedTransitions: [
        { from: "a", to: "b", action: "go", requiredPermission: "x" },
      ],
    };
    const c: Case = {
      caseId: "c",
      procedureId: "p",
      procedureVersion: "1",
      tenantId: "t",
      authorityId: "a",
      jurisdictionId: "de",
      state: "a",
      version: 1,
      subjectIds: [],
      openedAt: "2026-01-02T00:00:00.000Z",
    };
    // Kein guard, kein data-Argument → wie bisher erlaubt.
    expect(transitionCase(c, pv, "go", 1).state).toBe("b");
  });
});
