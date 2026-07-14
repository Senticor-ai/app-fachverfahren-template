// route-auth — Deklaration UND Durchsetzung der BFF-Autorisierung aus EINER Quelle
// (Spiegel des App-Musters routeAuth in auth/authorization.ts): bffRouteAuth(policy)
// liefert config.auth (der App-Startup-Guard verlangt es auf JEDER /api-Route) und die
// abgeleiteten preHandler. Kette: Session auflösen (fehlend → 401 + SecurityEvent) →
// Permission fail-closed prüfen (verweigert → 403 + SecurityEvent). rbac-scoped wählt
// die Permission über das VALIDIERTE scope-Feld (Fastify validiert vor den preHandlern).
import type { FastifyRequest, preHandlerHookHandler } from "fastify";
import type {
  AuditSink,
  ResolvedSession,
  SessionResolver,
} from "@senticor/app-runtime-fastify";
import { readHeader } from "@senticor/app-runtime-fastify";
import {
  createSecurityEvent,
  hasPermission,
  type RbacRegistry,
} from "@senticor/public-sector-sdk";

declare module "fastify" {
  interface FastifyRequest {
    bffSession?: ResolvedSession;
  }
}

export type BffRouteAuth =
  | { kind: "rbac"; permission: string }
  | { kind: "rbac-scoped"; permissions: { own: string; authority: string } };

/** Stabile Kurzform für die Routen→Policy-Tabelle in route-authorization.test.ts. */
export function bffRouteAuthLabel(auth: BffRouteAuth): string {
  return auth.kind === "rbac"
    ? `rbac:${auth.permission}`
    : `rbac-scoped:own=${auth.permissions.own},authority=${auth.permissions.authority}`;
}

export interface BffAuthDeps {
  sessionResolver: SessionResolver;
  auditSink: AuditSink;
  rbacRegistry: RbacRegistry;
}

export function bffRouteAuth(
  policy: BffRouteAuth,
  deps: BffAuthDeps,
): { config: { auth: BffRouteAuth }; preHandler: preHandlerHookHandler[] } {
  return {
    config: { auth: policy },
    preHandler: [requireSession(deps), requirePermission(policy, deps)],
  };
}

export function requestIdOf(request: FastifyRequest): string {
  return readHeader(request, "x-request-id") ?? request.id;
}

/** Nach requireSession IMMER vorhanden — wirft laut, falls ein Handler ohne die
 *  bffRouteAuth-Kette registriert wurde (Programmierfehler, kein Request-Fehler). */
export function sessionOf(request: FastifyRequest): ResolvedSession {
  const session = request.bffSession;
  if (!session) {
    throw new Error(
      "bff session missing — Route ohne bffRouteAuth-preHandler registriert",
    );
  }
  return session;
}

/** Unbekannte Rollen werden GEFILTERT statt zu werfen: eine Sitzung mit einer
 *  zusätzlichen, der Registry unbekannten Rolle behält die Rechte ihrer bekannten
 *  Rollen (kein 500, kein Komplett-Deny) — nie mehr Rechte als registriert. */
export function knownRoles(
  roles: readonly string[],
  registry: RbacRegistry,
): string[] {
  const registered = new Set(registry.roles.map((role) => role.roleKey));
  return roles.filter((role) => registered.has(role));
}

function requireSession(deps: BffAuthDeps): preHandlerHookHandler {
  return async function requireSessionHandler(request, reply) {
    const session = await deps.sessionResolver.resolve(request);
    if (!session) {
      await deps.auditSink.emit({
        kind: "security",
        event: createSecurityEvent({
          eventType: "bff.session.missing",
          requestId: requestIdOf(request),
          severity: "info",
        }),
      });
      return reply.code(401).send({
        error: "authentication required",
        requestId: requestIdOf(request),
      });
    }
    request.bffSession = session;
  };
}

function requirePermission(
  policy: BffRouteAuth,
  deps: BffAuthDeps,
): preHandlerHookHandler {
  return async function requirePermissionHandler(request, reply) {
    const session = request.bffSession;
    if (!session) return; // requireSession hat bereits mit 401 geantwortet.
    const permission =
      policy.kind === "rbac"
        ? policy.permission
        : scopeOf(request) === "authority"
          ? policy.permissions.authority
          : policy.permissions.own;
    const roles = knownRoles(session.rbacRoles, deps.rbacRegistry);
    if (!hasPermission(roles, permission, deps.rbacRegistry)) {
      await deps.auditSink.emit({
        kind: "security",
        event: createSecurityEvent({
          eventType: "bff.permission.denied",
          actorId: session.actorId,
          requestId: requestIdOf(request),
          severity: "warning",
        }),
      });
      return reply.code(403).send({
        error: `permission "${permission}" required`,
        requestId: requestIdOf(request),
      });
    }
  };
}

/** Liest das VALIDIERTE scope-Feld (Query bei GET, Body bei POST); Default own. */
export function scopeOf(request: FastifyRequest): "own" | "authority" {
  const query = request.query as { scope?: "own" | "authority" } | null;
  const body = request.body as { scope?: "own" | "authority" } | null;
  return query?.scope ?? body?.scope ?? "own";
}
