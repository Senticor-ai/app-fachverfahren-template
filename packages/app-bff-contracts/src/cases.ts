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
    // Fachliche NUTZLAST des Falls (z. B. Antragsdaten + Berechnung eines Antrags-Verfahrens).
    // Für den Server OPAK: er interpretiert sie nicht und kann es nicht (die fachliche Config liegt
    // ausserhalb seines rootDir). Der Client rechnet, der Server bewahrt auf und auditiert.
    data: Type.Record(Type.String(), Type.Unknown()),
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
    // OPTIONALE fachliche Nutzlast beim Anlegen (Antragsdaten + Berechnung eines Antrags-Verfahrens).
    // Additiv: ein Dossier-Fall legt ohne `data` an und verhält sich unverändert.
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
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

// N-AUGEN (Issue #56): eine explizite Freigabe eines Akteurs für EINEN Übergang. Server-autoritativ: der
// Akteur kommt aus der Sitzung; `expectedVersion` bindet die Freigabe an den aktuellen Zustand (409 bei Drift).
export const CaseApprovalRequestSchema = Type.Object(
  {
    action: Type.String({ minLength: 1 }),
    expectedVersion: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export type CaseApprovalRequestDto = Static<typeof CaseApprovalRequestSchema>;

export const CaseApprovalResultDtoSchema = Type.Object(
  {
    action: Type.String({ minLength: 1 }),
    /** Wurde eine NEUE Freigabe geschrieben (false = derselbe Akteur hatte bereits freigegeben). */
    recorded: Type.Boolean(),
    /** Distinkte Freigebende dieser Entscheidung im aktuellen Zustand (inkl. letztem Bearbeiter). */
    distinctApprovers: Type.Integer({ minimum: 0 }),
    requiredApprovals: Type.Integer({ minimum: 1 }),
    /** Reicht die aktuelle Zahl bereits für den Übergang? */
    satisfied: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type CaseApprovalResultDto = Static<typeof CaseApprovalResultDtoSchema>;

// Verlauf/Audit einer Akte (append-only, chronologisch). Die Server-Topologie (tenant/authority/jurisdiction)
// wird — wie bei der Fall-DTO — bewusst NICHT exponiert. `payload` ist frei-formig (z. B. previousState/newState/
// summary/detail) → nur dort ist additionalProperties erlaubt. `actorId` ist die (pseudonyme) Akteurs-Kennung,
// `legalBasisId`/`purpose` die revisionssichere Verankerung (nie erfunden).
export const CaseAuditEventDtoSchema = Type.Object(
  {
    auditEventId: Type.String({ minLength: 1 }),
    caseId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    eventType: Type.String({ minLength: 1 }),
    actorId: Type.String({ minLength: 1 }),
    purpose: Type.String({ minLength: 1 }),
    legalBasisId: Type.String({ minLength: 1 }),
    payload: Type.Record(Type.String(), Type.Unknown()),
    occurredAt: Type.String({ minLength: 1 }),
    // Hash-Kette (Issue #53): der Client kann die Verkettung anzeigen; die server-seitige Verifikation liegt
    // im `chain`-Feld der Liste. `prevHash` null = Genesis; `entryHash` fehlt nur bei Alt-Ereignissen.
    prevHash: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    entryHash: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type CaseAuditEventDto = Static<typeof CaseAuditEventDtoSchema>;

export const CaseAuditQuerySchema = Type.Object(
  { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })) },
  { additionalProperties: false },
);

export type CaseAuditQueryDto = Static<typeof CaseAuditQuerySchema>;

/** Server-seitiger Verifikations-Report der Audit-Hash-Kette (Issue #53) — `ok:false` heißt: das Protokoll
 *  wurde nachträglich manipuliert/gekürzt (tamper-evident). `brokenAt` = auditEventId der Bruchstelle. */
export const CaseAuditChainReportSchema = Type.Object(
  {
    ok: Type.Boolean(),
    brokenAt: Type.Optional(Type.String({ minLength: 1 })),
    reason: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type CaseAuditChainReport = Static<typeof CaseAuditChainReportSchema>;

export const CaseAuditListDtoSchema = Type.Object(
  {
    events: Type.Array(CaseAuditEventDtoSchema),
    chain: CaseAuditChainReportSchema,
  },
  { additionalProperties: false },
);

export type CaseAuditListDto = Static<typeof CaseAuditListDtoSchema>;

// Eine im AKTUELLEN Zustand erlaubte Aktion (Übergang) — abgeleitet AUS dem Verfahren (ProcedureVersion.
// allowedTransitions, gefiltert auf `from === state`). Der Zielzustand + die Rechtsgrundlage stammen NIE aus
// dem Client; dieser Read sagt dem UI nur, WELCHE `action` es an `POST /transitions` senden darf.
export const CaseAllowedActionDtoSchema = Type.Object(
  {
    action: Type.String({ minLength: 1 }),
    to: Type.String({ minLength: 1 }),
    requiredPermission: Type.String({ minLength: 1 }),
    requiresFourEyes: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type CaseAllowedActionDto = Static<typeof CaseAllowedActionDtoSchema>;

// Erlaubte Aktionen eines Falls im aktuellen Zustand + `version` (für das Optimistic-Locking des Übergangs).
// Unbekanntes Verfahren → leere Liste (fail-safe: der Fall lässt sich nicht bewegen) statt eines Fehlers.
export const CaseAllowedActionsDtoSchema = Type.Object(
  {
    state: Type.String({ minLength: 1 }),
    version: Type.Integer({ minimum: 1 }),
    actions: Type.Array(CaseAllowedActionDtoSchema),
  },
  { additionalProperties: false },
);

export type CaseAllowedActionsDto = Static<typeof CaseAllowedActionsDtoSchema>;

// Ein registriertes Verfahren in Kurzform — genug, damit ein Anlege-Formular es zur Wahl anbietet
// (procedureId/version + die Zustände, aus denen der Startzustand einer neuen Akte kommt). KEINE Übergänge/
// Rechtsgrundlagen hier (die holt die Akte später über ihre ProcedureVersion server-seitig).
export const ProcedureSummaryDtoSchema = Type.Object(
  {
    procedureId: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    allowedStates: Type.Array(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export type ProcedureSummaryDto = Static<typeof ProcedureSummaryDtoSchema>;

export const ProcedureListDtoSchema = Type.Object(
  { procedures: Type.Array(ProcedureSummaryDtoSchema) },
  { additionalProperties: false },
);

export type ProcedureListDto = Static<typeof ProcedureListDtoSchema>;
