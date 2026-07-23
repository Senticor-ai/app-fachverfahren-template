// provider-ai-ollama — ein ECHTER AiAssistPort-Adapter gegen einen lokalen/selbstgehosteten Ollama-Server
// (OSS-first, kein Cloud-Key). Er ist austauschbar mit dem local-fake: BEIDE bestehen dieselben
// `aiAssistContractScenarios` aus @senticor/platform-contracts — das ist die Substituierbarkeit.
//
// DREI Invarianten, die dieser Adapter WAHRT, egal was das Modell zurückgibt:
//  1. HCAI/EU-AI-Act: `marking:"ki-vorschlag"`, `euAiActClass:"limited-risk"`, `reviewRequired:true`
//     sind hart gesetzt — die rechtsnahe Entscheidung bleibt menschlich (serverseitig, Vier-Augen).
//  2. high-risk wird VOR jedem Netzaufruf abgelehnt (kein autonomes rechtsnahes Entscheiden).
//  3. Ehrlich fail-closed: ist kein Modell erreichbar (Netzfehler/Timeout/Non-2xx), liefert der Adapter
//     eine `capabilityFailure` — NIE einen fabrizierten Vorschlag oder eine erfundene Konfidenz.
import {
  capabilityFailure,
  capabilityOk,
  defaultSemantics,
  type AiAssistPort,
  type AiSuggestion,
  type CapabilityResponse,
  type PortCallContext,
} from "@senticor/platform-contracts";

/** Konfiguration des Ollama-Adapters. `fetchImpl` ist injizierbar (Tests/Proxy); Default = globales `fetch`. */
export interface OllamaAiAssistConfig {
  /** Basis-URL des Ollama-Servers, z.B. "http://localhost:11434". */
  baseUrl: string;
  /** Modellname, z.B. "qwen3" (der Adapter meldet ihn als `ollama:<model>`). */
  model: string;
  /** Injizierbares fetch (Tests/Transport-Proxy). Default: globales `fetch`. */
  fetchImpl?: typeof fetch;
  /** Abbruch-Timeout in ms (fail-closed bei hängen bleibendem Server). Default 10s. */
  timeoutMs?: number;
}

/** Ollamas /api/generate-Antwort (nur das Feld, das wir lesen). */
interface OllamaGenerateResponse {
  response?: unknown;
}

/**
 * Die Konfidenz ist ehrlich NICHT modell-kalibriert: Ollama liefert für /api/generate keine kalibrierte
 * Wahrscheinlichkeit. Wir setzen einen dokumentierten, neutralen Prior statt einer erfundenen Prozentzahl —
 * die „Warum"-Begründung weist genau darauf hin. Die eigentliche Bewertung leistet der prüfende Mensch.
 */
const UNCALIBRATED_CONFIDENCE = 0.5;

export function createOllamaAiAssistPort(
  config: OllamaAiAssistConfig,
): AiAssistPort {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const modelId = `ollama:${config.model}`;

  return {
    descriptor: {
      id: "ai-assist",
      name: `Ollama AI Assist (${config.model})`,
      version: "0.1.0",
      provider: "ollama",
      dataClassification: "confidential",
      schemas: [],
      semantics: defaultSemantics,
    },
    async suggest(
      _context: PortCallContext,
      request,
    ): Promise<CapabilityResponse<AiSuggestion>> {
      // (2) high-risk wird VOR jedem Netzaufruf abgelehnt — Governance vor Modell.
      if (request.maxClass === "high-risk") {
        return capabilityFailure(
          "ai-assist/high-risk-refused",
          "KI darf rechtsnahe Entscheidungen nicht autonom treffen (assistiv/limited-risk).",
          { retryable: false, classification: "confidential" },
        );
      }

      const prompt = buildPrompt(request.task, request.input);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let text: string;
      try {
        const res = await fetchImpl(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: config.model, prompt, stream: false }),
          signal: controller.signal,
        });
        if (!res.ok) {
          // (3) fail-closed: Non-2xx → explizites Scheitern, kein fabrizierter Vorschlag.
          return capabilityFailure(
            "ai-assist/provider-unavailable",
            `Ollama antwortete mit HTTP ${res.status}.`,
            { retryable: res.status >= 500, classification: "confidential" },
          );
        }
        const data = (await res.json()) as OllamaGenerateResponse;
        text = typeof data.response === "string" ? data.response.trim() : "";
      } catch (error) {
        // (3) fail-closed: Netzfehler/Timeout → explizites Scheitern (retryable), NIE Erfindung.
        return capabilityFailure(
          "ai-assist/provider-unavailable",
          `Ollama nicht erreichbar (${baseUrl}): ${describeError(error)}`,
          { retryable: true, classification: "confidential" },
        );
      } finally {
        clearTimeout(timer);
      }

      // (1) HCAI/EU-AI-Act-Invarianten hart gesetzt — der Adapter darf sie NIE dem Modell überlassen.
      const suggestion: AiSuggestion = {
        value: text,
        confidence: UNCALIBRATED_CONFIDENCE,
        modelId,
        rationale: `OSS-Vorschlag von ${modelId} für Aufgabe '${request.task}'. Konfidenz ist nicht modell-kalibriert (Ollama liefert keine Wahrscheinlichkeit); menschlich zu prüfen.`,
        sources: [`ollama:${baseUrl}`],
        marking: "ki-vorschlag",
        euAiActClass: "limited-risk",
        reviewRequired: true,
      };
      return capabilityOk(suggestion);
    },
  };
}

/**
 * Liest die Ollama-Konfiguration aus der Umgebung — fail-safe Defaults auf den lokalen OSS-Server.
 * `OLLAMA_BASE_URL` (Default http://localhost:11434), `OLLAMA_MODEL` (Default qwen3), `OLLAMA_TIMEOUT_MS`.
 */
export function createOllamaAiAssistPortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AiAssistPort {
  const timeoutRaw = env["OLLAMA_TIMEOUT_MS"];
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
  return createOllamaAiAssistPort({
    baseUrl: env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
    model: env["OLLAMA_MODEL"] ?? "qwen3",
    ...(timeoutMs !== undefined && Number.isFinite(timeoutMs)
      ? { timeoutMs }
      : {}),
  });
}

function buildPrompt(task: string, input: Record<string, unknown>): string {
  return [
    `Aufgabe: ${task}`,
    `Kontext (JSON): ${JSON.stringify(input)}`,
    "Antworte knapp und faktenbasiert. Triff KEINE rechtsverbindliche Entscheidung.",
  ].join("\n");
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "AbortError" ? "Timeout" : error.message;
  }
  return String(error);
}
