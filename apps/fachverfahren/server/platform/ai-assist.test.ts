import { describe, expect, it } from "vitest";
import { createAiAssistPortFromEnv } from "./ai-assist.js";

describe("createAiAssistPortFromEnv — Port-Registry (Modul-Auswahl per Env)", () => {
  it("Default (kein Env) → local-fake", () => {
    const port = createAiAssistPortFromEnv({} as NodeJS.ProcessEnv);
    expect(port.descriptor.provider).toBe("local-fake");
  });

  it("AI_ASSIST_PROVIDER=local → local-fake", () => {
    const port = createAiAssistPortFromEnv({
      AI_ASSIST_PROVIDER: "local",
    } as NodeJS.ProcessEnv);
    expect(port.descriptor.provider).toBe("local-fake");
  });

  it("AI_ASSIST_PROVIDER=ollama → echter Ollama-Adapter", () => {
    const port = createAiAssistPortFromEnv({
      AI_ASSIST_PROVIDER: "ollama",
      OLLAMA_MODEL: "qwen3",
    } as NodeJS.ProcessEnv);
    expect(port.descriptor.provider).toBe("ollama");
  });

  it("AI_ASSIST_PROVIDER=chos → chos-Agentic-Adapter (mit CHOS_AGENT_URL)", () => {
    const port = createAiAssistPortFromEnv({
      AI_ASSIST_PROVIDER: "chos",
      CHOS_AGENT_URL: "https://chos.example",
    } as NodeJS.ProcessEnv);
    expect(port.descriptor.provider).toBe("chos");
  });

  it("AI_ASSIST_PROVIDER=chos OHNE CHOS_AGENT_URL → wirft (fail-closed)", () => {
    expect(() =>
      createAiAssistPortFromEnv({
        AI_ASSIST_PROVIDER: "chos",
      } as NodeJS.ProcessEnv),
    ).toThrow(/CHOS_AGENT_URL/);
  });

  it("unbekannter Anbieter → wirft (fail-closed, kein stiller Fallback)", () => {
    expect(() =>
      createAiAssistPortFromEnv({
        AI_ASSIST_PROVIDER: "openai-cloud",
      } as NodeJS.ProcessEnv),
    ).toThrow(/AI_ASSIST_PROVIDER/);
  });
});
