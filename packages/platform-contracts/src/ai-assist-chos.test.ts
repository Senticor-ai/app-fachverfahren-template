// ai-assist-chos.test — der chos-Agentic AiAssistPort-Adapter über den Fake-Kernel (ohne laufendes chos).
// Prüft: HITL/limited-risk-Vertrag, high-risk-Ablehnung (AAL-Grenze), fail-closed, Handoff-Draht, env-Selektor.
import { describe, expect, it } from "vitest";
import type { PortCallContext } from "./capabilities.js";
import {
  createChosAgentClientFromEnv,
  createChosAiAssistPort,
  HttpChosAgentClient,
  InMemoryChosAgentClient,
  type ChosAgentClient,
} from "./ai-assist-chos.js";

const ctx: PortCallContext = {
  requestId: "req-1",
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  purpose: "case-management",
};

describe("createChosAiAssistPort", () => {
  it("liefert einen HITL-Vorschlag: marking, limited-risk, reviewRequired IMMER true", async () => {
    const port = createChosAiAssistPort(new InMemoryChosAgentClient());
    const res = await port.suggest(ctx, {
      task: "vollstaendigkeits-hinweis",
      input: { feld: "x" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      marking: "ki-vorschlag",
      euAiActClass: "limited-risk",
      reviewRequired: true,
    });
    expect(res.value.modelId).toContain("chos");
    expect(res.value.sources).toContain("chos:handoff");
  });

  it("lehnt high-risk ab (AAL-2 Advise — keine autonome rechtsnahe Entscheidung)", async () => {
    const port = createChosAiAssistPort(new InMemoryChosAgentClient());
    const res = await port.suggest(ctx, {
      task: "bescheid-entscheiden",
      input: {},
      maxClass: "high-risk",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("ai-assist/high-risk-refused");
    expect(res.error.retryable).toBe(false);
  });

  it("fail-closed: ein nicht erreichbarer Kernel wird zu capabilityFailure (retryable)", async () => {
    const throwing: ChosAgentClient = {
      async advise() {
        throw new Error("connection refused");
      },
    };
    const port = createChosAiAssistPort(throwing);
    const res = await port.suggest(ctx, { task: "x", input: {} });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("ai-assist/chos-unavailable");
    expect(res.error.retryable).toBe(true);
  });
});

describe("HttpChosAgentClient", () => {
  it("POSTet ein Handoff Envelope an /v1/agentic/advise und parst die Advice", async () => {
    let captured: { url: string; body: unknown } | undefined;
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      captured = { url: String(input), body: JSON.parse(String(init?.body)) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: { ok: true },
          confidence: 0.8,
          rationale: "r",
          sources: ["chos:knowledge"],
          modelId: "chos:mesh",
        }),
      } as Response;
    }) as typeof fetch;
    const client = new HttpChosAgentClient({
      baseUrl: "https://chos.example/",
      token: "secret",
      fetchImpl,
    });
    const advice = await client.advise({
      task: "t",
      input: {},
      maxClass: "limited-risk",
      requestId: "r",
      tenantId: "t1",
      authorityId: "b1",
      jurisdictionId: "de",
    });
    expect(advice.confidence).toBe(0.8);
    expect(captured?.url).toBe("https://chos.example/v1/agentic/advise");
    expect((captured?.body as { task: string }).task).toBe("t");
  });

  it("wirft bei Nicht-2xx (der Port übersetzt → fail-closed)", async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 503 }) as Response) as typeof fetch;
    const client = new HttpChosAgentClient({
      baseUrl: "https://chos.example",
      fetchImpl,
    });
    await expect(
      client.advise({
        task: "t",
        input: {},
        maxClass: "limited-risk",
        requestId: "r",
        tenantId: "t1",
        authorityId: "b1",
        jurisdictionId: "de",
      }),
    ).rejects.toThrow(/HTTP 503/);
  });
});

describe("createChosAgentClientFromEnv", () => {
  it("CHOS_AGENT_URL (oder CHOS_API_URL) → Client; sonst undefined", () => {
    expect(
      createChosAgentClientFromEnv({
        CHOS_AGENT_URL: "https://chos.example",
      }),
    ).toBeInstanceOf(HttpChosAgentClient);
    expect(
      createChosAgentClientFromEnv({
        CHOS_API_URL: "https://chos.example",
      }),
    ).toBeInstanceOf(HttpChosAgentClient);
    expect(createChosAgentClientFromEnv({})).toBeUndefined();
  });
});
