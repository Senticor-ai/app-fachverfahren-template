// cases — DTOs für GET/POST /api/cases (Fall/Dossier-Verwaltung). Mandant/Behörde/Jurisdiktion kommen IMMER aus
// der Sitzung, NIE aus Body/Query (additionalProperties: false); die Fall-DTO exponiert die Server-Topologie
// (tenantId/authorityId/jurisdictionId) bewusst NICHT. Der Zustand ist ein freier String (verfahrensdefiniert via
// ProcedureVersion), keine im Contract festgeschriebene Enum — das Verfahren ist DATEN.
import { Type, type Static } from "@sinclair/typebox";

export const CaseDtoSchema = Type.Object(
  {
    caseId: Type.String({ minLength: 1 }),
    procedureId: Type.String({ minLength: 1 }),
    procedureVersion: Type.String({ minLength: 1 }),
    state: Type.String({ minLength: 1 }),
    version: Type.Integer({ minimum: 1 }),
    subjectIds: Type.Array(Type.String({ minLength: 1 })),
    openedAt: Type.String({ minLength: 1 }),
    closedAt: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export type CaseDto = Static<typeof CaseDtoSchema>;

export const CaseListQuerySchema = Type.Object(
  {
    state: Type.Optional(Type.String({ minLength: 1 })),
    procedureId: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);

export type CaseListQueryDto = Static<typeof CaseListQuerySchema>;

export const CaseListDtoSchema = Type.Object(
  { cases: Type.Array(CaseDtoSchema) },
  { additionalProperties: false },
);

export type CaseListDto = Static<typeof CaseListDtoSchema>;

export const CaseCreateRequestSchema = Type.Object(
  {
    procedureId: Type.String({ minLength: 1 }),
    procedureVersion: Type.String({ minLength: 1 }),
    // Initialzustand des Falls (aus dem Verfahren). Der Server generiert caseId/version=1/openedAt.
    state: Type.String({ minLength: 1 }),
    subjectIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);

export type CaseCreateRequestDto = Static<typeof CaseCreateRequestSchema>;

export const CaseIdParamsSchema = Type.Object(
  { id: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export type CaseIdParamsDto = Static<typeof CaseIdParamsSchema>;

// Zustandswechsel eines Falls: `action` wählt den Übergang (from=aktueller Zustand) aus der ProcedureVersion,
// `expectedVersion` erzwingt Optimistic-Locking. Der Zielzustand + die Rechtsgrundlage werden NIE aus dem Body
// gelesen — sie stammen aus dem Verfahren (DATEN). `detail` ist ein optionaler fachlicher Vermerk fürs Audit.
export const CaseTransitionRequestSchema = Type.Object(
  {
    action: Type.String({ minLength: 1 }),
    expectedVersion: Type.Integer({ minimum: 1 }),
    detail: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type CaseTransitionRequestDto = Static<
  typeof CaseTransitionRequestSchema
>;
