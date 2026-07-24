// ai-assist-chos — der PRODUKTIVE AiAssistPort-Adapter auf chos-code als Kernel für agentische KI (Cognitive
// Hive OS Blueprint v5.0). Der Port ist die AGENTIC INTERFACE (§9) einer Composable auf Autonomie-Level
// AAL-2 „Advise" (§7): die KI berät, entscheidet NIE rechtsnah autonom. Kommunikation läuft über ein
// strukturiertes HANDOFF ENVELOPE (§10) — kein freier Prompt-Block —, jede Antwort trägt das Pflicht-
// Transparenzmuster + `reviewRequired:true` (HITL, EU-AI-Act limited-risk).
//
// OSS-SEITIG OWNED wie die Storage-Naht (ChosClient): dieses Repo hängt NICHT an privaten chos-Paketen,
// sondern spricht gegen die schlanke Naht `ChosAgentClient`. `InMemoryChosAgentClient` macht den Adapter
// OHNE laufendes chos testbar; `HttpChosAgentClient` ist die dünne Draht-Kante gegen die chos-Agentic-API.
// Ohne Konfiguration bleibt der lokale Stub (`createLocalAiAssistPort`) der Default — Standalone unberührt.
import {
  capabilityFailure,
  capabilityOk,
  defaultSemantics,
  type CapabilityDescriptor,
  type CapabilityResponse,
  type PortCallContext,
} from "./capabilities.js";
import type { AiAssistPort, AiSuggestion, AiSuggestRequest } from "./ports.js";

/** Strukturiertes Handoff Envelope an den chos-Agentic-Kernel (Blueprint §10) — Metadaten + gewünschtes
 *  Ergebnis, NIE ein freier Prompt. `maxClass` begrenzt die Autonomie (high-risk wird gar nicht erst gesandt). */
export interface ChosAgentHandoff {
  task: string;
  input: Record<string, unknown>;
  maxClass: "minimal" | "limited-risk";
  requestId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  purpose?: string;
}

/** Die Beratungs-Antwort des Kernels (nur ein VORSCHLAG). `sources` = Provenienz (Knowledge/Register). */
export interface ChosAgentAdvice {
  value: unknown;
  confidence: number;
  rationale: string;
  sources: string[];
  modelId: string;
}

/** Die OSS-eigene Naht zum chos-Agentic-Kernel. Wirft bei Nichterreichbarkeit/Fehler (der Port übersetzt → fail-closed). */
export interface ChosAgentClient {
  advise(handoff: ChosAgentHandoff): Promise<ChosAgentAdvice>;
}

/** Deterministischer Fake für DEV/Tests — echoet den Handoff als niedrig-konfidenten Vorschlag, OHNE Netz/Modell. */
export class InMemoryChosAgentClient implements ChosAgentClient {
  constructor(private readonly modelId = "chos:mesh-advise") {}
  async advise(handoff: ChosAgentHandoff): Promise<ChosAgentAdvice> {
    return {
      value: handoff.input,
      confidence: 0.5,
      rationale: `chos-Agentic-Vorschlag (${this.modelId}) für '${handoff.task}' — synthetisch, menschlich zu prüfen.`,
      sources: ["chos:handoff"],
      modelId: this.modelId,
    };
  }
}

/** Dünne Draht-Kante gegen die chos-Agentic-API. Endpunkt-/Payload-Vertrag bei der Integration gegen ein
 *  laufendes chos zu fixieren (POST eines Handoff Envelope → Advice). Auth optional per Bearer-Token. */
export interface HttpChosAgentClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class HttpChosAgentClient implements ChosAgentClient {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpChosAgentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async advise(handoff: ChosAgentHandoff): Promise<ChosAgentAdvice> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/agentic/advise`, {
      method: "POST",
      headers,
      body: JSON.stringify(handoff),
    });
    if (!res.ok)
      throw new Error(`chos agentic advise failed: HTTP ${res.status}`);
    return (await res.json()) as ChosAgentAdvice;
  }
}

function chosAiDescriptor(): CapabilityDescriptor {
  return {
    id: "ai-assist",
    name: "chos Agentic AI Assist (Cognitive Hive OS)",
    version: "0.1.0-chos",
    provider: "chos",
    dataClassification: "confidential",
    schemas: [],
    semantics: defaultSemantics,
  };
}

/** Baut den AiAssistPort auf chos: `suggest` delegiert als AAL-2-„Advise" an den Kernel über ein Handoff
 *  Envelope. High-risk wird abgelehnt (keine autonome rechtsnahe Entscheidung). Jeder Vorschlag ist
 *  `reviewRequired:true` (HITL) + `marking:"ki-vorschlag"` + limited-risk. Kernel-Fehler → fail-closed. */
export function createChosAiAssistPort(client: ChosAgentClient): AiAssistPort {
  return {
    descriptor: chosAiDescriptor(),
    async suggest(
      context: PortCallContext,
      request: AiSuggestRequest,
    ): Promise<CapabilityResponse<AiSuggestion>> {
      if (request.maxClass === "high-risk") {
        return capabilityFailure(
          "ai-assist/high-risk-refused",
          "chos-KI darf rechtsnahe Entscheidungen nicht autonom treffen (AAL-2 Advise, limited-risk).",
          { retryable: false, classification: "confidential" },
        );
      }
      const handoff: ChosAgentHandoff = {
        task: request.task,
        input: request.input,
        maxClass: request.maxClass === "minimal" ? "minimal" : "limited-risk",
        requestId: context.requestId,
        tenantId: context.tenantId,
        authorityId: context.authorityId,
        jurisdictionId: context.jurisdictionId,
        ...(context.purpose !== undefined ? { purpose: context.purpose } : {}),
      };
      let advice: ChosAgentAdvice;
      try {
        advice = await client.advise(handoff);
      } catch (error) {
        return capabilityFailure(
          "ai-assist/chos-unavailable",
          `chos-Agentic-Kernel nicht erreichbar: ${String(error)}`,
          { retryable: true, classification: "confidential" },
        );
      }
      const suggestion: AiSuggestion = {
        value: advice.value,
        confidence: advice.confidence,
        modelId: advice.modelId,
        rationale: advice.rationale,
        sources: advice.sources,
        marking: "ki-vorschlag",
        euAiActClass: "limited-risk",
        reviewRequired: true,
      };
      return capabilityOk(suggestion);
    },
  };
}

/** Wählt den chos-Agentic-Client aus einer Umgebung: `CHOS_AGENT_URL` (Fallback `CHOS_API_URL`) + optional
 *  `CHOS_API_TOKEN` → HttpChosAgentClient; sonst `undefined` (der Aufrufer bleibt beim lokalen Stub). Nimmt die
 *  ENV als einfaches Record entgegen (das Paket bleibt browser-neutral, kein `process`); der Node-Aufrufer
 *  reicht `process.env` durch. */
export function createChosAgentClientFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): HttpChosAgentClient | undefined {
  const baseUrl = env["CHOS_AGENT_URL"] ?? env["CHOS_API_URL"];
  if (!baseUrl) return undefined;
  const token = env["CHOS_API_TOKEN"];
  return new HttpChosAgentClient({ baseUrl, ...(token ? { token } : {}) });
}

/** Der Descriptor einer INSTANZIIERTEN Composable-Stelle als CONTAINER (Ziel-1 S6/S7): die Stelle wird als
 *  deploybarer Container emittiert (CHOS `emitComposableContainer`) und exponiert NUR ihre Engine — `baseUrl` +
 *  `password` (das OPENCODE_SERVER_PASSWORD des Containers). Der KIT ist ein CLIENT dieser Engine (kein
 *  in-process-Kernel, kein opencode-Ersatz). Optional `composableId` für Provenienz/Logging. */
export interface ComposableEngineDescriptor {
  baseUrl: string;
  password: string;
  composableId?: string;
}

/**
 * createComposableEngineClient — die CONTAINER-CONSUME-Naht: aus dem Engine-Descriptor einer gemounteten/
 * containerisierten Stelle wird ein `ChosAgentClient`. REUSE=MOUNTEN: es ist DERSELBE `HttpChosAgentClient` wie beim
 * remote-chos-Kernel — das Container-Passwort reist als Bearer-Token, kein zweiter Client-Typ. So wird eine
 * zertifizierte, als Container ausgerollte Stelle direkt über den bestehenden AiAssistPort (createChosAiAssistPort)
 * chattbar/beratend, ohne einen opencode-freien Zweit-Kernel.
 *
 * FOLGESCHRITT (live-container): der Container fährt eine opencode-Engine; der konkrete Engine-Wire (Session/Message
 * bzw. die vom Container vorgelagerte Agentic-Naht `/v1/agentic/advise`) wird gegen einen LAUFENDEN Container fixiert.
 * Diese Naht kapselt bereits Descriptor + Auth, sodass der Wire-Tausch lokal bleibt.
 */
export function createComposableEngineClient(
  descriptor: ComposableEngineDescriptor,
): HttpChosAgentClient {
  if (!descriptor.baseUrl)
    throw new Error("composable engine descriptor requires a baseUrl");
  if (!descriptor.password)
    throw new Error(
      "composable engine descriptor requires the container engine password (OPENCODE_SERVER_PASSWORD)",
    );
  return new HttpChosAgentClient({
    baseUrl: descriptor.baseUrl,
    token: descriptor.password,
  });
}

/** Wählt den Container-Engine-Client aus der Umgebung: `COMPOSABLE_ENGINE_URL` + `COMPOSABLE_ENGINE_PASSWORD`
 *  (optional `COMPOSABLE_ID`) → Client gegen die exponierte Container-Engine; ohne beide Pflicht-Werte `undefined`
 *  (der Aufrufer bleibt fail-closed). Browser-neutral (kein `process`); der Node-Aufrufer reicht `process.env` durch. */
export function createComposableEngineClientFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): HttpChosAgentClient | undefined {
  const baseUrl = env["COMPOSABLE_ENGINE_URL"];
  const password = env["COMPOSABLE_ENGINE_PASSWORD"];
  if (!baseUrl || !password) return undefined;
  return createComposableEngineClient({
    baseUrl,
    password,
    ...(env["COMPOSABLE_ID"] ? { composableId: env["COMPOSABLE_ID"] } : {}),
  });
}
