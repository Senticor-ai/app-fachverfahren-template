// authorization — DIE eine Autorisierungs-Pipeline (K7): Routen deklarieren ihre Policy als
// Route-Config (routeAuth), daraus werden preHandler ABGELEITET — Deklaration, Durchsetzung
// und Klassifizierungs-Test (route-authorization.test.ts) teilen dieselbe Quelle. Eine
// /auth-/api-Route ohne Policy bricht den Server-Start (registerAuthPolicyGuard).
//
// Personas sind hier bewusst KEIN Kriterium: sie steuern Produkt-Erlebnis/Navigation,
// nie Autorisierung. Künftige Fach-APIs nutzen die Resource-Variante (Ownership/Zuweisung).
import type { AuthStore } from "@senticor/app-store-postgres";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";
import { createRequirePrincipal } from "./require-principal.js";
import {
  hasWorkspacePermission,
  type WorkspacePermission,
} from "./workspace-permissions.js";

/** Klassifizierung einer Route. `public` authentifiziert selbst oder ist frei;
 *  `bootstrap-token`/`registration-policy` prüfen ihr Gate im Handler (Body-Token bzw.
 *  Registration-Modus); `authenticated` = NUR eigenes Konto (Allowlist im Test);
 *  `permission` = Workspace-Permission; `resource` = reserviert für Fach-APIs. */
export type RouteAuthPolicy =
  | { kind: "public" }
  | { kind: "bootstrap-token" }
  | { kind: "registration-policy" }
  | { kind: "authenticated" }
  | { kind: "permission"; action: WorkspacePermission }
  | { kind: "resource"; action: "application.read" };

export type AuthorizationRequest =
  | { action: WorkspacePermission }
  | {
      action: "application.read";
      resource: {
        tenantId: string;
        ownerActorId?: string;
        assignedActorIds?: string[];
      };
    };

/** Audit-/log-fähige Entscheidung: WARUM wurde erlaubt/verweigert, welche Policy griff. */
export interface AuthorizationDecision {
  allowed: boolean;
  reason:
    | "permission_granted"
    | "permission_missing"
    | "account_missing"
    | "account_inactive"
    | "policy_not_implemented";
  policyId: string;
}

export interface AuthorizationService {
  authorize(
    principal: { tenantId: string; actorId: string },
    request: AuthorizationRequest,
  ): Promise<AuthorizationDecision>;
}

/** Lädt das Konto LIVE pro Entscheidung — Entzug von Rechten/Deaktivierung wirkt auf den
 *  NÄCHSTEN Request, ohne Session-Schema-Änderung (principalVersion macht das explizit). */
export function createAuthorizationService(
  authStore: AuthStore,
): AuthorizationService {
  return {
    async authorize(principal, request) {
      const policyId =
        "resource" in request
          ? `resource:${request.action}`
          : `workspace-permission:${request.action}`;
      const user = await authStore.getUserById({
        tenantId: principal.tenantId,
        actorId: principal.actorId,
      });
      if (!user) {
        return { allowed: false, reason: "account_missing", policyId };
      }
      if (user.status !== "active") {
        return { allowed: false, reason: "account_inactive", policyId };
      }
      if ("resource" in request) {
        // Reserviert (fail closed): Ownership-/Zuweisungs-Prüfungen entstehen mit den
        // ersten Fach-APIs — bis dahin wird nichts stillschweigend erlaubt.
        return { allowed: false, reason: "policy_not_implemented", policyId };
      }
      return hasWorkspacePermission(user.role, request.action)
        ? { allowed: true, reason: "permission_granted", policyId }
        : { allowed: false, reason: "permission_missing", policyId };
    },
  };
}

export interface RouteAuthDeps {
  authStore: AuthStore;
}

/** preHandler-Adapter über dem AuthorizationService (401 ohne Principal, 403 bei
 *  Verweigerung — Fehlerform identisch zur früheren createRequirePermission). */
export function requireAuthorization(
  deps: RouteAuthDeps,
  request: AuthorizationRequest,
): preHandlerHookHandler {
  const service = createAuthorizationService(deps.authStore);
  return async function requireAuthorizationHandler(req, reply) {
    const principal = req.principal;
    if (!principal) {
      await reply.code(401).send({ error: "authentication required" });
      return;
    }
    const decision = await service.authorize(principal, request);
    if (!decision.allowed) {
      req.log.info(
        { decision, actorId: principal.actorId },
        "authorization denied",
      );
      await reply
        .code(403)
        .send({ error: `permission "${request.action}" required` });
    }
  };
}

/** EIN Aufruf pro Route: liefert config.auth (Klassifizierung) UND die daraus abgeleiteten
 *  preHandler (Durchsetzung). Routen setzen NIE beides getrennt. */
export function routeAuth(
  policy: RouteAuthPolicy,
  deps: RouteAuthDeps,
): { config: { auth: RouteAuthPolicy }; preHandler: preHandlerHookHandler[] } {
  return {
    config: { auth: policy },
    preHandler: derivePreHandlers(policy, deps),
  };
}

function derivePreHandlers(
  policy: RouteAuthPolicy,
  deps: RouteAuthDeps,
): preHandlerHookHandler[] {
  switch (policy.kind) {
    case "public":
    case "bootstrap-token":
    case "registration-policy":
      // Gate lebt im Handler (Body-Token/Registration-Modus) bzw. entfällt.
      return [];
    case "authenticated":
      return [createRequirePrincipal(deps.authStore)];
    case "permission":
      return [
        createRequirePrincipal(deps.authStore),
        requireAuthorization(deps, { action: policy.action }),
      ];
    case "resource":
      // Fail closed, bis Resource-Autorisierung implementiert ist.
      return [
        createRequirePrincipal(deps.authStore),
        async (_request, reply) => {
          await reply
            .code(403)
            .send({ error: "resource policy not implemented" });
        },
      ];
  }
}

/** Startup-Guard (K2): /auth- und /api-Routen ohne config.auth sind ein Boot-Fehler —
 *  nicht erst ein roter Test. Auto-HEAD-Routen erben die Konfiguration ihrer GET-Route. */
export function registerAuthPolicyGuard(app: FastifyInstance): void {
  app.addHook("onRoute", (route) => {
    if (route.method === "HEAD") return;
    if (!route.url.startsWith("/auth") && !route.url.startsWith("/api/")) {
      return;
    }
    const auth = (route.config as { auth?: RouteAuthPolicy } | undefined)?.auth;
    if (!auth) {
      throw new Error(
        `route ${String(route.method)} ${route.url} has no auth policy (config.auth via routeAuth)`,
      );
    }
  });
}
