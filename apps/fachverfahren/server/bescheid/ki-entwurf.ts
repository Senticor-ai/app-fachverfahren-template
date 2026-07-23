// bescheid/ki-entwurf — der KI-AGENTEN-Pfad für Bescheide (Issue #59/#60). Ein Sachbearbeiter lässt den
// AiAssistPort (chos-Agent, AAL-2 „Advise") eine Bescheid-BEGRÜNDUNG ENTWERFEN. Der Entwurf ist ein
// VORSCHLAG (limited-risk, `reviewRequired:true`) — NIE final: ein Mensch prüft und gibt frei, erst dann
// wird der Text über `freitextAusEntwurf` zu einer Template-Freitext-Sektion und in den (dann einzufrierenden)
// Bescheid gerendert. So bleibt der PDF-Renderer deterministisch und KI-frei; die KI wirkt strikt davor,
// unter menschlicher Kontrolle (EU-AI-Act Art. 14/limited-risk, „KI ist nie eines der zwei Augen").
import type { VerwaltungsaktDto } from "@senticor/app-bff-contracts";
import type {
  AiAssistPort,
  AiSuggestion,
  CapabilityResponse,
  PortCallContext,
} from "@senticor/platform-contracts";
import type { BescheidSektion } from "./pdf.js";

export interface BescheidEntwurfInput {
  /** Der (vorbereitete) Verwaltungsakt, für den ein Begründungsentwurf gewünscht ist. */
  va: VerwaltungsaktDto;
  /** Anzeigename der erlassenden Behörde. */
  behoerde: string;
  /** Optionale Sachbearbeiter-Hinweise, die den Entwurf steuern (kein freier Prompt an die KI — strukturiert). */
  hinweise?: string;
}

/**
 * Lässt den KI-Agenten eine Bescheid-Begründung ENTWERFEN (task `bescheid-begruendung-entwurf`, limited-risk).
 * Liefert die rohe Suggestion (HITL: `reviewRequired:true`). Fehler/High-risk übersetzt der Port fail-closed.
 */
export async function entwerfeBescheidBegruendung(
  port: AiAssistPort,
  context: PortCallContext,
  input: BescheidEntwurfInput,
): Promise<CapabilityResponse<AiSuggestion>> {
  return port.suggest(context, {
    task: "bescheid-begruendung-entwurf",
    input: {
      aktenzeichen: input.va.aktenzeichen,
      tenor: input.va.tenor,
      rechtsbehelf: input.va.rechtsbehelf,
      behoerde: input.behoerde,
      ...(input.hinweise ? { hinweise: input.hinweise } : {}),
    },
    maxClass: "limited-risk",
  });
}

/** Zerlegt einen KI-Wert (String, String-Array oder `{text|begruendung}`) in getrimmte Absätze. */
function normalisiereAbsaetze(value: unknown): string[] {
  if (typeof value === "string")
    return value
      .split(/\n{2,}/)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  if (Array.isArray(value))
    return value
      .filter((v): v is string => typeof v === "string")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const text = record["text"] ?? record["begruendung"];
    if (text !== undefined) return normalisiereAbsaetze(text);
  }
  return [];
}

/**
 * Wandelt eine MENSCHLICH GEPRÜFTE (freigegebene) KI-Suggestion in eine Freitext-Sektion für das Bescheid-
 * Template. NUR nach der Freigabe (HITL) aufrufen. Leerer/nicht verwertbarer Entwurf → sichtbarer Platzhalter,
 * nie stilles Verschlucken.
 */
export function freitextAusEntwurf(
  suggestion: AiSuggestion,
  ueberschrift = "Begründung",
): BescheidSektion {
  const absaetze = normalisiereAbsaetze(suggestion.value);
  return {
    kind: "freitext",
    ueberschrift,
    absaetze:
      absaetze.length > 0 ? absaetze : ["(kein Begründungstext übernommen)"],
  };
}
