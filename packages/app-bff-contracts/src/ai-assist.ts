// Wire-Verträge der KI-Assistenz. Die KI ist ASSISTIV: sie schlägt vor, entscheidet nie.
// Die Antwort deklariert ALLE Transparenzfelder (marking/rationale/sources/euAiActClass/reviewRequired)
// vollständig — fehlte eines, würfe Fastifys `removeAdditional` es STILL weg und die HCAI-Transparenz
// (EU-AI-Act) ginge lautlos verloren.
import { Type, type Static } from "@sinclair/typebox";

/** EU-AI-Act-Einordnung; `high-risk` wird serverseitig abgelehnt (kein autonomes rechtsnahes Entscheiden). */
export const AiAssistClassSchema = Type.Union([
  Type.Literal("minimal"),
  Type.Literal("limited-risk"),
  Type.Literal("high-risk"),
]);

/** Vorschlag anfordern. Der Server ergänzt den Aufruf-Kontext (tenant/authority/actor) aus der Sitzung. */
export const AiAssistRequestSchema = Type.Object(
  {
    /** Was assistiert werden soll, z.B. "adresse-vorschlag", "vollstaendigkeits-hinweis". */
    task: Type.String({ minLength: 1 }),
    /** Strukturierter, PII-armer Kontext (synthetisch im Demo-Betrieb). */
    input: Type.Record(Type.String(), Type.Unknown()),
    /** Höchste akzeptierte Klasse — high-risk wird abgelehnt. */
    maxClass: Type.Optional(AiAssistClassSchema),
  },
  { additionalProperties: false },
);
export type AiAssistRequestDto = Static<typeof AiAssistRequestSchema>;

/** Der transparente KI-Vorschlag (HCAI): NIE eine Entscheidung. */
export const AiSuggestionDtoSchema = Type.Object(
  {
    /** Der Vorschlagswert — der Aufrufer castet ihn fachlich; NIE bindend. */
    value: Type.Unknown(),
    /** 0..1 Konfidenz (oft NICHT modell-kalibriert — siehe `rationale`). */
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    /** Welches Modell den Vorschlag erzeugt hat (OSS-first, z.B. "ollama:qwen3"). */
    modelId: Type.String({ minLength: 1 }),
    /** Warum — für die „Warum"-Affordance der Progressive Disclosure. */
    rationale: Type.String({ minLength: 1 }),
    /** Quellen/Provenienz. */
    sources: Type.Array(Type.String()),
    /** Pflicht-Transparenzkennung (HCAI). */
    marking: Type.Literal("ki-vorschlag"),
    /** EU-AI-Act-Einordnung — Assistenz ist limited-risk. */
    euAiActClass: AiAssistClassSchema,
    /** IMMER true: die rechtsnahe Entscheidung bleibt menschlich (serverseitig erzwungen). */
    reviewRequired: Type.Literal(true),
  },
  { additionalProperties: false },
);
export type AiSuggestionDto = Static<typeof AiSuggestionDtoSchema>;
