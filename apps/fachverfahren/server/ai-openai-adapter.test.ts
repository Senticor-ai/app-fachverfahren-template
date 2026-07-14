import { describe, it, expect } from "vitest";

import {
  createOpenAiAssist,
  createAiAssistFromEnv,
} from "./ai-openai-adapter.js";
import type { AiAssistContext } from "./ai-assist.js";

const ctx: AiAssistContext = {
  tenantId: "t1",
  authorityId: "b1",
  procedureId: "leistung",
  taskId: "task-1",
  faelligIso: "2026-07-12T00:00:00.000Z",
  labels: [],
};

function stubFetch(
  payload: unknown,
  opts: { ok?: boolean; status?: number } = {},
): typeof fetch {
  const { ok = true, status = 200 } = opts;
  return (async () => ({
    ok,
    status,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

const throwingFetch = (async () => {
  throw new Error("boom");
}) as unknown as typeof fetch;

const modelReply = (content: string) => ({
  choices: [{ message: { content } }],
});

describe("createOpenAiAssist — OSS-KI-Adapter (assistiv + fail-closed)", () => {
  it("mappt eine gültige Modell-Antwort in einen Vorschlag", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch(
        modelReply(
          JSON.stringify({
            prioritaet: "hoch",
            labels: ["eilig"],
            konfidenz: 0.9,
            begruendung: "knappe Frist",
          }),
        ),
      ),
    });
    const s = await ki.suggest(ctx, {});
    expect(s.vorschlag.prioritaet).toBe("hoch");
    expect(s.vorschlag.labels).toEqual(["eilig"]);
    expect(s.konfidenz).toBe(0.9);
    expect(s.begruendung).toContain("Frist");
    expect(s.marking).toBe("ki-vorschlag");
    expect(s.reviewRequired).toBe(true);
    expect(s.euAiActClass).toBe("limited-risk");
  });

  it("erzwingt Transparenz/HITL serverseitig — das Modell kann sie NICHT abschalten", async () => {
    // Boesartige/fehlerhafte Modell-Antwort, die die Pflicht-Transparenz kippen will.
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch(
        modelReply(
          JSON.stringify({
            prioritaet: "hoch",
            marking: "amtlich",
            reviewRequired: false,
            euAiActClass: "high-risk",
          }),
        ),
      ),
    });
    const s = await ki.suggest(ctx, {});
    expect(s.marking).toBe("ki-vorschlag");
    expect(s.reviewRequired).toBe(true);
    expect(s.euAiActClass).toBe("limited-risk");
  });

  it("fail-closed bei Netzfehler/Timeout -> nicht verfügbar (Konfidenz 0, HITL bleibt)", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: throwingFetch,
    });
    const s = await ki.suggest(ctx, {});
    expect(s.konfidenz).toBe(0);
    expect(s.begruendung).toContain("nicht verfügbar");
    expect(s.marking).toBe("ki-vorschlag");
    expect(s.reviewRequired).toBe(true);
  });

  it("fail-closed bei HTTP-Fehler", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch({}, { ok: false, status: 500 }),
    });
    expect((await ki.suggest(ctx, {})).konfidenz).toBe(0);
  });

  it("fail-closed bei unverwertbarer Modell-Antwort (kein JSON)", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch(modelReply("das ist kein json")),
    });
    expect((await ki.suggest(ctx, {})).konfidenz).toBe(0);
  });
});

describe("createAiAssistFromEnv — fail-closed Default", () => {
  it("ohne Endpunkt+Modell -> null (dann greift die lokale Heuristik)", () => {
    expect(createAiAssistFromEnv({})).toBeNull();
    expect(
      createAiAssistFromEnv({ AI_ASSIST_BASE_URL: "http://x/v1" }),
    ).toBeNull();
    expect(createAiAssistFromEnv({ AI_ASSIST_MODEL: "m" })).toBeNull();
  });

  it("mit Endpunkt+Modell -> ein Port", () => {
    const ki = createAiAssistFromEnv({
      AI_ASSIST_BASE_URL: "http://x/v1",
      AI_ASSIST_MODEL: "m",
    });
    expect(ki).not.toBeNull();
    expect(typeof ki?.suggest).toBe("function");
  });
});
