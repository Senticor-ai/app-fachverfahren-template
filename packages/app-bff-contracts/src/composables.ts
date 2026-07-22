// composables — DTOs für GET /api/composables (Agentic Composables, CHOS Blueprint v5.0). Read-only
// Discovery-Naht: Lesen ist Data Plane und braucht keinen Token (Blueprint §15). Die Enum-Werte (klasse/
// status/assurance/autonomy/aufgabe) sind als String transportiert; der Server validiert sie autoritativ
// über assertComposable (public-sector-sdk).
import { Type, type Static } from "@sinclair/typebox";

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
