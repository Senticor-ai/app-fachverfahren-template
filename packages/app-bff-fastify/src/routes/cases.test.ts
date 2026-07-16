import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

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
  ],
};

function buildCasesApp() {
  return buildBffApp({
    session: caseworkerSession(),
    caseStore: new InMemoryCaseStore(),
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

async function createCase(
  app: Awaited<ReturnType<typeof buildBffApp>>["app"],
  body: Record<string, unknown> = {},
) {
  return app.inject({
    method: "POST",
    url: "/api/cases",
    payload: {
      procedureId: "integrationsberatung",
      procedureVersion: "1",
      state: "aufgenommen",
      subjectIds: ["subject.1"],
      ...body,
    },
  });
}

describe("BFF /api/cases", () => {
  it("403 ohne case.read (Bürger-Rolle)", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({ method: "GET", url: "/api/cases" });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("POST legt einen Fall an (Initialzustand + Rechtsgrundlage aus dem Verfahren) + Fach-Audit", async () => {
    const { app, caseStore } = await buildCasesApp();
    const res = await createCase(app);
    expect(res.statusCode).toBe(201);
    const dto = res.json();
    expect(dto.state).toBe("aufgenommen");
    expect(dto.version).toBe(1);
    expect(dto.subjectIds).toEqual(["subject.1"]);
    // DTO exponiert die Server-Topologie NICHT.
    expect(dto.tenantId).toBeUndefined();
    // Fach-Audit „case.opened" wurde append-only geschrieben (Rechtsgrundlage aus dem Verfahren).
    const audit = await caseStore.listAuditEvents({
      tenantId: "tenant-1",
      caseId: dto.caseId,
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.eventType).toBe("case.opened");
    expect(audit[0]?.legalBasisId).toBe("VwV-IGM-2023");
    await app.close();
  });

  it("POST → 400 bei unbekanntem Verfahren bzw. unzulässigem Initialzustand (fail-closed)", async () => {
    const { app } = await buildCasesApp();
    const unbekannt = await createCase(app, { procedureId: "gibt-es-nicht" });
    expect(unbekannt.statusCode).toBe(400);
    const falscherZustand = await createCase(app, { state: "erledigt" });
    expect(falscherZustand.statusCode).toBe(400);
    await app.close();
  });

  it("GET /api/cases listet + GET /api/cases/:id liest; Fremd-Behörde → 404", async () => {
    const { app } = await buildCasesApp();
    const created = (await createCase(app)).json();
    const liste = await app.inject({ method: "GET", url: "/api/cases" });
    expect(liste.statusCode).toBe(200);
    expect(
      liste
        .json()
        .cases.some((c: { caseId: string }) => c.caseId === created.caseId),
    ).toBe(true);
    const einzeln = await app.inject({
      method: "GET",
      url: `/api/cases/${created.caseId}`,
    });
    expect(einzeln.statusCode).toBe(200);
    expect(einzeln.json().caseId).toBe(created.caseId);
    await app.close();

    // Fremde Behörde im selben Mandanten sieht den Fall NICHT (404, kein Existenz-Leak).
    const fremd = await buildBffApp({
      session: caseworkerSession({ authorityId: "authority-2" }),
      caseStore: new InMemoryCaseStore(),
      procedureRegistry: createInMemoryProcedureRegistry([procedure]),
    });
    const res = await fremd.app.inject({
      method: "GET",
      url: `/api/cases/${created.caseId}`,
    });
    expect(res.statusCode).toBe(404);
    await fremd.app.close();
  });

  it("GET /api/cases/:id/audit liest den append-only Verlauf (case.opened); Fremd-Behörde → 404", async () => {
    const { app } = await buildCasesApp();
    const created = (await createCase(app)).json();
    const verlauf = await app.inject({
      method: "GET",
      url: `/api/cases/${created.caseId}/audit`,
    });
    expect(verlauf.statusCode).toBe(200);
    const events = verlauf.json().events;
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("case.opened");
    expect(events[0].legalBasisId).toBe("VwV-IGM-2023");
    // Die Server-Topologie wird NICHT exponiert (nur der pseudonyme Akteur + fachliche Verankerung).
    expect(events[0].tenantId).toBeUndefined();
    expect(events[0].authorityId).toBeUndefined();
    expect(typeof events[0].actorId).toBe("string");
    await app.close();

    // Fremde Behörde im selben Mandanten liest den Verlauf NICHT (404, kein Existenz-Leak).
    const fremd = await buildBffApp({
      session: caseworkerSession({ authorityId: "authority-2" }),
      caseStore: new InMemoryCaseStore(),
      procedureRegistry: createInMemoryProcedureRegistry([procedure]),
    });
    const res = await fremd.app.inject({
      method: "GET",
      url: `/api/cases/${created.caseId}/audit`,
    });
    expect(res.statusCode).toBe(404);
    await fremd.app.close();
  });
});
