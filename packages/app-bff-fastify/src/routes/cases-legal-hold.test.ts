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

// Legal Hold / Löschsperre (#55): ein aktiver Hold blockiert die DSGVO-Löschung. Setzen/Aufheben ist
// append-only (case.legal-hold.changed); die effektive Sperre = jüngster Stand. Eigene Permission.
const procedure: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen"],
  allowedTransitions: [],
};

function appFor(caseStore: InMemoryCaseStore, session = caseworkerSession()) {
  return buildBffApp({
    session,
    caseStore,
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

async function createCase(app: Awaited<ReturnType<typeof buildBffApp>>["app"]) {
  return (
    await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        procedureId: "musterantrag",
        procedureVersion: "1",
        state: "offen",
        subjectIds: ["subject.1"],
        data: { antragsteller: { vorname: "Alex" } },
      },
    })
  ).json();
}

function loeschung(
  app: Awaited<ReturnType<typeof buildBffApp>>["app"],
  caseId: string,
  expectedVersion: number,
) {
  return app.inject({
    method: "POST",
    url: `/api/cases/${caseId}/loeschung`,
    payload: {
      expectedVersion,
      piiPaths: ["antragsteller.vorname"],
      legalBasisId: "DSGVO-Art17",
    },
  });
}

describe("Legal Hold POST /api/cases/:id/legal-hold", () => {
  it("ein aktiver Hold BLOCKIERT die Löschung (409); Aufheben gibt sie wieder frei", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);

    // Hold setzen.
    const set = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/legal-hold`,
      payload: { aktiv: true, grund: "laufender Rechtsstreit" },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().aktiv).toBe(true);

    // Löschung ist jetzt gesperrt.
    const blocked = await loeschung(app, created.caseId, created.version);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toContain("Löschsperre");

    // Hold aufheben → Löschung wieder möglich.
    const release = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/legal-hold`,
      payload: { aktiv: false, grund: "Rechtsstreit beendet" },
    });
    expect(release.statusCode).toBe(200);
    const ok = await loeschung(app, created.caseId, created.version);
    expect(ok.statusCode).toBe(200);
    await app.close();
  });

  it("ohne Hold ist die Löschung unverändert möglich", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);
    const res = await loeschung(app, created.caseId, created.version);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("der Hold-Wechsel ist append-only auditiert (case.legal-hold.changed)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);
    await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/legal-hold`,
      payload: { aktiv: true, grund: "Beweissicherung" },
    });
    const audit = (
      await app.inject({
        method: "GET",
        url: `/api/cases/${created.caseId}/audit`,
      })
    ).json();
    const hold = audit.events.find(
      (e: { eventType: string }) => e.eventType === "case.legal-hold.changed",
    );
    expect(hold).toBeDefined();
    expect(hold.payload.aktiv).toBe(true);
    expect(hold.payload.grund).toBe("Beweissicherung");
    await app.close();
  });

  it("404 für einen unbekannten Fall", async () => {
    const { app } = await appFor(new InMemoryCaseStore());
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/gibt-es-nicht/legal-hold`,
      payload: { aktiv: true, grund: "x" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("403 ohne die Permission case.legal-hold (Bürger-Rolle)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app: sb } = await appFor(caseStore);
    const created = await createCase(sb);
    await sb.close();

    const { app } = await appFor(caseStore, citizenSession());
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/legal-hold`,
      payload: { aktiv: true, grund: "x" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
