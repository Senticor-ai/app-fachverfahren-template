// POST /api/payment + GET /api/payment/:paymentId — die BFF-Naht auf den PaymentPort (Zahlung/Gebühr, ePayBL).
// Der Handler baut den Aufruf-Kontext AUSSCHLIESSLICH aus der Sitzung (kein Actor/keine Behörde aus dem Body),
// reicht den fachlichen Betrag/Zweck/die Referenz an den (per Env gewählten, austauschbaren) Port und mappt ein
// `capabilityFailure` EHRLICH auf HTTP: retryable → 503, sonst 502 (der Anbieter lehnte ab). Kein Status wird
// fingiert; jede Veranlassung ist auditpflichtig (Kassen-Nachvollzug). Bürger:innen zahlen die EIGENE Gebühr.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  PaymentCreateRequestSchema,
  PaymentStatusDtoSchema,
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

const PaymentIdParamsSchema = Type.Object(
  { paymentId: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

/** Retryable-Fehler → 503 (später erneut versuchbar), sonst 502 (der Zahlungsanbieter lehnte ab).
 *  Literal-Rückgabe (nicht number), damit sie zur getypten reply.code()-Statusunion passt. */
const failStatus = (retryable: boolean): 502 | 503 => (retryable ? 503 : 502);

export function registerPaymentRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.paymentInitiate.permission },
    deps,
  );

  typed.post(
    "/api/payment",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["payment"],
        summary: "Zahlung/Gebühr für einen eigenen Vorgang veranlassen (ePayBL-Naht)",
        body: PaymentCreateRequestSchema,
        response: {
          200: PaymentStatusDtoSchema,
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
      // Der Kontext + der Schuldner kommen VOLLSTÄNDIG aus der Sitzung — nie aus dem Body.
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "citizen" },
        purpose: "payment",
      };
      const result = await deps.payment.createPayment(context, {
        amountMinor: request.body.amountMinor,
        currency: "EUR",
        purpose: request.body.purpose,
        reference: request.body.reference,
        debtor: { actorId: session.actorId, actorType: "citizen" },
        ...(request.body.returnUrl !== undefined
          ? { returnUrl: request.body.returnUrl }
          : {}),
      });
      if (!result.ok) {
        return sendPortFailure(reply, deps, request, result.error, failStatus(result.error.retryable), "payment.failed");
      }
      // Zahlungs-Veranlassung ist auditpflichtig (Kassen-Nachvollzug): Referenz + Status, kein PII.
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "payment.initiated",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `Zahlung veranlasst (${result.value.status}) für Referenz '${request.body.reference}'`,
          resource: { type: "payment", id: result.value.paymentId },
        }),
      });
      return reply.code(200).send(result.value);
    },
  );

  typed.get(
    "/api/payment/:paymentId",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["payment"],
        summary: "Status einer eigenen Zahlung/Gebühr abfragen",
        params: PaymentIdParamsSchema,
        response: {
          200: PaymentStatusDtoSchema,
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
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "citizen" },
        purpose: "payment",
      };
      const result = await deps.payment.getPaymentStatus(
        context,
        request.params.paymentId,
      );
      if (!result.ok) {
        return sendPortFailure(reply, deps, request, result.error, failStatus(result.error.retryable), "payment.failed");
      }
      return reply.code(200).send(result.value);
    },
  );
}
