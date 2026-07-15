import { describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleAssist } from "./index.js";

const context = {
  requestId: "request-1",
  tenantId: "tenant-1",
  authorityId: "authority-1",
  jurisdictionId: "de",
  purpose: "case-assistance",
  legalBasisId: "legal.case-assistance",
};

const governance = {
  dataClassification: "internal" as const,
  allowedTasks: ["triage", "draft", "summary"],
  allowedPurposes: ["case-assistance"],
  allowedLegalBasisIds: ["legal.case-assistance"],
};

function response(content: unknown, ok = true, status = 200): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(content) } }],
      }),
  })) as unknown as typeof fetch;
}

describe("createOpenAiCompatibleAssist", () => {
  it("sends only explicitly allowed input fields", async () => {
    const fetchImpl = response({
      value: { priority: "high" },
      confidence: 0.8,
      rationale: "Short deadline",
      sources: ["deadline"],
    });
    const port = createOpenAiCompatibleAssist({
      baseUrl: "http://localhost:11434/v1",
      model: "test",
      ...governance,
      allowedInputKeys: ["deadline"],
      fetchImpl,
    });

    const result = await port.suggest(context, {
      task: "triage",
      input: { deadline: "2026-07-20", personName: "must-not-leave" },
    });

    expect(result.ok).toBe(true);
    const request = vi.mocked(fetchImpl).mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      messages: { content: string }[];
    };
    expect(body.messages[1]?.content).toContain("deadline");
    expect(body.messages[1]?.content).not.toContain("personName");
    expect(body.messages[1]?.content).not.toContain("must-not-leave");
  });

  it("enforces review metadata independently of model output", async () => {
    const port = createOpenAiCompatibleAssist({
      baseUrl: "http://localhost:11434/v1",
      model: "test",
      ...governance,
      allowedInputKeys: [],
      fetchImpl: response({
        value: "draft",
        confidence: 2,
        rationale: "model rationale",
        sources: [],
        reviewRequired: false,
        marking: "official",
        euAiActClass: "high-risk",
      }),
    });

    const result = await port.suggest(context, { task: "draft", input: {} });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reviewRequired).toBe(true);
    expect(result.value.marking).toBe("ki-vorschlag");
    expect(result.value.euAiActClass).toBe("limited-risk");
    expect(result.value.confidence).toBe(1);
  });

  it("rejects high-risk requests and oversized allowed input", async () => {
    const port = createOpenAiCompatibleAssist({
      baseUrl: "http://localhost:11434/v1",
      model: "test",
      ...governance,
      allowedInputKeys: ["text"],
      maxInputBytes: 32,
      fetchImpl: response({ value: "unused" }),
    });

    expect(
      (
        await port.suggest(context, {
          task: "decision",
          input: {},
          maxClass: "high-risk",
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await port.suggest(context, {
          task: "summary",
          input: { text: "x".repeat(100) },
        })
      ).ok,
    ).toBe(false);
  });

  it("fails closed on transport and response errors", async () => {
    const throwingFetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    const unavailable = createOpenAiCompatibleAssist({
      baseUrl: "http://localhost:11434/v1",
      model: "test",
      ...governance,
      allowedInputKeys: [],
      fetchImpl: throwingFetch,
    });
    expect(
      (await unavailable.suggest(context, { task: "draft", input: {} })).ok,
    ).toBe(false);

    const invalid = createOpenAiCompatibleAssist({
      baseUrl: "http://localhost:11434/v1",
      model: "test",
      ...governance,
      allowedInputKeys: [],
      fetchImpl: response({ rationale: "missing value" }),
    });
    expect(
      (await invalid.suggest(context, { task: "draft", input: {} })).ok,
    ).toBe(false);
  });

  it("fails closed for unapproved task, purpose, and legal basis", async () => {
    const port = createOpenAiCompatibleAssist({
      baseUrl: "http://localhost:11434/v1",
      model: "test",
      ...governance,
      allowedInputKeys: [],
      fetchImpl: response({ value: "unused" }),
    });

    expect(
      (await port.suggest(context, { task: "decision", input: {} })).ok,
    ).toBe(false);
    expect(
      (
        await port.suggest(
          { ...context, purpose: "unapproved" },
          { task: "draft", input: {} },
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await port.suggest(
          { ...context, legalBasisId: "unapproved" },
          { task: "draft", input: {} },
        )
      ).ok,
    ).toBe(false);
  });

  it("rejects non-TLS remote endpoints during configuration", () => {
    expect(() =>
      createOpenAiCompatibleAssist({
        baseUrl: "http://example.invalid/v1",
        model: "test",
        ...governance,
        allowedInputKeys: [],
      }),
    ).toThrow(/HTTPS/);
  });
});
