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

// Verfahren mit festsetzendem Übergang, der einen Bescheid (Widerspruch-Regime) erlässt.
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
      closesCase: true,
      issuesVerwaltungsakt: true,
    },
  ],
  verwaltungsakt: {
    rechtsbehelf: {
      art: "widerspruch",
      fristWert: 1,
      fristEinheit: "monat",
      stelle: "der erlassenden Behörde",
      norm: "§ 68 ff. VwGO",
    },
    fiktionTage: 4,
    fiktionNorm: "§ 41 Abs. 2 VwVfG",
  },
};

/** Reicht als Anna ein und lässt die Behörde festsetzen → Bescheid ist eingefroren. */
async function mitBescheid() {
  const caseStore = new InMemoryCaseStore();
  const registry = createInMemoryProcedureRegistry([procedure]);
  const { app: anna } = await buildBffApp({
    session: citizenSession({ actorId: "actor.anna" }),
    caseStore,
    procedureRegistry: registry,
  });
  const antrag = (
    await anna.inject({
      method: "POST",
      url: "/api/buerger/antraege",
      payload: {
        procedureId: "musterantrag",
        procedureVersion: "1",
        data: { berechnung: { betrag: 50, einheit: "EUR" } },
      },
    })
  ).json();
  const { app: amt } = await buildBffApp({
    session: caseworkerSession({ actorId: "actor.sb" }),
    caseStore,
    procedureRegistry: registry,
  });
  const fest = await amt.inject({
    method: "POST",
    url: `/api/cases/${antrag.antragId}/transitions`,
    payload: { action: "festsetzen", expectedVersion: antrag.version },
  });
  expect(fest.statusCode).toBe(200);
  await amt.close();
  return { caseStore, registry, anna, antragId: antrag.antragId as string };
}

describe("BFF POST /api/buerger/antraege/:id/widerspruch", () => {
  it("legt den Rechtsbehelf ein (200 + Fristwahrungs-Zeitpunkt) und schreibt case.objection ins Audit", async () => {
    const { caseStore, registry, anna, antragId } = await mitBescheid();
    const res = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: { begruendung: "Der Betrag ist zu hoch." },
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.art).toBe("widerspruch");
    expect(dto.aktenzeichen).toBe(antragId);
    expect(typeof dto.eingelegtAm).toBe("string");
    await anna.close();

    // Das Audit trägt jetzt case.objection (Fristwahrungs-Anker) mit der Begründung.
    const { app: amt } = await buildBffApp({
      session: caseworkerSession({ actorId: "actor.sb" }),
      caseStore,
      procedureRegistry: registry,
    });
    const audit = (
      await amt.inject({
        method: "GET",
        url: `/api/cases/${antragId}/audit`,
      })
    ).json();
    const objection = audit.events.find(
      (e: { eventType: string }) => e.eventType === "case.objection",
    );
    expect(objection).toBeDefined();
    expect(objection.payload.begruendung).toBe("Der Betrag ist zu hoch.");
    await amt.close();
  });

  it("FRISTPRÜFUNG: nach frischer Bekanntgabe (Abruf) ist der Rechtsbehelf NICHT verfristet (verfristet=false + fristAblaufIso)", async () => {
    const { anna, antragId } = await mitBescheid();
    // Bescheid abrufen → setzt case.disclosed zur realen Jetzt-Zeit (Bekanntgabe-Anker).
    const abruf = await anna.inject({
      method: "GET",
      url: `/api/buerger/antraege/${antragId}/bescheid`,
    });
    expect(abruf.statusCode).toBe(200);
    const res = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.verfristet).toBe(false);
    expect(typeof dto.fristAblaufIso).toBe("string");
    await anna.close();
  });

  it("FRISTPRÜFUNG: eine lange zurückliegende Bekanntgabe macht den Rechtsbehelf verfristet (verfristet=true, aber 200 — nur geflaggt)", async () => {
    const { caseStore, anna, antragId } = await mitBescheid();
    // Alten Bekanntgabe-Anker pflanzen (2020) → 1-Monats-Frist längst abgelaufen.
    await caseStore.appendAuditEvent({
      auditEventId: "audit.disclosed-alt",
      caseId: antragId,
      tenantId: "tenant-1",
      authorityId: "authority-1",
      jurisdictionId: "de",
      actorId: "actor.anna",
      eventType: "case.disclosed",
      purpose: "bekanntgabe",
      legalBasisId: "§ 41 Abs. 2 VwVfG",
      requestId: "req.test-alt",
      payload: {},
      occurredAt: "2020-01-01T00:00:00.000Z",
    });
    const res = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: {},
    });
    // Verfristung weist NICHT von sich aus zurück — der Rechtsbehelf wird eingelegt (200), nur geflaggt.
    expect(res.statusCode).toBe(200);
    expect(res.json().verfristet).toBe(true);
    await anna.close();
  });

  it("FRISTPRÜFUNG: ohne Bekanntgabe-Anker ist verfristet=null (Frist nicht angelaufen)", async () => {
    const { anna, antragId } = await mitBescheid();
    const res = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verfristet).toBeNull();
    await anna.close();
  });

  it("verhindert den ZWEITEN Rechtsbehelf (409, append-only Audit ohne Doppel-Eintrag)", async () => {
    const { anna, antragId } = await mitBescheid();
    const erst = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: {},
    });
    expect(erst.statusCode).toBe(200);
    const zweit = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: {},
    });
    expect(zweit.statusCode).toBe(409);
    await anna.close();
  });

  it("404, wenn (noch) kein Bescheid erlassen ist — es gibt nichts, wogegen man widerspricht", async () => {
    const caseStore = new InMemoryCaseStore();
    const registry = createInMemoryProcedureRegistry([procedure]);
    const { app: anna } = await buildBffApp({
      session: citizenSession({ actorId: "actor.anna" }),
      caseStore,
      procedureRegistry: registry,
    });
    const antrag = (
      await anna.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: {
          procedureId: "musterantrag",
          procedureVersion: "1",
          data: {},
        },
      })
    ).json();
    const res = await anna.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antrag.antragId}/widerspruch`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await anna.close();
  });

  it("eine FREMDE Bürgerin bekommt 404 (kein Existenz-Orakel)", async () => {
    const { caseStore, registry, anna, antragId } = await mitBescheid();
    await anna.close();
    const { app: bodo } = await buildBffApp({
      session: citizenSession({ actorId: "actor.bodo" }),
      caseStore,
      procedureRegistry: registry,
    });
    const res = await bodo.inject({
      method: "POST",
      url: `/api/buerger/antraege/${antragId}/widerspruch`,
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await bodo.close();
  });
});
