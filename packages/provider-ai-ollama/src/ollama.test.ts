import { describe, expect, it, vi } from "vitest";
import {
  aiAssistContractScenarios,
  sampleContext,
} from "@senticor/platform-contracts";
import {
  createOllamaAiAssistPort,
  createOllamaAiAssistPortFromEnv,
} from "./ollama.js";

/** Ein fetch-Stub, der eine gültige Ollama-/api/generate-Antwort liefert. */
function stubOk(responseText = "Beispiel-Vorschlag"): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ response: responseText }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("Ollama AiAssistPort — Conformance gegen DENSELBEN Vertrag wie der local-fake", () => {
  const port = createOllamaAiAssistPort({
    baseUrl: "http://ollama.test:11434",
    model: "qwen3",
    fetchImpl: stubOk(),
  });
  for (const scenario of aiAssistContractScenarios(port)) {
    it(scenario.name, async () => {
      await expect(scenario.run()).resolves.toBeUndefined();
    });
  }
});

describe("Ollama AiAssistPort — adapterspezifische Invarianten", () => {
  it("lehnt high-risk VOR jedem Netzaufruf ab (Governance vor Modell)", async () => {
    const fetchImpl = stubOk();
    const port = createOllamaAiAssistPort({
      baseUrl: "http://ollama.test:11434",
      model: "qwen3",
      fetchImpl,
    });
    const res = await port.suggest(sampleContext(), {
      task: "binding-legal-decision",
      input: {},
      maxClass: "high-risk",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("ai-assist/high-risk-refused");
    // Kein Netzaufruf für eine abgelehnte high-risk-Aufgabe.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("mappt die Ollama-Wire-Antwort in den Vorschlag + setzt die HCAI-Marker hart", async () => {
    const port = createOllamaAiAssistPort({
      baseUrl: "http://ollama.test:11434/",
      model: "qwen3",
      fetchImpl: stubOk("Musterstraße 1"),
    });
    const res = await port.suggest(sampleContext(), {
      task: "adresse-vorschlag",
      input: { plz: "10115" },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.value).toBe("Musterstraße 1");
    expect(res.value.modelId).toBe("ollama:qwen3");
    // Trailing-Slash der baseUrl wird normalisiert (keine Doppel-Slashes in der Quelle).
    expect(res.value.sources).toEqual(["ollama:http://ollama.test:11434"]);
    expect(res.value.marking).toBe("ki-vorschlag");
    expect(res.value.euAiActClass).toBe("limited-risk");
    expect(res.value.reviewRequired).toBe(true);
  });

  it("fail-closed: Netzfehler → capabilityFailure (retryable), NIE ein fabrizierter Vorschlag", async () => {
    const port = createOllamaAiAssistPort({
      baseUrl: "http://ollama.test:11434",
      model: "qwen3",
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    const res = await port.suggest(sampleContext(), {
      task: "adresse-vorschlag",
      input: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("ai-assist/provider-unavailable");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("fail-closed: Non-2xx → capabilityFailure (5xx retryable)", async () => {
    const port = createOllamaAiAssistPort({
      baseUrl: "http://ollama.test:11434",
      model: "qwen3",
      fetchImpl: (async () =>
        new Response("overloaded", { status: 503 })) as unknown as typeof fetch,
    });
    const res = await port.suggest(sampleContext(), {
      task: "adresse-vorschlag",
      input: {},
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("ai-assist/provider-unavailable");
      expect(res.error.retryable).toBe(true);
    }
  });

  it("createOllamaAiAssistPortFromEnv liest baseUrl/model aus der Umgebung", () => {
    const port = createOllamaAiAssistPortFromEnv({
      OLLAMA_BASE_URL: "http://ollama.intern:11434",
      OLLAMA_MODEL: "llama3",
    } as NodeJS.ProcessEnv);
    expect(port.descriptor.provider).toBe("ollama");
    expect(port.descriptor.name).toContain("llama3");
  });
});
