// GET /api/session — die SDK-RBAC-Sicht der aufgelösten Sitzung. Abgrenzung:
// /auth/session (App) bleibt die Workspace-Sicht mit Workspace-Permissions/Personas.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  ErrorEnvelopeSchema,
  SessionDtoSchema,
} from "@senticor/app-bff-contracts";
import { builtInPermissions } from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, sessionOf } from "../route-auth.js";

export function registerSessionRoute(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.sessionRead.permission },
    deps,
  );
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    "/api/session",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["session"],
        summary: "Aufgelöste Sitzung (SDK-RBAC-Sicht) lesen",
        response: {
          200: SessionDtoSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      return reply.send({
        actorId: session.actorId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        rbacRoles: [...session.rbacRoles],
      });
    },
  );
}
