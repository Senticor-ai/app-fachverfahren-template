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

// Verfahren als DATEN — der Initialzustand + die Rechtsgrundlage kommen von hier, NIE aus dem Body.
const procedure: ProcedureVersion = {
  procedureId: "musterantrag",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["muster-satzung-1"],
  allowedStates: ["eingegangen", "in_pruefung", "festgesetzt"],
  allowedTransitions: [
    {
      from: "eingegangen",
      to: "in_pruefung",
      action: "pruefen",
      requiredPermission: "case.decision.prepare",
    },
  ],
};

function app(session = citizenSession(), caseStore = new InMemoryCaseStore()) {
  return buildBffApp({
    session,
    caseStore,
    procedureRegistry: createInMemoryProcedureRegistry([procedure]),
  });
}

const antrag = {
  procedureId: "musterantrag",
  procedureVersion: "1",
  data: { antragsdaten: { plz: "12345" }, berechnung: { betrag: 50 } },
};

describe("POST /api/buerger/antraege — eigenen Antrag einreichen", () => {
  it("legt den Antrag im Initialzustand des VERFAHRENS an und gibt die Bürger-Projektion zurück", async () => {
    const { app: a } = await app();
    const res = await a.inject({
      method: "POST",
      url: "/api/buerger/antraege",
      payload: antrag,
    });
    expect(res.statusCode).toBe(201);
    const dto = res.json();
    // Der Zustand kommt aus dem Verfahren, nicht aus dem Body.
    expect(dto.state).toBe("eingegangen");
    expect(dto.version).toBe(1);
    expect(dto.data).toEqual(antrag.data);
    // Die Bürger-Projektion zeigt KEINE interne Zuordnung/Topologie.
    expect(dto).not.toHaveProperty("subjectIds");
    expect(dto).not.toHaveProperty("tenantId");
    expect(dto).not.toHaveProperty("authorityId");
    expect(dto).not.toHaveProperty("ownerActorId");
    await a.close();
  });

  it("überlebt einen „Reload“: der eingereichte Antrag ist danach lesbar (der Kern der stateful Bürger-Seite)", async () => {
    const store = new InMemoryCaseStore();
    const { app: a } = await app(citizenSession(), store);
    const erstellt = (
      await a.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: antrag,
      })
    ).json();
    // Frische App-Instanz gegen DENSELBEN Store = neuer Browser/Reload.
    await a.close();
    const { app: b } = await app(citizenSession(), store);
    const liste = (
      await b.inject({ method: "GET", url: "/api/buerger/antraege" })
    ).json();
    expect(liste.antraege.map((x: { antragId: string }) => x.antragId)).toEqual(
      [erstellt.antragId],
    );
    await b.close();
  });

  it("400 bei unbekanntem Verfahren (Verfahren = DATEN; nichts wird erfunden)", async () => {
    const { app: a } = await app();
    const res = await a.inject({
      method: "POST",
      url: "/api/buerger/antraege",
      payload: { ...antrag, procedureId: "gibt-es-nicht" },
    });
    expect(res.statusCode).toBe(400);
    await a.close();
  });

  it("schreibt case.submitted — NICHT case.opened (sonst verschöbe die Einreichung die Vier-Augen-Bezugsgröße)", async () => {
    // case.opened steht in FOUR_EYES_RELEVANT_EVENT_TYPES und heisst „Bearbeitungsschritt durch eine
    // bedienstete Person". Die Einreichung ist der AUSLÖSER des Verfahrens, keine Bearbeitung.
    const store = new InMemoryCaseStore();
    const { app: a } = await app(citizenSession(), store);
    const erstellt = (
      await a.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: antrag,
      })
    ).json();
    const audit = await store.listAuditEvents({
      tenantId: "tenant-1",
      caseId: erstellt.antragId,
    });
    expect(audit.map((e) => e.eventType)).toEqual(["case.submitted"]);
    expect(audit[0]?.legalBasisId).toBe("muster-satzung-1");
    await a.close();
  });
});

describe("GET /api/buerger/antraege — nur die EIGENEN", () => {
  it("eine fremde Bürgerin sieht den Antrag NICHT — weder in der Liste noch per direkter Kennung", async () => {
    // DER eigentliche Sicherheitsanspruch dieser Routen-Familie.
    const store = new InMemoryCaseStore();
    const { app: annas } = await app(
      citizenSession({ actorId: "actor.anna" }),
      store,
    );
    const annasAntrag = (
      await annas.inject({
        method: "POST",
        url: "/api/buerger/antraege",
        payload: antrag,
      })
    ).json();
    await annas.close();

    const { app: bodos } = await app(
      citizenSession({ actorId: "actor.bodo" }),
      store,
    );
    expect(
      (
        await bodos.inject({ method: "GET", url: "/api/buerger/antraege" })
      ).json().antraege,
    ).toEqual([]);
    // Direkter Zugriff mit KORREKTER Kennung → 404, nicht 403: kein Existenz-Orakel über fremde Vorgänge.
    const direkt = await bodos.inject({
      method: "GET",
      url: `/api/buerger/antraege/${annasAntrag.antragId}`,
    });
    expect(direkt.statusCode).toBe(404);
    await bodos.close();
  });

  it("ein behörden-initiierter Fall (ohne Eigentümer) taucht NIE unter „meine Anträge“ auf", async () => {
    const store = new InMemoryCaseStore();
    // Die Sachbearbeitung legt einen Fall an — der hat keinen Bürger-Eigentümer.
    const { app: amt } = await app(caseworkerSession(), store);
    await amt.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        procedureId: "musterantrag",
        procedureVersion: "1",
        state: "eingegangen",
        subjectIds: ["subject.1"],
      },
    });
    await amt.close();

    const { app: buerger } = await app(citizenSession(), store);
    expect(
      (
        await buerger.inject({ method: "GET", url: "/api/buerger/antraege" })
      ).json().antraege,
    ).toEqual([]);
    await buerger.close();
  });

  it("403 ohne die eigene Permission — die Sachbearbeitung nutzt diese Familie nicht", async () => {
    // caseworker hat case.read/case.decision.prepare, aber NICHT case.own.read: die Bürger-Familie
    // ist nicht ihr Weg an Fälle (deny-by-default, keine implizite Vererbung).
    const { app: a } = await app(caseworkerSession());
    const res = await a.inject({ method: "GET", url: "/api/buerger/antraege" });
    expect(res.statusCode).toBe(403);
    await a.close();
  });
});
