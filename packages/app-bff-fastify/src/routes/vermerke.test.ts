import { describe, expect, it } from "vitest";
import { InMemoryCaseStore } from "@senticor/app-store-postgres";
import {
  createInMemoryProcedureRegistry,
  type ProcedureVersion,
} from "@senticor/public-sector-sdk";
import {
  capabilityFailure,
  defaultSemantics,
  type AiAssistPort,
} from "@senticor/platform-contracts";
import {
  buildBffApp,
  caseworkerSession,
  citizenSession,
} from "../test-helpers.js";

const procedure: ProcedureVersion = {
  procedureId: "musterakte",
  version: "1",
  effectiveFrom: "2026-01-01T00:00:00.000Z",
  legalBasisIds: ["§ 1 Demo-Satzung"],
  allowedStates: ["offen", "bearbeitung"],
  allowedTransitions: [
    {
      from: "offen",
      to: "bearbeitung",
      action: "bearbeiten",
      requiredPermission: "case.decision.prepare",
    },
  ],
};

/** Ein AiAssistPort, der IMMER fail-closed ist — für den 503-Pfad des KI-Vermerks. */
const unavailableAi: AiAssistPort = {
  descriptor: {
    id: "ai-assist",
    name: "Unavailable",
    version: "0.0.0",
    provider: "test",
    dataClassification: "confidential",
    schemas: [],
    semantics: defaultSemantics,
  },
  async suggest() {
    return capabilityFailure("ai-assist/provider-unavailable", "kein Modell", {
      retryable: true,
      classification: "confidential",
    });
  },
};

async function amtMitFall(aiAssist?: AiAssistPort) {
  const caseStore = new InMemoryCaseStore();
  const registry = createInMemoryProcedureRegistry([procedure]);
  const { app } = await buildBffApp({
    session: caseworkerSession({ actorId: "actor.sb" }),
    caseStore,
    procedureRegistry: registry,
    ...(aiAssist ? { aiAssist } : {}),
  });
  const created = (
    await app.inject({
      method: "POST",
      url: "/api/cases",
      payload: {
        procedureId: "musterakte",
        procedureVersion: "1",
        state: "offen",
        subjectIds: ["subject.1"],
      },
    })
  ).json();
  return { app, caseStore, registry, caseId: created.caseId as string };
}

describe("BFF Aktenvermerke (/api/cases/:id/vermerke)", () => {
  it("Mensch-Vermerk: 201, quelle=mensch, im append-only Audit + über GET lesbar", async () => {
    const { app, caseId } = await amtMitFall();
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/vermerke`,
      payload: { text: "Rücksprache mit der Antragstellerin geführt." },
    });
    expect(res.statusCode).toBe(201);
    const dto = res.json();
    expect(dto.quelle).toBe("mensch");
    expect(dto.reviewStatus).toBe("nicht-erforderlich");
    expect(dto.autorActorId).toBe("actor.sb");
    expect(dto.modelId).toBeNull();

    // Lesbar über GET /vermerke.
    const liste = (
      await app.inject({ method: "GET", url: `/api/cases/${caseId}/vermerke` })
    ).json();
    expect(liste.vermerke).toHaveLength(1);
    expect(liste.vermerke[0].text).toBe(
      "Rücksprache mit der Antragstellerin geführt.",
    );

    // Landet im echten append-only Fall-Audit (case.note.added).
    const audit = (
      await app.inject({ method: "GET", url: `/api/cases/${caseId}/audit` })
    ).json();
    expect(
      audit.events.some(
        (e: { eventType: string }) => e.eventType === "case.note.added",
      ),
    ).toBe(true);
    await app.close();
  });

  it("KI-Vermerk: 201, quelle=ki, modelId gesetzt, reviewStatus=offen (prüfpflichtig)", async () => {
    const { app, caseId } = await amtMitFall();
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/vermerke/ki`,
      payload: {
        task: "zusammenfassung",
        input: { hinweis: "synthetischer Kontext" },
      },
    });
    expect(res.statusCode).toBe(201);
    const dto = res.json();
    expect(dto.quelle).toBe("ki");
    expect(typeof dto.modelId).toBe("string");
    expect(dto.reviewStatus).toBe("offen");
    expect(dto.text.length).toBeGreaterThan(0);
    await app.close();
  });

  it("KI-Vermerk 503, wenn kein Modell erreichbar ist — kein fingierter Vermerk", async () => {
    const { app, caseId } = await amtMitFall(unavailableAi);
    const res = await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/vermerke/ki`,
      payload: { task: "zusammenfassung", input: {} },
    });
    expect(res.statusCode).toBe(503);
    // KEIN Vermerk wurde geschrieben.
    const liste = (
      await app.inject({ method: "GET", url: `/api/cases/${caseId}/vermerke` })
    ).json();
    expect(liste.vermerke).toHaveLength(0);
    await app.close();
  });

  it("403 ohne case.note.write (Bürger-Session)", async () => {
    const { caseStore, registry, caseId } = await amtMitFall();
    const { app: buerger } = await buildBffApp({
      session: citizenSession(),
      caseStore,
      procedureRegistry: registry,
    });
    const res = await buerger.inject({
      method: "POST",
      url: `/api/cases/${caseId}/vermerke`,
      payload: { text: "sollte nicht gehen" },
    });
    expect(res.statusCode).toBe(403);
    await buerger.close();
  });

  it("404 für eine Akte einer FREMDEN Behörde (kein Existenz-Orakel)", async () => {
    const { caseStore, registry, caseId } = await amtMitFall();
    const { app: fremd } = await buildBffApp({
      session: caseworkerSession({ authorityId: "authority-anders" }),
      caseStore,
      procedureRegistry: registry,
    });
    const res = await fremd.inject({
      method: "POST",
      url: `/api/cases/${caseId}/vermerke`,
      payload: { text: "fremd" },
    });
    expect(res.statusCode).toBe(404);
    await fremd.close();
  });
});
