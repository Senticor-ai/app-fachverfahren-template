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

  it("closesCase-Übergang stempelt closedAt; Wiederaufnahme räumt es via null wieder ab", async () => {
    const reopenable: ProcedureVersion = {
      procedureId: "reopenable",
      version: "1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      legalBasisIds: ["VwV-IGM-2023"],
      allowedStates: ["aktiv", "abgeschlossen"],
      allowedTransitions: [
        {
          from: "aktiv",
          to: "abgeschlossen",
          action: "abschliessen",
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
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      caseStore: new InMemoryCaseStore(),
      procedureRegistry: createInMemoryProcedureRegistry([reopenable]),
    });
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "reopenable",
          procedureVersion: "1",
          state: "aktiv",
          subjectIds: ["subject.1"],
        },
      })
    ).json();

    // Abschluss → closedAt gesetzt (obwohl der Endzustand NICHT „closed" heißt — data-driven closesCase).
    const closed = (
      await app.inject({
        method: "POST",
        url: `/api/cases/${created.caseId}/transitions`,
        payload: { action: "abschliessen", expectedVersion: created.version },
      })
    ).json();
    expect(closed.state).toBe("abgeschlossen");
    expect(typeof closed.closedAt).toBe("string");

    // Wiederaufnahme → closedAt wieder null (kein „Geschlossen am" an einem laufenden Fall).
    const reopened = (
      await app.inject({
        method: "POST",
        url: `/api/cases/${created.caseId}/transitions`,
        payload: { action: "wiederaufnehmen", expectedVersion: closed.version },
      })
    ).json();
    expect(reopened.state).toBe("aktiv");
    expect(reopened.closedAt).toBeNull();
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

  it("403 N-AUGEN: ein reiner requiredApprovals-Übergang (ohne requiresFourEyes) erzwingt die 2-Augen-Untergrenze", async () => {
    // Beweist die engine-neutrale Verallgemeinerung: das Gate triggert über `requiredApprovalsOf(t) >= 2`, nicht
    // nur über das boolesche `requiresFourEyes`. So bleibt ein aus dem BPMN abgeleiteter `senticor:requiredApprovals`
    // -Übergang NICHT ungeschützt (kein Scheinschutz). Die volle N-Zählung (N>2) ist Folge-Ausbau.
    const nAugen: ProcedureVersion = {
      ...procedure,
      allowedTransitions: [
        procedure.allowedTransitions[0]!,
        {
          from: "aktiv",
          to: "abgeschlossen",
          action: "abschliessen",
          requiredPermission: "case.decision.prepare",
          requiredApprovals: 3,
        },
      ],
    };
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      caseStore: new InMemoryCaseStore(),
      procedureRegistry: createInMemoryProcedureRegistry([nAugen]),
    });
    const created = await createCase(app);
    const aktiv = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "aktivieren", expectedVersion: created.version },
    });
    expect(aktiv.statusCode).toBe(200);
    // Derselbe Akteur will den requiredApprovals-Übergang selbst auslösen → 403 (2-Augen-Separation).
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

  it("403 Vier-Augen bleibt bestehen, wenn ein FREMDES Ereignis dazwischenfunkt (Sperre gilt der Entscheidung, nicht der Reihenfolge)", async () => {
    // ANGRIFF, den diese Prüfung fährt: die Vorfassung verglich gegen das JÜNGSTE Audit-Ereignis
    // ohne Typ-Filter. Schreibt irgendein anderer Akteur nach dem Vorbereiter in den Fall-Strom,
    // rutschte dessen Ereignis aus der letzten Position — und er durfte seine EIGENE Vorbereitung
    // freigeben. Genau so ein Fremd-Ereignis entsteht zwangsläufig, sobald der Bescheid-Abruf des
    // Bürgers auditiert wird (bekanntgabe-relevant). Hier steht stellvertretend ein Abruf-Ereignis.
    const caseStore = new InMemoryCaseStore();
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      caseStore,
      procedureRegistry: createInMemoryProcedureRegistry([procedure]),
    });
    const created = await createCase(app);
    const aktiv = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "aktivieren", expectedVersion: created.version },
    });
    expect(aktiv.statusCode).toBe(200);

    // Ein DRITTER Akteur schreibt ein NICHT-Bearbeitungs-Ereignis in denselben Fall-Strom.
    const session = caseworkerSession();
    await caseStore.appendAuditEvent({
      auditEventId: "audit.fremd-abruf",
      caseId: created.caseId,
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      jurisdictionId: session.jurisdictionId,
      actorId: "actor.buerger-ganz-anders",
      eventType: "bescheid.abgerufen",
      purpose: "case-management",
      legalBasisId: "VwV-IGM-2023",
      requestId: "req.fremd",
      payload: { summary: "Bürger hat den Bescheid abgerufen" },
      occurredAt: new Date().toISOString(),
    });

    // Der Vorbereiter versucht erneut, SEINE eigene Vorbereitung freizugeben → muss weiterhin 403 sein.
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

  it("422 wenn der data-driven GUARD über case.data nicht erfüllt ist; 200 wenn erfüllt", async () => {
    const guarded: ProcedureVersion = {
      procedureId: "guarded",
      version: "1",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      legalBasisIds: ["VwV-IGM-2023"],
      allowedStates: ["offen", "eskaliert"],
      allowedTransitions: [
        {
          from: "offen",
          to: "eskaliert",
          action: "eskalieren",
          requiredPermission: "case.decision.prepare",
          guard: { feld: "berechnung.betrag", op: ">", wert: 1000 },
        },
      ],
    };
    const store = new InMemoryCaseStore();
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      caseStore: store,
      procedureRegistry: createInMemoryProcedureRegistry([guarded]),
    });
    // Fall mit betrag=500 → Guard NICHT erfüllt.
    const klein = (
      await app.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "guarded",
          procedureVersion: "1",
          state: "offen",
          subjectIds: ["s"],
          data: { berechnung: { betrag: 500 } },
        },
      })
    ).json();
    const abgelehnt = await app.inject({
      method: "POST",
      url: `/api/cases/${klein.caseId}/transitions`,
      payload: { action: "eskalieren", expectedVersion: klein.version },
    });
    expect(abgelehnt.statusCode).toBe(422);
    expect(abgelehnt.json().error).toMatch(/guard/);

    // Fall mit betrag=1500 → Guard erfüllt.
    const gross = (
      await app.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "guarded",
          procedureVersion: "1",
          state: "offen",
          subjectIds: ["s"],
          data: { berechnung: { betrag: 1500 } },
        },
      })
    ).json();
    const erlaubt = await app.inject({
      method: "POST",
      url: `/api/cases/${gross.caseId}/transitions`,
      payload: { action: "eskalieren", expectedVersion: gross.version },
    });
    expect(erlaubt.statusCode).toBe(200);
    expect(erlaubt.json().state).toBe("eskaliert");
    await app.close();
  });
});

describe("N-Augen N>2 — Freigabe-Sammlung (Issue #56)", () => {
  // Verfahren mit einem 3-Augen-Abschluss: aufgenommen → aktiv (ohne Freigabe) → abgeschlossen (requiredApprovals 3).
  const nAugen3: ProcedureVersion = {
    procedureId: "n-augen-3",
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
        requiredApprovals: 3,
      },
    ],
  };

  it("erst 3 DISTINKTE Freigebende (letzter Bearbeiter + Freigabe + Auslöser) lassen den Übergang zu", async () => {
    // Ein gemeinsamer Store + Registry, drei Instanzen mit VERSCHIEDENEN Akteuren (A/B/C).
    const caseStore = new InMemoryCaseStore();
    const procedureRegistry = createInMemoryProcedureRegistry([nAugen3]);
    const mk = async (actorId: string) =>
      (
        await buildBffApp({
          session: caseworkerSession({ actorId }),
          caseStore,
          procedureRegistry,
        })
      ).app;
    const a = await mk("actor.A");
    const b = await mk("actor.B");
    const c = await mk("actor.C");

    // A eröffnet + aktiviert (A ist damit der letzte Bearbeiter, der in den Zustand „aktiv" geführt hat).
    const created = (
      await a.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "n-augen-3",
          procedureVersion: "1",
          state: "aufgenommen",
          subjectIds: ["s"],
        },
      })
    ).json() as { caseId: string; version: number };
    const aktiv = await a.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "aktivieren", expectedVersion: created.version },
    });
    const v = aktiv.json().version as number;

    // B löst den 3-Augen-Abschluss aus — nur {A (letzter), B (Auslöser)} = 2 < 3 → 403.
    const zuFrueh = await b.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "abschliessen", expectedVersion: v },
    });
    expect(zuFrueh.statusCode).toBe(403);
    expect(zuFrueh.json().error).toContain("n-augen");

    // C erfasst seine Freigabe → jetzt {A, C} gesammelt (Auslöser zählt erst beim Übergang).
    const freigabe = await c.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/approvals`,
      payload: { action: "abschliessen", expectedVersion: v },
    });
    expect(freigabe.statusCode).toBe(200);
    expect(freigabe.json()).toMatchObject({
      recorded: true,
      requiredApprovals: 3,
      distinctApprovers: 2,
      satisfied: false,
    });

    // B löst erneut aus — jetzt {A (letzter), C (Freigabe), B (Auslöser)} = 3 → 200.
    const abschluss = await b.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/transitions`,
      payload: { action: "abschliessen", expectedVersion: v },
    });
    expect(abschluss.statusCode).toBe(200);
    expect(abschluss.json().state).toBe("abgeschlossen");

    await Promise.all([a.close(), b.close(), c.close()]);
  });

  it("Freigabe für einen Übergang OHNE Freigabe-Pflicht → 400; Version-Drift → 409", async () => {
    const caseStore = new InMemoryCaseStore();
    const procedureRegistry = createInMemoryProcedureRegistry([nAugen3]);
    const { app } = await buildBffApp({
      session: caseworkerSession({ actorId: "actor.A" }),
      caseStore,
      procedureRegistry,
    });
    const created = (
      await app.inject({
        method: "POST",
        url: "/api/cases",
        payload: {
          procedureId: "n-augen-3",
          procedureVersion: "1",
          state: "aufgenommen",
          subjectIds: ["s"],
        },
      })
    ).json() as { caseId: string; version: number };
    // „aktivieren" braucht keine Freigabe → 400.
    const ohne = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/approvals`,
      payload: { action: "aktivieren", expectedVersion: created.version },
    });
    expect(ohne.statusCode).toBe(400);
    // Falsche expectedVersion → 409.
    const drift = await app.inject({
      method: "POST",
      url: `/api/cases/${created.caseId}/approvals`,
      payload: { action: "abschliessen", expectedVersion: 99 },
    });
    expect(drift.statusCode).toBe(409);
    await app.close();
  });
});
