// mailbox — DTOs für GET/POST /api/mailbox. scope=own|authority wählt die Permission
// (mailbox.own.* vs. mailbox.authority.*) und die Store-Query (owner/authority).
// Mandant/Behörde/Actor kommen IMMER aus der Sitzung, NIE aus Body oder Query
// (additionalProperties: false — Fastifys Ajv strippt unbekannte Felder, Value.Check
// weist sie ab); die Message-DTO exponiert die Server-Topologie
// (tenantId/authorityId/jurisdictionId) bewusst nicht.
import { Type, type Static } from "@sinclair/typebox";

export const MailboxBoxSchema = Type.Union([
  Type.Literal("inbox"),
  Type.Literal("outbox"),
]);

export const MailboxScopeSchema = Type.Union([
  Type.Literal("own"),
  Type.Literal("authority"),
]);

export const MailboxMessageStatusSchema = Type.Union([
  Type.Literal("unread"),
  Type.Literal("read"),
  Type.Literal("sent"),
  Type.Literal("archived"),
]);

export const MailboxListQuerySchema = Type.Object(
  {
    box: MailboxBoxSchema,
    scope: Type.Optional(MailboxScopeSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
  },
  { additionalProperties: false },
);

export type MailboxListQueryDto = Static<typeof MailboxListQuerySchema>;

export const MailboxCreateRequestSchema = Type.Object(
  {
    box: MailboxBoxSchema,
    scope: Type.Optional(MailboxScopeSchema),
    subject: Type.String({ minLength: 1, maxLength: 500 }),
    bodyPreview: Type.String({ maxLength: 2000 }),
    caseId: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
  },
  { additionalProperties: false },
);

export type MailboxCreateRequestDto = Static<typeof MailboxCreateRequestSchema>;

export const MailboxMessageDtoSchema = Type.Object(
  {
    messageId: Type.String({ minLength: 1 }),
    box: MailboxBoxSchema,
    scope: MailboxScopeSchema,
    ownerActorId: Type.String({ minLength: 1 }),
    caseId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    subject: Type.String(),
    bodyPreview: Type.String(),
    status: MailboxMessageStatusSchema,
    createdAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type MailboxMessageDto = Static<typeof MailboxMessageDtoSchema>;

export const MailboxListDtoSchema = Type.Object(
  {
    messages: Type.Array(MailboxMessageDtoSchema),
  },
  { additionalProperties: false },
);

export type MailboxListDto = Static<typeof MailboxListDtoSchema>;
