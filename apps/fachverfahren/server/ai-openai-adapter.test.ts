import { describe, it, expect } from "vitest";

import {
  createOpenAiAssist,
  createAiAssistFromEnv,
} from "./ai-openai-adapter.js";
import type { VorgangKiVorschlag } from "./ai-assist.js";

const CTX = {
  requestId: "r1",
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "b1",
};
const REQ = { task: "vorgang-assist", input: { faelligIso: "2026-07-12" } };

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

describe("createOpenAiAssist — kanonischer AiAssistPort (assistiv + fail-closed)", () => {
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
    const r = await ki.suggest(CTX, REQ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value.value as VorgangKiVorschlag;
    expect(v.prioritaet).toBe("hoch");
    expect(v.labels).toEqual(["eilig"]);
    expect(r.value.confidence).toBe(0.9);
    expect(r.value.rationale).toContain("Frist");
    expect(r.value.modelId).toBe("openai-compatible:m");
    expect(r.value.marking).toBe("ki-vorschlag");
    expect(r.value.reviewRequired).toBe(true);
    expect(r.value.euAiActClass).toBe("limited-risk");
  });

  it("erzwingt Transparenz/HITL serverseitig — das Modell kann sie NICHT abschalten", async () => {
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
    const r = await ki.suggest(CTX, REQ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.marking).toBe("ki-vorschlag");
    expect(r.value.reviewRequired).toBe(true);
    expect(r.value.euAiActClass).toBe("limited-risk");
  });

  it("lehnt high-risk-Aufgaben ab (capabilityFailure)", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch(modelReply("{}")),
    });
    const r = await ki.suggest(CTX, { ...REQ, maxClass: "high-risk" });
    expect(r.ok).toBe(false);
  });

  it("fail-closed bei Netzfehler/Timeout -> capabilityFailure (retryable)", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: throwingFetch,
    });
    const r = await ki.suggest(CTX, REQ);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.retryable).toBe(true);
      expect(r.error.message).toContain("nicht verfuegbar");
    }
  });

  it("fail-closed bei HTTP-Fehler", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch({}, { ok: false, status: 500 }),
    });
    expect((await ki.suggest(CTX, REQ)).ok).toBe(false);
  });

  it("fail-closed bei unverwertbarer Modell-Antwort (kein JSON)", async () => {
    const ki = createOpenAiAssist({
      baseUrl: "http://x/v1",
      model: "m",
      fetchImpl: stubFetch(modelReply("das ist kein json")),
    });
    expect((await ki.suggest(CTX, REQ)).ok).toBe(false);
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

  it("mit Endpunkt+Modell -> ein Port mit descriptor + suggest", () => {
    const ki = createAiAssistFromEnv({
      AI_ASSIST_BASE_URL: "http://x/v1",
      AI_ASSIST_MODEL: "m",
    });
    expect(ki).not.toBeNull();
    expect(ki?.descriptor.id).toBe("ai-assist");
    expect(typeof ki?.suggest).toBe("function");
  });
});
