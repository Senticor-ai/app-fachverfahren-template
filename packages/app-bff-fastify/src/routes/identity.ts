// GET /api/identity + POST /api/identity/assurance — die BFF-Naht auf den IdentityAndTrustPort (BundID/
// DeutschlandID/eIDAS). Beide sind SITZUNGS-eigen: das angemeldete Subjekt liest seine EIGENE Identität und
// verlangt (Step-up) ein Mindest-Vertrauensniveau. Der Kontext kommt VOLLSTÄNDIG aus der Sitzung (kein Subjekt
// aus dem Body erschleichbar). Ein `capabilityFailure` wird EHRLICH gemappt (retryable → 503, sonst 502);
// kein Profil/keine Assurance wird fingiert. Infra-Familie (surfaces:null) → in JEDER Zone, RBAC session.read.
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  IdentityProfileDtoSchema,
  AssuranceRequestSchema,
  AssuranceResultDtoSchema,
  ErrorEnvelopeSchema,
} from "@senticor/app-bff-contracts";
import type { PortCallContext } from "@senticor/platform-contracts";
import { builtInPermissions } from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";

/** Retryable-Fehler → 503, sonst 502 (der Identitäts-Anbieter lehnte ab). Literal für die getypte reply.code(). */
const failStatus = (retryable: boolean): 502 | 503 => (retryable ? 503 : 502);

/** Der Aufruf-Kontext VOLLSTÄNDIG aus der Sitzung — der Akteurstyp aus den Rollen (Bürger:in vs. Beschäftigte). */
function contextOf(request: FastifyRequest): PortCallContext {
  const session = sessionOf(request);
  return {
    requestId: requestIdOf(request),
    tenantId: session.tenantId,
    authorityId: session.authorityId,
    jurisdictionId: session.jurisdictionId,
    actor: {
      actorId: session.actorId,
      actorType: (session.rbacRoles ?? []).includes("citizen")
        ? "citizen"
        : "employee",
    },
    purpose: "identity",
  };
}

export function registerIdentityRoutes(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.sessionRead.permission },
    deps,
  );

  typed.get(
    "/api/identity",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["identity"],
        summary: "Die eigene (angemeldete) Identität lesen (BundID/eID-Naht)",
        response: {
          200: IdentityProfileDtoSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await deps.identityAndTrust.getCurrentIdentity(
        contextOf(request),
      );
      if (!result.ok) {
        return reply
          .code(failStatus(result.error.retryable))
          .send({ error: result.error.message, requestId: requestIdOf(request) });
      }
      return reply.code(200).send(result.value);
    },
  );

  typed.post(
    "/api/identity/assurance",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["identity"],
        summary: "Ein Mindest-Vertrauensniveau (eIDAS) verlangen (Step-up)",
        body: AssuranceRequestSchema,
        response: {
          200: AssuranceResultDtoSchema,
          400: ErrorEnvelopeSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          502: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await deps.identityAndTrust.requireAssurance(
        contextOf(request),
        request.body.minimumAssuranceLevel,
      );
      if (!result.ok) {
        return reply
          .code(failStatus(result.error.retryable))
          .send({ error: result.error.message, requestId: requestIdOf(request) });
      }
      return reply.code(200).send(result.value);
    },
  );
}
