import { describe, expect, it } from "vitest";
import { InMemoryCaseStore, isTombstone } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

// DSGVO-Löschung (Art. 17 / §84 SGB X, Issue #55): POST /api/cases/:id/loeschung redigiert benannte
// PII-Pfade in case.data (Tombstone) + schreibt ein append-only `case.data.redacted`-Ereignis, ohne die
// gelöschten Werte zu wiederholen. Eigene Permission `case.pii.erase` (nur Sachbearbeitung).
const procedure: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen", "abgeschlossen"],
  allowedTransitions: [
    {
      from: "offen",
      to: "abgeschlossen",
      action: "abschliessen",
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
        data: {
          antragsteller: { vorname: "Alex", nachname: "Muster", plz: "12345" },
          anliegen: { kategorie: "standard" },
        },
      },
    })
  ).json();
}

describe("DSGVO-Löschung POST /api/cases/:id/loeschung", () => {
  it("redigiert die PII-Pfade + protokolliert append-only ohne die Werte, Version+1, State unberührt", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/loeschung`,
      payload: {
        expectedVersion: created.version,
        piiPaths: ["antragsteller.vorname", "antragsteller.nachname"],
        legalBasisId: "DSGVO-Art17",
        begruendung: "Löschverlangen der betroffenen Person",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.redactedPaths).toEqual([
      "antragsteller.vorname",
      "antragsteller.nachname",
    ]);
    expect(body.case.version).toBe(created.version + 1);
    // State bleibt — eine Löschung ist kein Zustandswechsel.
    expect(body.case.state).toBe("offen");
    const ast = body.case.data.antragsteller;
    expect(isTombstone(ast.vorname)).toBe(true);
    expect(isTombstone(ast.nachname)).toBe(true);
    // Nicht-PII bleibt erhalten.
    expect(ast.plz).toBe("12345");
    expect(body.case.data.anliegen.kategorie).toBe("standard");

    // Das Lösch-Ereignis liegt append-only im Audit, mit den Pfaden — aber OHNE die gelöschten Werte.
    const audit = (
      await app.inject({
        method: "GET",
        url: `/api/cases/${created.caseId}/audit`,
      })
    ).json();
    const loeschung = audit.events.find(
      (e: { eventType: string }) => e.eventType === "case.data.redacted",
    );
    expect(loeschung).toBeDefined();
    expect(loeschung.legalBasisId).toBe("DSGVO-Art17");
    expect(loeschung.payload.redactedPaths).toEqual([
      "antragsteller.vorname",
      "antragsteller.nachname",
    ]);
    expect(JSON.stringify(loeschung.payload)).not.toContain("Alex");
    await app.close();
  });

  it("422, wenn keiner der Pfade vorhanden ist (kein leerer Version-Bump; idempotent beim zweiten Lauf)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);

    const garnichts = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/loeschung`,
      payload: {
        expectedVersion: created.version,
        piiPaths: ["gibt.es.nicht"],
        legalBasisId: "DSGVO-Art17",
      },
    });
    expect(garnichts.statusCode).toBe(422);

    // Erste echte Löschung, dann Wiederholung derselben Löschung → 422 (nichts mehr offen).
    await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/loeschung`,
      payload: {
        expectedVersion: created.version,
        piiPaths: ["antragsteller.vorname"],
        legalBasisId: "DSGVO-Art17",
      },
    });
    const nochmal = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/loeschung`,
      payload: {
        expectedVersion: created.version + 1,
        piiPaths: ["antragsteller.vorname"],
        legalBasisId: "DSGVO-Art17",
      },
    });
    expect(nochmal.statusCode).toBe(422);
    await app.close();
  });

  it("409 bei veralteter expectedVersion (Optimistic-Locking)", async () => {
    const caseStore = new InMemoryCaseStore();
    const { app } = await appFor(caseStore);
    const created = await createCase(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/loeschung`,
      payload: {
        expectedVersion: created.version + 5,
        piiPaths: ["antragsteller.vorname"],
        legalBasisId: "DSGVO-Art17",
      },
    });
    expect(res.statusCode).toBe(409);
    await app.close();
  });

  it("404 für einen unbekannten Fall", async () => {
    const { app } = await appFor(new InMemoryCaseStore());
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/gibt-es-nicht/loeschung`,
      payload: {
        expectedVersion: 1,
        piiPaths: ["antragsteller.vorname"],
        legalBasisId: "DSGVO-Art17",
      },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("403 ohne die Permission case.pii.erase (Bürger-Rolle)", async () => {
    const caseStore = new InMemoryCaseStore();
    // Fall von der Sachbearbeitung anlegen, dann als Bürger:in die Löschung versuchen.
    const { app: sbApp } = await appFor(caseStore);
    const created = await createCase(sbApp);
    await sbApp.close();

    const { app } = await appFor(caseStore, citizenSession());
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/loeschung`,
      payload: {
        expectedVersion: created.version,
        piiPaths: ["antragsteller.vorname"],
        legalBasisId: "DSGVO-Art17",
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
