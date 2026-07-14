// GET/POST /api/mailbox — Postfach mit scope-Split: own (Bürger-Postfach des
// Sitzungs-Actors) vs. authority (behördliches Postfach der Sitzungs-Behörde).
// Lese- UND Schreibrechte sind je scope getrennt (rbac-scoped Policy); der Server
// generiert messageId/createdAt/status (outbox→sent, inbox→unread), der Kontext
// (tenant/authority/jurisdiction/owner) kommt AUSSCHLIESSLICH aus der Sitzung.
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ErrorEnvelopeSchema,
  MailboxCreateRequestSchema,
  MailboxListDtoSchema,
  MailboxListQuerySchema,
  MailboxMessageDtoSchema,
  type MailboxMessageDto,
} from "@senticor/app-bff-contracts";
import type { MailboxMessage } from "@senticor/app-store-postgres";
import {
  builtInPermissions,
  createAppDataAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import {
  bffRouteAuth,
  requestIdOf,
  scopeOf,
  sessionOf,
} from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

/** scope (Wire-Vokabular) ↔ audience (Store-Vokabular): own=citizen, authority=caseworker. */
function audienceOf(scope: "own" | "authority"): "citizen" | "caseworker" {
  return scope === "authority" ? "caseworker" : "citizen";
}

function toMailboxMessageDto(message: MailboxMessage): MailboxMessageDto {
  return {
    messageId: message.messageId,
    box: message.box,
    scope: message.audience === "caseworker" ? "authority" : "own",
    ownerActorId: message.ownerActorId,
    caseId: message.caseId,
    subject: message.subject,
    bodyPreview: message.bodyPreview,
    status: message.status,
    createdAt: message.createdAt,
  };
}

export function registerMailboxRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const readAuth = bffRouteAuth(
    {
      kind: "rbac-scoped",
      permissions: {
        own: builtInPermissions.mailboxOwnRead.permission,
        authority: builtInPermissions.mailboxAuthorityRead.permission,
      },
    },
    deps,
  );
  typed.get(
    "/api/mailbox",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["mailbox"],
        summary: "Postfach lesen (scope: own oder authority)",
        querystring: MailboxListQuerySchema,
        response: {
          200: MailboxListDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const scope = scopeOf(request);
      let messages: MailboxMessage[];
      try {
        messages = await deps.appStore.listMailboxMessages({
          box: request.query.box,
          audience: audienceOf(scope),
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          actorId: session.actorId,
          scope: scope === "authority" ? "authority" : "owner",
          ...(request.query.limit !== undefined
            ? { limit: request.query.limit }
            : {}),
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({ messages: messages.map(toMailboxMessageDto) });
    },
  );

  const writeAuth = bffRouteAuth(
    {
      kind: "rbac-scoped",
      permissions: {
        own: builtInPermissions.mailboxOwnWrite.permission,
        authority: builtInPermissions.mailboxAuthorityWrite.permission,
      },
    },
    deps,
  );
  typed.post(
    "/api/mailbox",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["mailbox"],
        summary: "Nachricht verfassen (scope: own oder authority)",
        body: MailboxCreateRequestSchema,
        response: {
          201: MailboxMessageDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const scope = scopeOf(request);
      const message: MailboxMessage = {
        messageId: `msg.${randomUUID()}`,
        box: request.body.box,
        audience: audienceOf(scope),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        ownerActorId: session.actorId,
        caseId: request.body.caseId ?? null,
        subject: request.body.subject,
        bodyPreview: request.body.bodyPreview,
        status: request.body.box === "outbox" ? "sent" : "unread",
        createdAt: new Date().toISOString(),
      };
      let saved: MailboxMessage;
      try {
        saved = await deps.appStore.saveMailboxMessage(message);
      } catch {
        return storeUnavailable(request, reply);
      }
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "mailbox.message.created",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Nachricht im Postfach verfasst (${scope}/${saved.box})`,
          resource: { type: "mailbox-message", id: saved.messageId },
        }),
      });
      return reply.code(201).send(toMailboxMessageDto(saved));
    },
  );
}
