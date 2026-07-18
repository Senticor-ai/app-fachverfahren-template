// platform/ai-assist — die PORT-REGISTRY für KI-Assistenz: EIN Ort, an dem die App den KI-Anbieter
// per Env wählt (Modularität — Module austauschbar). Sie lebt im Composition-Root (nicht im BFF), weil
// nur hier BEIDE Impls importiert werden dürfen: der neutrale local-fake (@senticor/platform-contracts)
// UND ein echter Adapter (@senticor/provider-ai-ollama). Der BFF konsumiert nur den Vertrag.
//
// Fail-closed nach dem Muster von createAuditSinkFromEnv: ein unbekannter Anbieter WIRFT (kein stiller
// Fallback auf einen ungewollten Anbieter).
import {
  createLocalAiAssistPort,
  type AiAssistPort,
} from "@senticor/platform-contracts";
import { createOllamaAiAssistPortFromEnv } from "@senticor/provider-ai-ollama";

/**
 * Wählt die AiAssistPort-Impl aus der Umgebung:
 *  - `AI_ASSIST_PROVIDER=local` (Default): deterministischer local-fake, kein Netz.
 *  - `AI_ASSIST_PROVIDER=ollama`: echter Ollama-Adapter (OLLAMA_BASE_URL/OLLAMA_MODEL).
 * Unbekannter Wert → Fehler (fail-closed).
 */
export function createAiAssistPortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AiAssistPort {
  const provider = env["AI_ASSIST_PROVIDER"] ?? "local";
  if (provider === "local") return createLocalAiAssistPort();
  if (provider === "ollama") return createOllamaAiAssistPortFromEnv(env);
  throw new Error(
    `AI_ASSIST_PROVIDER must be local or ollama, got: ${provider}`,
  );
}
