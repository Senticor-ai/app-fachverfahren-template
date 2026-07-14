import type { AuthStore } from "@senticor/app-store-postgres";
import type { FastifyReply, FastifyRequest } from "fastify";
import "./principal.js";
import { hashSessionToken } from "./session-token.js";
import { SESSION_COOKIE_NAME } from "./constants.js";

/**
 * Resolves the acting principal from the session cookie (kanban plan
 * decision 5, "requirePrincipal" — not "requireSession", since a
 * bearer-token-authenticated request has no browser session). Every
 * mutating and read route that needs an authenticated actor uses this as
 * its preHandler.
 */
export function createRequirePrincipal(authStore: AuthStore) {
  return async function requirePrincipal(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) {
      await reply.code(401).send({ error: "authentication required" });
      return;
    }

    const session = await authStore.getActiveSessionByHash(
      hashSessionToken(token),
    );
    if (!session) {
      await reply.code(401).send({ error: "authentication required" });
      return;
    }

    request.principal = {
      actorId: session.actorId,
      tenantId: session.tenantId,
      authorityId: session.authorityId,
      jurisdictionId: session.jurisdictionId,
    };
  };
}
