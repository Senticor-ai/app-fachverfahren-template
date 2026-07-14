// session-resolver — bindet die BFF-Session-Naht (@senticor/app-runtime-fastify) an den
// ECHTEN Auth-Flow der App: Session-Cookie → AuthStore-Session → Konto (live pro Request,
// wie die Workspace-Pipeline — Entzug wirkt auf den nächsten Request) → SDK-RBAC-Rollen.
// Deny-by-default: jede Lücke in der Kette liefert null (→ 401 in den BFF-Routen).
import type {
  ResolvedSession,
  SessionResolver,
} from "@senticor/app-runtime-fastify";
import type { AuthStore, UserRole } from "@senticor/app-store-postgres";
import type { FastifyRequest } from "fastify";
import { SESSION_COOKIE_NAME } from "./constants.js";
import { hashSessionToken } from "./session-token.js";

/** Workspace-Rolle → SDK-RBAC-Rollen (dokumentiert in docs/reference/rbac.md):
 *  citizen → citizen (Bürger-Postfach/Einstellungen); member/admin → caseworker
 *  (behördliches Postfach, Vorgangsbearbeitung). Feinere fachliche Rollen entstehen
 *  später über die app_rbac_*-Tabellen — dieses Mapping ist die V1-Brücke. */
const WORKSPACE_TO_RBAC_ROLES: Record<UserRole, readonly string[]> = {
  admin: ["caseworker"],
  member: ["caseworker"],
  citizen: ["citizen"],
};

export function createCookieSessionResolver(
  authStore: AuthStore,
): SessionResolver {
  return {
    async resolve(request: FastifyRequest): Promise<ResolvedSession | null> {
      const token = request.cookies?.[SESSION_COOKIE_NAME];
      if (!token) return null;
      const session = await authStore.getActiveSessionByHash(
        hashSessionToken(token),
      );
      if (!session) return null;
      const user = await authStore.getUserById({
        tenantId: session.tenantId,
        actorId: session.actorId,
      });
      if (!user || user.status !== "active") return null;
      return {
        actorId: session.actorId,
        tenantId: session.tenantId,
        authorityId: session.authorityId,
        jurisdictionId: session.jurisdictionId,
        rbacRoles: WORKSPACE_TO_RBAC_ROLES[user.role],
      };
    },
  };
}
