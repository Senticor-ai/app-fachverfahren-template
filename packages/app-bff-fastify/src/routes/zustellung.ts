// POST /api/zustellung + GET /api/zustellung/:deliveryId — die BFF-Naht auf den MailboxPort (Bescheid-Zustellung,
// De-Mail/eBO). Die Zustellung ist hoheitliche Außenwirkung (VwZG · Zustellfiktion): die Sachbearbeitung stellt
// einen Bescheid zu. Der Kontext kommt VOLLSTÄNDIG aus der Sitzung; ein `capabilityFailure` wird EHRLICH gemappt
// (retryable → 503, sonst 502). Jede Zustellung ist auditpflichtig (Zustellnachweis). Bewusst GETRENNT vom
// appStore-Postfach (`routes/mailbox.ts`): das ist das interne Nachrichtenfach, DIES ist der externe Versand.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  BescheidVersandRequestSchema,
  ZustellQuittungDtoSchema,
  ZustellStatusDtoSchema,
  ErrorEnvelopeSchema,
} from "@senticor/app-bff-contracts";
import type { PortCallContext } from "@senticor/platform-contracts";
import {
  builtInPermissions,
  createAppDataAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { sendPortFailure } from "../port-route-safety.js";

const DeliveryIdParamsSchema = Type.Object(
  { deliveryId: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

/** Retryable-Fehler → 503, sonst 502 (das Zustell-Gateway lehnte ab). Literal für die getypte reply.code(). */
const failStatus = (retryable: boolean): 502 | 503 => (retryable ? 503 : 502);

/** Der Aufruf-Kontext VOLLSTÄNDIG aus der Sitzung — die Zustellung ist eine behördliche (employee) Handlung. */
function contextOf(request: FastifyRequest): PortCallContext {
  const session = sessionOf(request);
  return {
    requestId: requestIdOf(request),
    tenantId: session.tenantId,
    authorityId: session.authorityId,
    jurisdictionId: session.jurisdictionId,
    actor: { actorId: session.actorId, actorType: "employee" },
    purpose: "bescheid-zustellung",
  };
}

export function registerZustellungRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.bescheidVersand.permission },
    deps,
  );

  typed.post(
    "/api/zustellung",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["zustellung"],
        summary: "Einen Bescheid rechtssicher zustellen (De-Mail/eBO-Naht)",
        body: BescheidVersandRequestSchema,
        response: {
          200: ZustellQuittungDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const result = await deps.mailbox.sendMessage(contextOf(request), {
        messageId: request.body.messageId,
        recipientId: request.body.recipientId,
        subject: request.body.subject,
        bodyText: request.body.bodyText,
        attachments: request.body.attachments ?? [],
      });
      if (!result.ok) {
        return sendPortFailure(reply, deps, request, result.error, failStatus(result.error.retryable), "zustellung.failed");
      }
      // Zustellung ist auditpflichtig (Zustellnachweis): Referenz + Zustell-Id, kein Bescheid-Inhalt.
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "bescheid.zugestellt",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Bescheid zugestellt (${result.value.deliveryId}) für Referenz '${request.body.messageId}'`,
          resource: { type: "zustellung", id: result.value.deliveryId },
        }),
      });
      return reply.code(200).send(result.value);
    },
  );

  typed.get(
    "/api/zustellung/:deliveryId",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["zustellung"],
        summary: "Den Zustellstatus (Zustellnachweis) eines Bescheids abfragen",
        params: DeliveryIdParamsSchema,
        response: {
          200: ZustellStatusDtoSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await deps.mailbox.getDeliveryStatus(
        contextOf(request),
        request.params.deliveryId,
      );
      if (!result.ok) {
        return sendPortFailure(reply, deps, request, result.error, failStatus(result.error.retryable), "zustellung.failed");
      }
      return reply.code(200).send(result.value);
    },
  );
}
