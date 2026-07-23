import { describe, expect, it } from "vitest";
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

/** Ein AiAssistPort, der IMMER fail-closed antwortet (kein Modell erreichbar) — für den 503-Pfad. */
const unavailablePort: AiAssistPort = {
  descriptor: {
    id: "ai-assist",
    name: "Unavailable",
    version: "0.0.0",
    provider: "test-unavailable",
    dataClassification: "confidential",
    schemas: [],
    semantics: defaultSemantics,
  },
  async suggest() {
    return capabilityFailure(
      "ai-assist/provider-unavailable",
      "kein Modell erreichbar",
      { retryable: true, classification: "confidential" },
    );
  },
};

describe("BFF POST /api/ai/assist", () => {
  it("200: Sachbearbeitung erhält einen TRANSPARENTEN Vorschlag (marking/reviewRequired) + Audit", async () => {
    const { app, auditSink } = await buildBffApp({
      session: caseworkerSession(),
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/assist",
      payload: { task: "adresse-vorschlag", input: { plz: "10115" } },
    });
    expect(res.statusCode).toBe(200);
    const dto = res.json();
    expect(dto.marking).toBe("ki-vorschlag");
    expect(dto.reviewRequired).toBe(true);
    expect(dto.euAiActClass).toBe("limited-risk");
    expect(typeof dto.modelId).toBe("string");
    // KI-Nutzung ist auditiert (Nachvollziehbarkeit).
    expect(
      auditSink.events.some(
        (e) =>
          e.kind === "app-data" &&
          e.event.eventType === "ai.suggestion.created",
      ),
    ).toBe(true);
    await app.close();
  });

  it("403: Bürgerin hat keine ai.assist-Permission", async () => {
    const { app } = await buildBffApp({ session: citizenSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/assist",
      payload: { task: "adresse-vorschlag", input: {} },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("401: ohne Sitzung", async () => {
    const { app } = await buildBffApp({});
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/assist",
      payload: { task: "adresse-vorschlag", input: {} },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("422: high-risk-Autonomie wird abgelehnt (kein rechtsnahes autonomes Entscheiden)", async () => {
    const { app } = await buildBffApp({ session: caseworkerSession() });
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/assist",
      payload: {
        task: "binding-legal-decision",
        input: {},
        maxClass: "high-risk",
      },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it("503: kein Modell erreichbar → ehrliches Scheitern, kein fingierter Vorschlag", async () => {
    const { app } = await buildBffApp({
      session: caseworkerSession(),
      aiAssist: unavailablePort,
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/ai/assist",
      payload: { task: "adresse-vorschlag", input: {} },
    });
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
