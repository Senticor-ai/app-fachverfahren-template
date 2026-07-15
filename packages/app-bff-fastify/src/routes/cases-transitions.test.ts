import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import { buildBffApp, caseworkerSession } from "../test-helpers.js";

// Verfahren als DATEN: aufgenommen→aktiv (ohne Vier-Augen), aktiv→abgeschlossen (MIT Vier-Augen).
const procedure: ProcedureVersion = {
  procedureId: "integrationsberatung",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["VwV-IGM-2023"],
  allowedStates: ["aufgenommen", "aktiv", "abgeschlossen"],
  allowedTransitions: [
    {
      from: "aufgenommen",
      to: "aktiv",
      action: "aktivieren",
      requiredPermission: "case.decision.prepare",
    },
    {
      from: "aktiv",
      to: "abgeschlossen",
      action: "abschliessen",
      requiredPermission: "case.decision.prepare",
      requiresFourEyes: true,
    },
  ],
};

function buildApp(session = caseworkerSession()) {
  return buildBffApp({
    session,
    caseStore: new InMemoryCaseStore(),
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

async function createCase(app: Awaited<ReturnType<typeof buildBffApp>>["app"]) {
  const res = await app.inject({
    method: "POST",
    url: "/api/cases",
    payload: {
      procedureId: "integrationsberatung",
      procedureVersion: "1",
      state: "aufgenommen",
      subjectIds: ["subject.1"],
    },
  });
  return res.json() as { caseId: string; version: number };
}

describe("BFF POST /api/cases/:id/transitions", () => {
  it("Happy-Path: wechselt Zustand + Version und schreibt case.transitioned-Audit", async () => {
    const { app, caseStore } = await buildApp();
    const created = await createCase(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: {
        action: "aktivieren",
        expectedVersion: created.version,
        detail: "Beispiel-Vermerk",
      },
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.state).toBe("aktiv");
    expect(dto.version).toBe(created.version + 1);

    const audit = await caseStore.listAuditEvents({
      tenantId: "tenant-1",
      caseId: created.caseId,
    });
    // case.opened (aus dem Anlegen) + case.transitioned.
    const transitioned = audit.find((e) => e.eventType === "case.transitioned");
    expect(transitioned).toBeDefined();
    expect(transitioned?.legalBasisId).toBe("VwV-IGM-2023");
    expect(transitioned?.payload).toMatchObject({
      previousState: "aufgenommen",
      newState: "aktiv",
      detail: "Beispiel-Vermerk",
    });
    await app.close();
  });

  it("400 bei ungültiger Action (kein passender Übergang)", async () => {
    const { app } = await buildApp();
    const created = await createCase(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "gibt-es-nicht", expectedVersion: created.version },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("409 bei veralteter expectedVersion (Optimistic-Locking)", async () => {
    const { app } = await buildApp();
    const created = await createCase(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "aktivieren", expectedVersion: created.version + 5 },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("403 Vier-Augen: derselbe Akteur darf den requiresFourEyes-Übergang nicht selbst auslösen", async () => {
    const { app } = await buildApp();
    const created = await createCase(app);
    // aufgenommen → aktiv (ohne Vier-Augen) durch actor-caseworker.
    const aktiv = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "aktivieren", expectedVersion: created.version },
    });
    expect(aktiv.statusCode).toBe(200);
    // aktiv → abgeschlossen (MIT Vier-Augen) durch DENSELBEN Akteur → 403.
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: {
        action: "abschliessen",
        expectedVersion: aktiv.json().version,
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
