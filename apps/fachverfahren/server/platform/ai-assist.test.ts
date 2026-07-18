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

  it("unbekannter Anbieter → wirft (fail-closed, kein stiller Fallback)", () => {
    expect(() =>
      createAiAssistPortFromEnv({
        AI_ASSIST_PROVIDER: "openai-cloud",
      } as NodeJS.ProcessEnv),
    ).toThrow(/AI_ASSIST_PROVIDER/);
  });
});
