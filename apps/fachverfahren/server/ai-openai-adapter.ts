// server/ai-openai-adapter — OSS-first, vendor-neutraler KI-Adapter auf dem KANONISCHEN
// platform-contracts `AiAssistPort` (OpenAI-kompatibles Protokoll).
//
// Deckt per PROTOKOLL Ollama / vLLM / LocalAI / OpenAI ab — kein Vendor-Lock, kein Inline-Key (Modell
// + Endpunkt aus der Umgebung). Erfuellt denselben kanonischen Port wie `HeuristicKiAssist`, ist also
// 1:1 austauschbar. Leitplanken (EU-AI-Act Art. 50 · DSGVO Art. 22):
//   • STRIKT ASSISTIV: `marking:"ki-vorschlag"`, `reviewRequired:true` und `euAiActClass:"limited-risk"`
//     werden IMMER serverseitig gesetzt — NIE aus der Modell-Antwort uebernommen. Die KI ist damit
//     strukturell nie eines der zwei Augen; der Mensch entscheidet. high-risk wird abgelehnt.
//   • FAIL-CLOSED: Timeout / Netzfehler / HTTP-Fehler / unverwertbare Antwort → `capabilityFailure`
//     (die Route projiziert das auf einen „KI nicht verfuegbar"-Hinweis; der Mensch prueft manuell).
//   • PII-ARM: es werden NUR neutralisierte Signale (Prioritaet/Frist/Labels + `daten`) gesendet, kein
//     Freitext/Name. Betreiber verantworten, dass `daten` PII-arm ist bzw. der Endpunkt lokal/
//     vertrauenswuerdig ist (Default ohne Endpunkt = lokale Heuristik, kein Netz).
import {
  capabilityFailure,
  capabilityOk,
  defaultSemantics,
  type AiAssistPort,
  type AiSuggestion,
  type AiSuggestRequest,
  type CapabilityDescriptor,
  type CapabilityResponse,
  type PortCallContext,
} from "@senticor/platform-contracts";

import type { VorgangAssistInput, VorgangKiVorschlag } from "./ai-assist.js";

export interface OpenAiAssistConfig {
  /** OpenAI-kompatible Basis-URL, z. B. `http://localhost:11434/v1` (Ollama) oder `.../v1`. */
  baseUrl: string;
  /** Modell-Kennung, z. B. `qwen2.5` / `gpt-4o-mini`. */
  model: string;
  /** Optionaler Bearer-Key (bei lokalen Servern meist nicht noetig). */
  apiKey?: string;
  /** Zeitbudget je Aufruf (Default 8000 ms). */
  timeoutMs?: number;
  /** Injizierbares fetch (fuer Tests); Default globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT =
  "Du bist eine ASSISTIERENDE Hilfe fuer eine deutsche Behoerden-Sachbearbeitung. Du triffst NIE eine " +
  "Entscheidung — du machst nur VORSCHLAEGE, die ein Mensch prueft. Antworte AUSSCHLIESSLICH mit einem " +
  "JSON-Objekt mit den optionalen Feldern: prioritaet (string: 'niedrig'|'mittel'|'hoch'), zuweisenAn " +
  "(string), labels (string[]), entscheidungsentwurf (string, nur ein ENTWURF, nie final), konfidenz " +
  "(number 0..1), begruendung (string). Keine weiteren Felder, kein Freitext ausserhalb des JSON.";

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** PII-arme Signale fuer das Modell — nur neutralisierte Metadaten aus request.input. */
function baueSignale(input: unknown): Record<string, unknown> {
  const inp = (input ?? {}) as VorgangAssistInput;
  return {
    prioritaet: inp.prioritaet ?? null,
    faelligIso: inp.faelligIso ?? null,
    labels: inp.labels ?? [],
    daten: inp.daten ?? {},
  };
}

function sicheresJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Uebernimmt NUR bekannte, typgepruefte Felder aus der Modell-Antwort in den Vorschlag. */
function baueVorschlag(p: Record<string, unknown>): VorgangKiVorschlag {
  const labels = Array.isArray(p["labels"])
    ? p["labels"].filter((l): l is string => typeof l === "string")
    : undefined;
  return {
    ...(typeof p["prioritaet"] === "string"
      ? { prioritaet: p["prioritaet"] }
      : {}),
    ...(typeof p["zuweisenAn"] === "string"
      ? { zuweisenAn: p["zuweisenAn"] }
      : {}),
    ...(labels && labels.length > 0 ? { labels } : {}),
    ...(typeof p["entscheidungsentwurf"] === "string"
      ? { entscheidungsentwurf: p["entscheidungsentwurf"] }
      : {}),
  };
}

/** Baut einen OpenAI-kompatiblen KI-Assistenz-Port (kanonisch). */
export function createOpenAiAssist(config: OpenAiAssistConfig): AiAssistPort {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 8000;
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const descriptor: CapabilityDescriptor = {
    id: "ai-assist",
    name: `OpenAI-kompatible KI-Assistenz (${config.model})`,
    version: "0.1.0",
    provider: "openai-compatible",
    dataClassification: "internal",
    schemas: [],
    semantics: defaultSemantics,
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
          "KI darf rechtsnahe Entscheidungen nicht autonom treffen (assistiv/limited-risk).",
          { retryable: false, classification: "internal" },
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
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
              {
                role: "user",
                content: JSON.stringify(baueSignale(request.input)),
              },
            ],
          }),
          signal: controller.signal,
        });
      } catch {
        return capabilityFailure(
          "ai-assist/unavailable",
          "KI nicht verfuegbar (Netzfehler oder Zeitueberschreitung).",
          { retryable: true, classification: "internal" },
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok)
        return capabilityFailure(
          "ai-assist/http-error",
          `KI nicht verfuegbar (HTTP ${response.status}).`,
          { retryable: true, classification: "internal" },
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return capabilityFailure(
          "ai-assist/invalid-response",
          "KI-Antwort ungueltig.",
          { retryable: false, classification: "internal" },
        );
      }
      const content = (
        payload as { choices?: { message?: { content?: unknown } }[] }
      )?.choices?.[0]?.message?.content;
      const parsed = sicheresJson(content);
      if (!parsed)
        return capabilityFailure(
          "ai-assist/invalid-response",
          "Modell lieferte kein verwertbares JSON.",
          { retryable: false, classification: "internal" },
        );

      const suggestion: AiSuggestion = {
        value: baueVorschlag(parsed),
        confidence: clamp01(parsed["konfidenz"]),
        modelId: `openai-compatible:${config.model}`,
        rationale:
          typeof parsed["begruendung"] === "string"
            ? parsed["begruendung"]
            : "Vorschlag des KI-Modells (ohne Begruendung).",
        sources: [`Modell ${config.model}`],
        // IMMER serverseitig — nie aus der Modell-Antwort (Art. 50 / HITL, strukturell erzwungen):
        marking: "ki-vorschlag",
        euAiActClass: "limited-risk",
        reviewRequired: true,
      };
      return capabilityOk(suggestion);
    },
  };
}

/**
 * Baut den KI-Port aus der Umgebung — oder `null`, wenn kein Endpunkt konfiguriert ist (fail-closed:
 * dann greift die lokale `HeuristicKiAssist`, es verlaesst KEIN Datum den Prozess). OSS-first: jeder
 * OpenAI-kompatible Server (Ollama/vLLM/LocalAI/OpenAI) funktioniert per Protokoll.
 */
export function createAiAssistFromEnv(
  env: Record<string, string | undefined>,
): AiAssistPort | null {
  const baseUrl = env["AI_ASSIST_BASE_URL"]?.trim();
  const model = env["AI_ASSIST_MODEL"]?.trim();
  if (!baseUrl || !model) return null;
  const timeoutRaw = env["AI_ASSIST_TIMEOUT_MS"];
  const timeoutMs =
    timeoutRaw && Number.isFinite(Number(timeoutRaw))
      ? Number(timeoutRaw)
      : undefined;
  return createOpenAiAssist({
    baseUrl,
    model,
    ...(env["AI_ASSIST_API_KEY"] ? { apiKey: env["AI_ASSIST_API_KEY"] } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
}
