// @senticor/app-bff-contracts — die EINE Quelle der BFF-Wire-Verträge: TypeBox-Schemas
// (Validation + Static-Typen), Fehler-Envelope und OpenAPI-Metadaten. Bewusst ohne
// Fastify-Abhängigkeit — Server (app-bff-fastify) und künftige Clients teilen dieselben
// Formen.
export { ErrorEnvelopeSchema, type ErrorEnvelope } from "./error.js";
export {
  CapabilitiesDtoSchema,
  SessionDtoSchema,
  type CapabilitiesDto,
  type SessionDto,
} from "./session.js";
export {
  AccessibilityPreferencesSchema,
  ColorSchemeSchema,
  NavigationPreferencesSchema,
  UserPreferencesDtoSchema,
  UserPreferencesUpdateSchema,
  type UserPreferencesDto,
  type UserPreferencesUpdateDto,
} from "./preferences.js";
export {
  MailboxBoxSchema,
  MailboxCreateRequestSchema,
  MailboxListDtoSchema,
  MailboxListQuerySchema,
  MailboxMessageDtoSchema,
  MailboxMessageStatusSchema,
  MailboxScopeSchema,
  type MailboxCreateRequestDto,
  type MailboxListDto,
  type MailboxListQueryDto,
  type MailboxMessageDto,
} from "./mailbox.js";
export {
  CaseCreateRequestSchema,
  CaseDtoSchema,
  CaseIdParamsSchema,
  CaseListDtoSchema,
  CaseListQuerySchema,
  type CaseCreateRequestDto,
  type CaseDto,
  type CaseIdParamsDto,
  type CaseListDto,
  type CaseListQueryDto,
} from "./cases.js";
export { openApiInfo, openApiTags } from "./openapi.js";
