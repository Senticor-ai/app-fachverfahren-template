// server/ai-assist — KI-Assistenz auf dem KANONISCHEN platform-contracts `AiAssistPort` (EINE Wahrheit).
//
// Die KI ist AUSSCHLIESSLICH assistierend/vorschlagend — NIE autoritativ und NIE eines der zwei Augen
// (EU-AI-Act Art. 50; Gleichbehandlung Art. 3 GG). Jeder Vorschlag traegt `marking:"ki-vorschlag"` +
// `reviewRequired:true`, eine Begruendung und Quellen. Frueher fuehrte der Server einen EIGENEN,
// duplizierten `KiAssistPort` + `AiSuggestion`/`EuAiActClass` — das war eine zweite Wahrheit neben dem
// kanonischen Vertrag. Jetzt implementiert `HeuristicKiAssist` direkt den kanonischen `AiAssistPort`;
// der fachliche Vorschlag steckt in `AiSuggestion.value` (das Verfahren castet zu `VorgangKiVorschlag`).
// `HeuristicKiAssist` liefert im DEV/Test einen ERKLAERBAREN, deterministischen Vorschlag aus Frist +
// Betrag (kein Netz, kein Zufall); in PROD dockt ein echter LLM-Adapter an DENSELBEN Port an.
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

/** Der fachliche Vorschlagswert (`AiSuggestion.value`) — NIE eine Entscheidung, nur Vorlage. */
export interface VorgangKiVorschlag {
  prioritaet?: string;
  zuweisenAn?: string;
  labels?: string[];
  /** Entscheidungs-ENTWURF (Text) — nie final, nur Vorlage fuer den Menschen. */
  entscheidungsentwurf?: string;
}

/** PII-arme Domaenensignale, die die Route in `AiSuggestRequest.input` legt (kein Freitext/Name). */
export interface VorgangAssistInput {
  procedureId?: string;
  taskId?: string;
  caseId?: string;
  prioritaet?: string | null;
  faelligIso?: string | null;
  labels?: string[];
  daten?: Record<string, unknown>;
}

/** Der Capability-Deskriptor der KI-Assistenz-Naht (kanonisch). */
export const AI_ASSIST_DESCRIPTOR: CapabilityDescriptor = {
  id: "ai-assist",
  name: "Heuristik-KI-Assistenz (erklaerbar, deterministisch)",
  version: "0.1.0",
  provider: "heuristic",
  dataClassification: "internal",
  schemas: [],
  semantics: defaultSemantics,
};

/** Runde auf 2 Stellen (deterministisch, ohne Zufall). */
function conf(x: number): number {
  return Math.round(Math.min(1, Math.max(0, x)) * 100) / 100;
}

function alsZahl(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isNaN(v) ? undefined : v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

/**
 * DEV/Test-Assistenz auf dem kanonischen Port: ein ERKLAERBARER, deterministischer Vorschlag aus Frist +
 * Betrag — KEIN Netz, KEIN Zufall. Prioritaet primaer aus der Restfrist (erklaerbar), ein „eilig"-Label
 * bei knapper Frist, ein Entscheidungs-Entwurf bei hohem Betrag. Ersetzt in PROD ein echter LLM-Adapter
 * (derselbe Port). Rechtsnahe (high-risk) Aufgaben werden abgelehnt — die KI entscheidet nie autonom.
 */
export class HeuristicKiAssist implements AiAssistPort {
  readonly descriptor = AI_ASSIST_DESCRIPTOR;

  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

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

    const inp = request.input as VorgangAssistInput;
    const quellen: string[] = [];
    const vorschlag: VorgangKiVorschlag = {};
    let konfidenz = 0.4;

    // Prioritaet aus der Restfrist (erklaerbar).
    if (typeof inp.faelligIso === "string") {
      const restTage =
        (Date.parse(inp.faelligIso) - Date.parse(this.now())) / 86_400_000;
      quellen.push(`Restfrist ≈ ${Math.round(restTage)} Tage`);
      if (restTage <= 3) {
        vorschlag.prioritaet = "hoch";
        vorschlag.labels = ["eilig"];
        konfidenz = 0.75;
      } else if (restTage <= 14) {
        vorschlag.prioritaet = "mittel";
        konfidenz = 0.6;
      } else {
        vorschlag.prioritaet = "niedrig";
        konfidenz = 0.55;
      }
    }

    // Entscheidungs-ENTWURF bei hohem Betrag (nur Vorlage, nie final).
    const betrag = alsZahl(inp.daten?.["betrag"]);
    if (betrag !== undefined) {
      quellen.push(`Betrag = ${betrag}`);
      if (betrag >= 1000) {
        vorschlag.entscheidungsentwurf =
          "Pruefvorschlag: Nachweis der Anspruchsvoraussetzungen anfordern (Betrag ueber der Bagatellgrenze).";
        konfidenz = conf(konfidenz + 0.05);
      }
    }

    const rationale =
      quellen.length > 0
        ? `Abgeleitet aus: ${quellen.join("; ")}.`
        : "Keine ableitbaren Signale (Frist/Betrag fehlen) — nur schwacher Vorschlag.";

    const suggestion: AiSuggestion = {
      value: vorschlag,
      confidence: conf(konfidenz),
      modelId: "heuristik:frist-betrag",
      rationale,
      sources: quellen,
      marking: "ki-vorschlag",
      euAiActClass: "limited-risk",
      reviewRequired: true,
    };
    return capabilityOk(suggestion);
  }
}
