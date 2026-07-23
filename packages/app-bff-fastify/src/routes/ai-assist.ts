// POST /api/ai/assist — die BFF-Naht auf den AiAssistPort. Die KI ist ASSISTIV: sie schlägt vor,
// entscheidet nie. Der Handler baut den Aufruf-Kontext AUSSCHLIESSLICH aus der Sitzung (kein
// tenant/actor aus dem Body), reicht Aufgabe/Kontext an den (per Env gewählten, austauschbaren) Port
// und mappt ein `capabilityFailure` EHRLICH auf HTTP: high-risk-Ablehnung → 422, kein Modell → 503.
// Kein Vorschlag wird fingiert; jeder Vorschlag trägt reviewRequired=true (serverseitig).
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  AiAssistRequestSchema,
  AiSuggestionDtoSchema,
  ErrorEnvelopeSchema,
} from "@senticor/app-bff-contracts";
import type { PortCallContext } from "@senticor/platform-contracts";
import {
  builtInPermissions,
  createAppDataAuditEvent,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";

export function registerAiAssistRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.aiAssist.permission },
    deps,
  );
  typed.post(
    "/api/ai/assist",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["ai-assist"],
        summary: "KI-Assistenz anfordern (assistiv, HCAI — nie eine Entscheidung)",
        body: AiAssistRequestSchema,
        response: {
          200: AiSuggestionDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          422: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      // Der Kontext kommt VOLLSTÄNDIG aus der Sitzung — nie aus dem Body (Actor/Behörde nicht erschleichbar).
      const context: PortCallContext = {
        requestId: requestIdOf(request),
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        actor: { actorId: session.actorId, actorType: "employee" },
        purpose: "ai-assist",
      };
      const result = await deps.aiAssist.suggest(context, {
        task: request.body.task,
        input: request.body.input,
        ...(request.body.maxClass !== undefined
          ? { maxClass: request.body.maxClass }
          : {}),
      });

      if (!result.ok) {
        // EHRLICHES Mapping: die KI lehnt eine high-risk-Autonomie ab (422), oder kein Modell ist
        // erreichbar (503) — kein fingierter Vorschlag, kein 200 mit erfundenem Inhalt.
        const status =
          result.error.code === "ai-assist/high-risk-refused" ? 422 : 503;
        return reply
          .code(status)
          .send({ error: result.error.message, requestId: requestIdOf(request) });
      }

      // KI-Nutzung ist auditpflichtig (Nachvollziehbarkeit): der Vorschlag ist erzeugt, Modell + Aufgabe
      // stehen im Audit — der Vorschlag selbst (potenziell PII) NICHT.
      await deps.auditSink.emit({
        kind: "app-data",
        event: createAppDataAuditEvent({
          eventType: "ai.suggestion.created",
          actorId: session.actorId,
          tenantId: session.tenantId,
          requestId: requestIdOf(request),
          summary: `KI-Vorschlag erzeugt (${result.value.modelId}) für Aufgabe '${request.body.task}'`,
          resource: { type: "ai-suggestion", id: result.value.modelId },
        }),
      });
      return reply.code(200).send(result.value);
    },
  );
}
