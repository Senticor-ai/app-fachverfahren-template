// composables — DTOs für GET /api/composables (Agentic Composables, CHOS Blueprint v5.0). Read-only
// Discovery-Naht: Lesen ist Data Plane und braucht keinen Token (Blueprint §15). Die Enum-Werte (klasse/
// status/assurance/autonomy/aufgabe) sind als String transportiert; der Server validiert sie autoritativ
// über assertComposable (public-sector-sdk).
import { Type, type Static } from "@sinclair/typebox";
import { AiSuggestionDtoSchema } from "./ai-assist.js";

/** Der Spine-Agent in der DTO — Rolle, Autonomie (AAL), Aufgaben-Achse, geerdet auf Skills + Knowledge. */
export const SpineAgentDtoSchema = Type.Object(
  {
    role: Type.String({ minLength: 1 }),
    autonomy: Type.String({ minLength: 1 }),
    aufgaben: Type.Array(Type.String({ minLength: 1 })),
    skills: Type.Array(Type.String({ minLength: 1 })),
    knowledgeDomains: Type.Array(Type.String({ minLength: 1 })),
    /** Fasst der Spine eine rechtsnahe (HITL-pflichtige) Aufgabe an? (server-abgeleitet) */
    rechtsnah: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type SpineAgentDto = Static<typeof SpineAgentDtoSchema>;

/** Kurzfassung eines Composables für die Liste (Discovery). */
export const ComposableSummaryDtoSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    displayName: Type.String({ minLength: 1 }),
    klasse: Type.String({ minLength: 1 }),
    status: Type.String({ minLength: 1 }),
    assurance: Type.String({ minLength: 1 }),
    /** enabled = certified/active (produktiv nutzbar). */
    enabled: Type.Boolean(),
    hasSpine: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type ComposableSummaryDto = Static<typeof ComposableSummaryDtoSchema>;

export const ComposableListDtoSchema = Type.Object(
  { composables: Type.Array(ComposableSummaryDtoSchema) },
  { additionalProperties: false },
);
export type ComposableListDto = Static<typeof ComposableListDtoSchema>;

/** Volldetail eines Composables inkl. Zertifizierungsreife (nennt fehlende Ebenen). */
export const ComposableDetailDtoSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    displayName: Type.String({ minLength: 1 }),
    klasse: Type.String({ minLength: 1 }),
    status: Type.String({ minLength: 1 }),
    assurance: Type.String({ minLength: 1 }),
    enabled: Type.Boolean(),
    outcome: Type.Object(
      {
        fuerWen: Type.String(),
        ergebnis: Type.String(),
        messung: Type.String(),
        nichtScope: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    owners: Type.Record(Type.String(), Type.String()),
    moduleId: Type.Optional(Type.String({ minLength: 1 })),
    spine: Type.Optional(SpineAgentDtoSchema),
    evals: Type.Array(Type.String()),
    replaceableBy: Type.Array(Type.String()),
    /** Zertifizierungsreife (Blueprint §19): certifiable + konkret fehlende Ebenen. */
    certification: Type.Object(
      {
        certifiable: Type.Boolean(),
        fehlend: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ComposableDetailDto = Static<typeof ComposableDetailDtoSchema>;

// SPINE-RUN (Nutzer-Mandat): eine Aufgabe des Spine-Agenten ausführen — von Assistenz bis Prüfung/Subsumtion/
// Review/Strukturierung. Läuft über den AiAssistPort (AAL-2 „Advise"): das Ergebnis ist IMMER ein Vorschlag
// mit reviewRequired=true — nie eine Entscheidung. Die KI ist nie eines der zwei Augen.
export const ComposableSpineParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    /** Die Spine-Aufgabe: assistenz|strukturierung|pruefung|subsumtion|review (server-validiert). */
    aufgabe: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type ComposableSpineParamsDto = Static<
  typeof ComposableSpineParamsSchema
>;

export const SpineRunRequestSchema = Type.Object(
  {
    /** Strukturierter, PII-armer Kontext für den Vorschlag (synthetisch im Demo-Betrieb). */
    input: Type.Record(Type.String(), Type.Unknown()),
    /** Optionaler Fallbezug (nur Referenz fürs Audit — der Kontext kommt aus der Sitzung). */
    caseId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type SpineRunRequestDto = Static<typeof SpineRunRequestSchema>;

export const SpineRunResultDtoSchema = Type.Object(
  {
    composableId: Type.String({ minLength: 1 }),
    aufgabe: Type.String({ minLength: 1 }),
    /** Ist die Aufgabe rechtsnah (HITL-pflichtig)? Dann bleibt die Entscheidung zwingend menschlich. */
    rechtsnah: Type.Boolean(),
    autonomy: Type.String({ minLength: 1 }),
    /** Der KI-Vorschlag — NIE eine Entscheidung (reviewRequired immer true). */
    suggestion: AiSuggestionDtoSchema,
  },
  { additionalProperties: false },
);
export type SpineRunResultDto = Static<typeof SpineRunResultDtoSchema>;
