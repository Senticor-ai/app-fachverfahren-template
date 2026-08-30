import {
  capabilityFailure,
  capabilityOk,
  defaultSemantics,
  type AiAssistPort,
  type AiSuggestion,
  type AiSuggestRequest,
  type CapabilityDescriptor,
  type CapabilityResponse,
  type DataClassification,
  type PortCallContext,
} from "@senticor/platform-contracts";

export interface OpenAiCompatibleAssistConfig {
  /** OpenAI-compatible base URL, for example a local Ollama or vLLM endpoint. */
  baseUrl: string;
  model: string;
  /** Classification of the data this provider instance is approved to receive. */
  dataClassification: DataClassification;
  /** Stable task identifiers approved for this endpoint. Task text is sent to the provider. */
  allowedTasks: readonly string[];
  /** Port-call purposes approved for this endpoint. Missing purposes fail closed. */
  allowedPurposes: readonly string[];
  /** Legal-basis identifiers approved for this endpoint. Missing identifiers fail closed. */
  allowedLegalBasisIds: readonly string[];
  /**
   * Explicit allowlist for fields copied from `AiSuggestRequest.input`.
   * No input field leaves the process unless it is listed here.
   */
  allowedInputKeys: readonly string[];
  apiKey?: string;
  timeoutMs?: number;
  maxInputBytes?: number;
  maxOutputBytes?: number;
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT =
  "Du bist eine assistierende Hilfe für eine deutsche Behörde. Du triffst keine Entscheidung. " +
  "Antworte ausschließlich als JSON-Objekt mit value, confidence, rationale und sources. " +
  "value ist ein Vorschlag; die menschliche Prüfung bleibt erforderlich.";

function clamp01(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(Math.min(1, Math.max(0, number)) * 100) / 100;
}

function selectAllowedInput(
  input: Record<string, unknown>,
  allowedInputKeys: readonly string[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const key of allowedInputKeys) {
    if (Object.hasOwn(input, key)) selected[key] = input[key];
  }
  return selected;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stringSources(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isAllowed(value: string | undefined, allowlist: readonly string[]) {
  return value !== undefined && allowlist.includes(value);
}

function endpointUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "OpenAI-compatible endpoints must use HTTPS; HTTP is limited to loopback development endpoints.",
    );
  }
  return new URL(`${url.toString().replace(/\/$/, "")}/chat/completions`);
}

export function createOpenAiCompatibleAssist(
  config: OpenAiCompatibleAssistConfig,
): AiAssistPort {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 8_000;
  const maxInputBytes = config.maxInputBytes ?? 16_384;
  const maxOutputBytes = config.maxOutputBytes ?? 65_536;
  const url = endpointUrl(config.baseUrl);
  const descriptor: CapabilityDescriptor = {
    id: "ai-assist",
    name: `OpenAI-compatible AI assist (${config.model})`,
    version: "0.1.0",
    provider: "openai-compatible",
    dataClassification: config.dataClassification,
    schemas: [],
    semantics: {
      ...defaultSemantics,
      timeoutMs,
      retry: { ...defaultSemantics.retry, maxAttempts: 1 },
      idempotency: "not-supported",
    },
  };

  return {
    descriptor,
    async suggest(
      _context: PortCallContext,
      request: AiSuggestRequest,
    ): Promise<CapabilityResponse<AiSuggestion>> {
      if (request.maxClass === "high-risk") {
        return capabilityFailure(
          "ai-assist/high-risk-refused",
          "Die konfigurierte Assistenz verarbeitet keine High-Risk-Aufgabe.",
          { retryable: false, classification: config.dataClassification },
        );
      }
      if (!config.allowedTasks.includes(request.task)) {
        return capabilityFailure(
          "ai-assist/task-not-approved",
          "Die angeforderte Assistenzaufgabe ist für diesen Endpunkt nicht freigegeben.",
          { retryable: false, classification: config.dataClassification },
        );
      }
      if (!isAllowed(_context.purpose, config.allowedPurposes)) {
        return capabilityFailure(
          "ai-assist/purpose-not-approved",
          "Der Verarbeitungszweck ist für diesen Endpunkt nicht freigegeben.",
          { retryable: false, classification: config.dataClassification },
        );
      }
      if (!isAllowed(_context.legalBasisId, config.allowedLegalBasisIds)) {
        return capabilityFailure(
          "ai-assist/legal-basis-not-approved",
          "Die Rechtsgrundlage ist für diesen Endpunkt nicht freigegeben.",
          { retryable: false, classification: config.dataClassification },
        );
      }

      const selectedInput = selectAllowedInput(
        request.input,
        config.allowedInputKeys,
      );
      const userContent = JSON.stringify({
        task: request.task,
        input: selectedInput,
      });
      if (new TextEncoder().encode(userContent).byteLength > maxInputBytes) {
        return capabilityFailure(
          "ai-assist/input-too-large",
          "Der freigegebene Assistenzkontext überschreitet die Größenbegrenzung.",
          { retryable: false, classification: config.dataClassification },
        );
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(config.apiKey
              ? { authorization: `Bearer ${config.apiKey}` }
              : {}),
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
          }),
          signal: controller.signal,
        });
      } catch {
        return capabilityFailure(
          "ai-assist/unavailable",
          "Die KI-Assistenz ist derzeit nicht verfügbar.",
          { retryable: true, classification: config.dataClassification },
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        return capabilityFailure(
          "ai-assist/http-error",
          `Die KI-Assistenz antwortete mit HTTP ${response.status}.`,
          { retryable: true, classification: config.dataClassification },
        );
      }

      let responseText: string;
      try {
        responseText = await response.text();
      } catch {
        return capabilityFailure(
          "ai-assist/invalid-response",
          "Die KI-Assistenz lieferte keine lesbare Antwort.",
          { retryable: false, classification: config.dataClassification },
        );
      }
      if (new TextEncoder().encode(responseText).byteLength > maxOutputBytes) {
        return capabilityFailure(
          "ai-assist/output-too-large",
          "Die Antwort der KI-Assistenz überschreitet die Größenbegrenzung.",
          { retryable: false, classification: config.dataClassification },
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(responseText);
      } catch {
        return capabilityFailure(
          "ai-assist/invalid-response",
          "Die KI-Assistenz lieferte keine gültige JSON-Antwort.",
          { retryable: false, classification: config.dataClassification },
        );
      }
      const content = (
        payload as { choices?: { message?: { content?: unknown } }[] }
      ).choices?.[0]?.message?.content;
      const parsed = parseObject(content);
      if (!parsed || !Object.hasOwn(parsed, "value")) {
        return capabilityFailure(
          "ai-assist/invalid-response",
          "Die KI-Assistenz lieferte keinen verwertbaren Vorschlag.",
          { retryable: false, classification: config.dataClassification },
        );
      }

      return capabilityOk({
        value: parsed["value"],
        confidence: clamp01(parsed["confidence"]),
        modelId: `openai-compatible:${config.model}`,
        rationale:
          typeof parsed["rationale"] === "string"
            ? parsed["rationale"]
            : "Keine Modellbegründung geliefert.",
        sources: stringSources(parsed["sources"]),
        // These values are provider-controlled and never accepted from model output.
        marking: "ki-vorschlag",
        euAiActClass: "limited-risk",
        reviewRequired: true,
      });
    },
  };
}
