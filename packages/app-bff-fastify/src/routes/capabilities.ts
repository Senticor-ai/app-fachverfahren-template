// GET /api/capabilities — Rollen + fail-closed aufgelöste SDK-RBAC-Permissions der
// Sitzung: unbekannte Rollen werden gefiltert (kein 500, nie mehr Rechte als
// registriert); der Client autorisiert seine Sichten NUR über diese Permissions.
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  CapabilitiesDtoSchema,
  ErrorEnvelopeSchema,
} from "@senticor/app-bff-contracts";
import {
  builtInPermissions,
  resolvePermissionsForRoles,
} from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, knownRoles, sessionOf } from "../route-auth.js";

export function registerCapabilitiesRoute(
  app: FastifyInstance,
  deps: BffDeps,
): void {
  const auth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.sessionRead.permission },
    deps,
  );
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    "/api/capabilities",
    {
      config: auth.config,
      preHandler: auth.preHandler,
      schema: {
        tags: ["session"],
        summary: "Aufgelöste Berechtigungen der Sitzung lesen",
        response: {
          200: CapabilitiesDtoSchema,
          401: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const roles = knownRoles(session.rbacRoles, deps.rbacRegistry);
      return reply.send({
        rbacRoles: [...session.rbacRoles],
        permissions: resolvePermissionsForRoles(roles, deps.rbacRegistry),
      });
    },
  );
}
