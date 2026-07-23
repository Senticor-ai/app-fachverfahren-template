import { describe, expect, it } from "vitest";
import {
  InMemoryCaseStore,
  type AppAuditEvent,
} from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

// Behördenseitige ENTSCHEIDUNG über einen eingelegten Rechtsbehelf (#61, Abhilfe/Nichtabhilfe): auditiert
// (`case.objection.decided`), regime-neutral, einmalig. Setzt einen eingelegten Rechtsbehelf voraus.
const procedure: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen", "festgesetzt"],
  allowedTransitions: [
    {
      from: "offen",
      to: "festgesetzt",
      action: "festsetzen",
      requiredPermission: "case.decision.prepare",
    },
  ],
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
      },
    })
  ).json();
}

function objectionEvent(caseId: string): AppAuditEvent {
  return {
    auditEventId: "audit.objection",
    caseId,
    tenantId: "tenant-1",
    authorityId: "authority-1",
    jurisdictionId: "de",
    actorId: "actor.anna",
    eventType: "case.objection",
    purpose: "rechtsbehelf",
    legalBasisId: "§ 68 ff. VwGO",
    requestId: "req.objection",
    payload: { art: "widerspruch" },
    occurredAt: "2026-02-01T00:00:00.000Z",
  };
}

describe("Rechtsbehelfs-Entscheidung POST /api/cases/:id/rechtsbehelf/entscheidung", () => {
  it("entscheidet (Nichtabhilfe) + schreibt case.objection.decided append-only, referenziert die Einlegung", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);
    await caseStore.appendAuditEvent(objectionEvent(created.caseId));

    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/rechtsbehelf/entscheidung`,
      payload: {
        ausgang: "nichtabhilfe",
        begruendung: "Der Bescheid ist rechtmäßig.",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ausgang).toBe("nichtabhilfe");
    expect(body.aktenzeichen).toBe(created.caseId);
    expect(typeof body.entschiedenAm).toBe("string");

    const audit = (
      await app.inject({
        method: "GET",
        url: `/api/cases/${created.caseId}/audit`,
      })
    ).json();
    const decided = audit.events.find(
      (e: { eventType: string }) => e.eventType === "case.objection.decided",
    );
    expect(decided).toBeDefined();
    expect(decided.payload.ausgang).toBe("nichtabhilfe");
    expect(decided.payload.begruendung).toBe("Der Bescheid ist rechtmäßig.");
    // Beweiskette: die Entscheidung referenziert die Einlegung.
    expect(decided.payload.objectionAuditEventId).toBe("audit.objection");
    // Regime-Norm (nicht erfunden) aus der Einlegung übernommen.
    expect(decided.legalBasisId).toBe("§ 68 ff. VwGO");
    await app.close();
  });

  it("404, wenn kein Rechtsbehelf eingelegt wurde", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/rechtsbehelf/entscheidung`,
      payload: { ausgang: "abhilfe", begruendung: "abgeholfen" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("409 bei einer ZWEITEN Entscheidung (append-only, kein Doppel-Eintrag)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);
    await caseStore.appendAuditEvent(objectionEvent(created.caseId));

    const eins = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/rechtsbehelf/entscheidung`,
      payload: { ausgang: "abhilfe", begruendung: "voll abgeholfen" },
    });
    expect(eins.statusCode).toBe(200);
    const zwei = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/rechtsbehelf/entscheidung`,
      payload: { ausgang: "nichtabhilfe", begruendung: "doch nicht" },
    });
    expect(zwei.statusCode).toBe(409);
    await app.close();
  });

  it("400 ohne Begründung (eine Entscheidung ist zu begründen)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);
    await caseStore.appendAuditEvent(objectionEvent(created.caseId));
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/rechtsbehelf/entscheidung`,
      payload: { ausgang: "abhilfe" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("403 ohne case.decision.prepare (Bürger-Rolle)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app: sb } = await appFor(caseStore);
    const created = await createCase(sb);
    await caseStore.appendAuditEvent(objectionEvent(created.caseId));
    await sb.close();

    const { app } = await appFor(caseStore, citizenSession());
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/rechtsbehelf/entscheidung`,
      payload: { ausgang: "abhilfe", begruendung: "x" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
