import type { AuditStore, AuthStore } from "@senticor/app-store-postgres";
import type { FastifyInstance } from "fastify";
import "../auth/principal.js";
import { routeAuth } from "../auth/authorization.js";

export interface AuditRouteDeps {
  authStore: AuthStore;
  auditStore: AuditStore;
}

const MAX_LIMIT = 500;

/** Lesender Zugriff auf den Audit-Trail (Permission `audit.read`, heute = Admin).
 *  Tenant-scoped, neueste zuerst — die MVP-Sicht für Nachvollziehbarkeit/Evidenz. */
export function registerAuditRoutes(
  app: FastifyInstance,
  deps: AuditRouteDeps,
): void {
  app.get<{ Querystring: { limit?: string } }>(
    "/api/v1/audit-events",
    routeAuth({ kind: "permission", action: "audit.read" }, deps),
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      const parsedLimit = Number(request.query?.limit ?? "100");
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(Math.floor(parsedLimit), MAX_LIMIT)
          : 100;
      const events = await deps.auditStore.listEvents({
        tenantId: principal.tenantId,
        limit,
      });
      return reply.send(events);
    },
  );
}
