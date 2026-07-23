import { describe, expect, it } from "vitest";
import { InMemoryCaseStore, type AppCase } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import { buildBffApp, caseworkerSession } from "../test-helpers.js";

// Gesetzliche AUFBEWAHRUNGSFRIST (Records-Retention, #55): eine am Verfahren deklarierte Frist
// (`aufbewahrungMonate`, ab Fallabschluss) blockiert die DSGVO-Löschung, solange sie läuft (409).
const procedure: ProcedureVersion = {
  procedureId: "musterakte",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 84 SGB X"],
  allowedStates: ["offen", "abgeschlossen"],
  allowedTransitions: [],
  aufbewahrungMonate: 120, // 10 Jahre
};

function fall(over: Partial<AppCase>): AppCase {
  return {
    caseId: `case-${globalThis.crypto.randomUUID()}`,
    tenantId: "tenant-1",
    authorityId: "authority-1",
    jurisdictionId: "de",
    procedureId: "musterakte",
    procedureVersion: "1",
    state: "abgeschlossen",
    version: 1,
    subjectIds: ["subject.1"],
    openedAt: "2019-01-01T00:00:00.000Z",
    closedAt: null,
    ownerActorId: null,
    data: { antragsteller: { vorname: "Alex" } },
    ...over,
  };
}

function appFor(caseStore: InMemoryCaseStore) {
  return buildBffApp({
    session: caseworkerSession(),
    caseStore,
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

function loeschung(
  app: Awaited<ReturnType<typeof buildBffApp>>["app"],
  caseId: string,
) {
  return app.inject({
    method: "POST",
    url: `/api/cases/${caseId}/loeschung`,
    payload: {
      expectedVersion: 1,
      piiPaths: ["antragsteller.vorname"],
      legalBasisId: "DSGVO-Art17",
    },
  });
}

describe("Aufbewahrungsfrist blockiert die DSGVO-Löschung", () => {
  it("innerhalb der 10-Jahres-Frist abgeschlossen → 409 (Löschung gesperrt)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    // Abschluss 2024 → Frist bis 2034 → läuft noch.
    const c = fall({ closedAt: "2024-01-01T00:00:00.000Z" });
    await caseStore.insertCase(c);
    const res = await loeschung(app, c.caseId);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("Aufbewahrungsfrist");
    await app.close();
  });

  it("Frist abgelaufen (lange vor Ablauf abgeschlossen) → Löschung möglich", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    // Abschluss 2000 → Frist bis 2010 → abgelaufen.
    const c = fall({ closedAt: "2000-01-01T00:00:00.000Z" });
    await caseStore.insertCase(c);
    const res = await loeschung(app, c.caseId);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("nicht abgeschlossener Fall (kein closedAt) → keine Frist, Löschung möglich", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const c = fall({ state: "offen", closedAt: null });
    await caseStore.insertCase(c);
    const res = await loeschung(app, c.caseId);
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
