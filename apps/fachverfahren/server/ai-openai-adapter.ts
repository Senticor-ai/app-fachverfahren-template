// server/ai-openai-adapter — OSS-first, vendor-neutraler KI-Adapter (OpenAI-kompatibles Protokoll).
//
// Deckt per PROTOKOLL Ollama / vLLM / LocalAI / OpenAI ab — kein Vendor-Lock, kein Inline-Key (Modell
// + Endpunkt kommen aus der Umgebung). Erfüllt denselben `KiAssistPort` wie `HeuristicKiAssist`, ist
// also 1:1 austauschbar. Leitplanken (EU-AI-Act Art. 50 · DSGVO Art. 22):
//   • STRIKT ASSISTIV: `marking:"ki-vorschlag"`, `reviewRequired:true` und `euAiActClass:"limited-risk"`
//     werden IMMER serverseitig gesetzt — NIE aus der Modell-Antwort übernommen. Die KI ist damit
//     strukturell nie eines der zwei Augen; der Mensch entscheidet.
//   • FAIL-CLOSED: Timeout / Netzfehler / HTTP-Fehler / unverwertbare Antwort → ein „KI nicht
//     verfügbar"-Vorschlag (Konfidenz 0), der Mensch prüft manuell. Kein Absturz, kein 500.
//   • PII-ARM: es wird NUR der neutralisierte Kontext (Priorität/Frist/Labels + client-gelieferte
//     `daten`) gesendet, kein Freitext/Name. Betreiber verantworten, dass `daten` PII-arm ist bzw.
//     der Endpunkt lokal/vertrauenswürdig ist (Default ohne Endpunkt = lokale Heuristik, kein Netz).
//
// Beim späteren Kollaps auf den kanonischen `platform-contracts AiAssistPort` wandert dieser Adapter
// mit (gleiche Semantik, generischer `value`/`CapabilityResponse`-Umschlag).
import type {
  AiAssistContext,
  AiAssistInput,
  AiSuggestion,
  KiAssistPort,
} from "./ai-assist.js";

export interface OpenAiAssistConfig {
  /** OpenAI-kompatible Basis-URL, z. B. `http://localhost:11434/v1` (Ollama) oder `.../v1`. */
  baseUrl: string;
  /** Modell-Kennung, z. B. `qwen2.5` / `gpt-4o-mini`. */
  model: string;
  /** Optionaler Bearer-Key (bei lokalen Servern meist nicht nötig). */
  apiKey?: string;
  /** Zeitbudget je Aufruf (Default 8000 ms). */
  timeoutMs?: number;
  /** Injizierbares fetch (für Tests); Default globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT =
  "Du bist eine ASSISTIERENDE Hilfe für eine deutsche Behörden-Sachbearbeitung. Du triffst NIE eine " +
  "Entscheidung — du machst nur VORSCHLÄGE, die ein Mensch prüft. Antworte AUSSCHLIESSLICH mit einem " +
  "JSON-Objekt mit den optionalen Feldern: prioritaet (string: 'niedrig'|'mittel'|'hoch'), zuweisenAn " +
  "(string), labels (string[]), entscheidungsentwurf (string, nur ein ENTWURF, nie final), konfidenz " +
  "(number 0..1), begruendung (string). Keine weiteren Felder, kein Freitext außerhalb des JSON.";

/** Ein fail-closed „nicht verfügbar"-Vorschlag (Mensch entscheidet manuell). Immer frisch erzeugt. */
function nichtVerfuegbar(grund: string): AiSuggestion {
  return {
    vorschlag: {},
    konfidenz: 0,
    begruendung: `KI nicht verfügbar (${grund}) — bitte manuell prüfen.`,
    quellen: [],
    marking: "ki-vorschlag",
    reviewRequired: true,
    euAiActClass: "limited-risk",
  };
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** PII-arme Signale für das Modell — nur neutralisierte Metadaten. */
function baueSignale(
  ctx: AiAssistContext,
  input: AiAssistInput,
): Record<string, unknown> {
  return {
    prioritaet: ctx.prioritaet ?? null,
    faelligIso: ctx.faelligIso ?? null,
    labels: ctx.labels ?? [],
    daten: input.daten ?? {},
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

/** Übernimmt NUR bekannte, typgeprüfte Felder aus der Modell-Antwort in den Vorschlag. */
function baueVorschlag(p: Record<string, unknown>): AiSuggestion["vorschlag"] {
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

/** Baut einen OpenAI-kompatiblen KI-Assistenz-Port. */
export function createOpenAiAssist(config: OpenAiAssistConfig): KiAssistPort {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const timeoutMs = config.timeoutMs ?? 8000;
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;

  return {
    async suggest(
      ctx: AiAssistContext,
      input: AiAssistInput,
    ): Promise<AiSuggestion> {
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
                content: JSON.stringify(baueSignale(ctx, input)),
              },
            ],
          }),
          signal: controller.signal,
        });
      } catch {
        return nichtVerfuegbar("Netzfehler oder Zeitüberschreitung");
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) return nichtVerfuegbar(`HTTP ${response.status}`);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return nichtVerfuegbar("ungültige Antwort");
      }
      const content = (
        payload as { choices?: { message?: { content?: unknown } }[] }
      )?.choices?.[0]?.message?.content;
      const parsed = sicheresJson(content);
      if (!parsed)
        return nichtVerfuegbar("Modell lieferte kein verwertbares JSON");

      return {
        vorschlag: baueVorschlag(parsed),
        konfidenz: clamp01(parsed["konfidenz"]),
        begruendung:
          typeof parsed["begruendung"] === "string"
            ? parsed["begruendung"]
            : "Vorschlag des KI-Modells (ohne Begründung).",
        quellen: [`Modell ${config.model}`],
        // IMMER serverseitig — nie aus der Modell-Antwort (Art. 50 / HITL, strukturell erzwungen):
        marking: "ki-vorschlag",
        reviewRequired: true,
        euAiActClass: "limited-risk",
      };
    },
  };
}

/**
 * Baut den KI-Port aus der Umgebung — oder `null`, wenn kein Endpunkt konfiguriert ist (fail-closed:
 * dann greift die lokale `HeuristicKiAssist`, es verlässt KEIN Datum den Prozess). OSS-first: jeder
 * OpenAI-kompatible Server (Ollama/vLLM/LocalAI/OpenAI) funktioniert per Protokoll.
 */
export function createAiAssistFromEnv(
  env: Record<string, string | undefined>,
): KiAssistPort | null {
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
