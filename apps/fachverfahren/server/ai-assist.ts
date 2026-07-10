// server/ai-assist — die austauschbare KI-Assistenz-Naht (VORBEREITUNG für einen echten LLM-Adapter).
//
// Die KI ist AUSSCHLIESSLICH assistierend/vorschlagend — NIE autoritativ und NIE eines der zwei Augen (EU-AI-Act
// Art. 50; Gleichbehandlung Art. 3 GG). Ein Vorschlag trägt immer `marking:"ki-vorschlag"` + `reviewRequired:true`,
// eine Begründung und Quellen. Die Naht ist framework-neutral: ein `KiAssistPort` bekommt einen PII-armen Kontext und
// liefert einen Vorschlag. Im Test/DEV liefert `HeuristicKiAssist` einen ERKLÄRBAREN, deterministischen Vorschlag
// (kein Netz, aus Frist/Betrag abgeleitet); in PROD wird der Port durch einen echten LLM-Adapter ersetzt.

/** EU-AI-Act-Risikoklasse eines Assistenz-Aufrufs. Assistenz bleibt „limited-risk". */
export type EuAiActClass = "minimal-risk" | "limited-risk";

/** Ein KI-VORSCHLAG — nie ein Effekt. Der Mensch bestätigt (oder verwirft) ihn im Client. */
export interface AiSuggestion {
  vorschlag: {
    prioritaet?: string;
    zuweisenAn?: string;
    labels?: string[];
    /** Entscheidungs-ENTWURF (Text) — nie final, nur Vorlage für den Menschen. */
    entscheidungsentwurf?: string;
  };
  /** 0..1 — Selbsteinschätzung der Zuverlässigkeit. */
  konfidenz: number;
  begruendung: string;
  quellen: string[];
  marking: "ki-vorschlag";
  reviewRequired: true;
  euAiActClass: EuAiActClass;
}

/** PII-armer Kontext — bewusst nur Metadaten + neutralisierte Felder, kein Freitext/Name. */
export interface AiAssistContext {
  tenantId: string;
  authorityId: string;
  procedureId: string;
  taskId: string;
  caseId?: string;
  prioritaet?: string | null;
  faelligIso?: string | null;
  labels?: string[];
}

/** Zusätzliche, vom Client gelieferte (PII-arme) Auswertungsdaten (z. B. Betrag/Kategorie). */
export interface AiAssistInput {
  daten?: Record<string, unknown>;
}

export interface KiAssistPort {
  suggest(ctx: AiAssistContext, input: AiAssistInput): Promise<AiSuggestion>;
}

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
 * DEV/Test-Assistenz: ein ERKLÄRBARER, deterministischer Vorschlag aus Frist + Betrag — KEIN Netz, KEIN Zufall.
 * Priorität primär aus der Restfrist (erklärbar), ein „eilig"-Label bei knapper Frist, ein Entscheidungs-Entwurf bei
 * hohem Betrag. Ersetzt in PROD ein echter LLM-Adapter (derselbe Port).
 */
export class HeuristicKiAssist implements KiAssistPort {
  constructor(
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async suggest(
    ctx: AiAssistContext,
    input: AiAssistInput,
  ): Promise<AiSuggestion> {
    const quellen: string[] = [];
    const vorschlag: AiSuggestion["vorschlag"] = {};
    let konfidenz = 0.4;

    // Priorität aus der Restfrist (erklärbar).
    if (ctx.faelligIso) {
      const restTage =
        (Date.parse(ctx.faelligIso) - Date.parse(this.now())) / 86_400_000;
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
    const betrag = alsZahl(input.daten?.["betrag"]);
    if (betrag !== undefined) {
      quellen.push(`Betrag = ${betrag}`);
      if (betrag >= 1000) {
        vorschlag.entscheidungsentwurf =
          "Prüfvorschlag: Nachweis der Anspruchsvoraussetzungen anfordern (Betrag über der Bagatellgrenze).";
        konfidenz = conf(konfidenz + 0.05);
      }
    }

    const begruendung =
      quellen.length > 0
        ? `Abgeleitet aus: ${quellen.join("; ")}.`
        : "Keine ableitbaren Signale (Frist/Betrag fehlen) — nur schwacher Vorschlag.";

    return {
      vorschlag,
      konfidenz: conf(konfidenz),
      begruendung,
      quellen,
      marking: "ki-vorschlag",
      reviewRequired: true,
      euAiActClass: "limited-risk",
    };
  }
}
