// route-authorization.test.ts — K2: JEDE /auth/*- und /api/*-Route trägt eine EXPLIZITE
// Autorisierungs-Policy (config.auth, gesetzt über routeAuth()). Die Tabelle unten ist die
// abgenommene Klassifizierung; eine neue Route ohne Eintrag macht diesen Test rot, eine
// Route ganz ohne Policy bricht schon den Server-Start (registerAuthPolicyGuard).
import fastifyCookie from "@fastify/cookie";
import {
  appBff,
  bffRouteAuthLabel,
  type BffRouteAuth,
} from "@senticor/app-bff-fastify";
import {
  MemoryAuditSink,
  NoSessionResolver,
} from "@senticor/app-runtime-fastify";
import {
  InMemoryAppStore,
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryCaseStore,
  InMemoryKanbanStore,
  InMemoryTaskStore,
} from "@senticor/app-store-postgres";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";
import fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import {
  registerAuthPolicyGuard,
  type RouteAuthPolicy,
} from "./auth/authorization.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerAuditRoutes } from "./audit/routes.js";
import { registerBoardRoutes } from "./kanban/routes.js";
import { registerUserRoutes } from "./users/routes.js";

interface CollectedRoute {
  method: string;
  url: string;
  policy: string;
}

function policyLabel(
  policy: RouteAuthPolicy | BffRouteAuth | undefined,
): string {
  if (!policy) return "(none)";
  if (policy.kind === "rbac" || policy.kind === "rbac-scoped") {
    return bffRouteAuthLabel(policy);
  }
  return policy.kind === "permission"
    ? `permission:${policy.action}`
    : policy.kind;
}

async function buildAppAndCollect(): Promise<CollectedRoute[]> {
  const authStore = new InMemoryAuthStore();
  const kanbanStore = new InMemoryKanbanStore();
  const auditStore = new InMemoryAuditStore();
  const app: FastifyInstance = fastify({ logger: false });
  await app.register(fastifyCookie);

  const collected: CollectedRoute[] = [];
  registerAuthPolicyGuard(app);
  app.addHook("onRoute", (route) => {
    // Auto-HEAD-Routen erben die Konfiguration ihrer GET-Route — nicht doppelt listen.
    if (route.method === "HEAD") return;
    if (!route.url.startsWith("/auth") && !route.url.startsWith("/api/")) {
      return;
    }
    const auth = (
      route.config as { auth?: RouteAuthPolicy | BffRouteAuth } | undefined
    )?.auth;
    collected.push({
      method: String(route.method),
      url: route.url,
      policy: policyLabel(auth),
    });
  });

  registerAuthRoutes(app, {
    authStore,
    kanbanStore,
    auditStore,
    bootstrapToken: "test-token",
  });
  registerBoardRoutes(app, { authStore, kanbanStore, auditStore });
  registerUserRoutes(app, { authStore, kanbanStore, auditStore });
  registerAuditRoutes(app, { authStore, auditStore });
  await app.register(appBff, {
    appStore: new InMemoryAppStore(),
    caseStore: new InMemoryCaseStore(),
    taskStore: new InMemoryTaskStore(),
    procedureRegistry: createInMemoryProcedureRegistry([]),
    sessionResolver: new NoSessionResolver(),
    auditSink: new MemoryAuditSink(),
  });
  await app.ready();
  await app.close();
  return collected.sort(
    (a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method),
  );
}

describe("Routen-Klassifizierung (config.auth)", () => {
  it("jede /auth- und /api-Route entspricht der abgenommenen Policy-Tabelle", async () => {
    const collected = await buildAppAndCollect();
    expect(collected).toEqual(
      [
        // Öffentlich: Status ist der Client-Bootstrap; Login authentifiziert selbst;
        // Logout ist session-optional idempotent (räumt Cookie immer).
        { method: "GET", url: "/auth/status", policy: "public" },
        { method: "POST", url: "/auth/login", policy: "public" },
        { method: "POST", url: "/auth/logout", policy: "public" },
        // Eigene Politiken: Token-/Modus-Prüfung erfolgt im Handler.
        { method: "POST", url: "/auth/bootstrap", policy: "bootstrap-token" },
        {
          method: "POST",
          url: "/auth/register",
          policy: "registration-policy",
        },
        // Nur-authentifiziert (bewusst OHNE Permission): eigenes Konto.
        { method: "GET", url: "/auth/session", policy: "authenticated" },
        { method: "POST", url: "/auth/password", policy: "authenticated" },
        // BFF-Routen (Paket @senticor/app-bff-fastify): SDK-RBAC-Permissions,
        // deny-by-default; Mailbox mit scope-getrennten Lese-/Schreibrechten.
        {
          method: "GET",
          url: "/api/capabilities",
          policy: "rbac:session.read",
        },
        { method: "GET", url: "/api/procedures", policy: "rbac:case.read" },
        { method: "GET", url: "/api/cases", policy: "rbac:case.read" },
        {
          method: "POST",
          url: "/api/cases",
          policy: "rbac:case.decision.prepare",
        },
        { method: "GET", url: "/api/cases/:id", policy: "rbac:case.read" },
        {
          method: "GET",
          url: "/api/cases/:id/allowed-actions",
          policy: "rbac:case.read",
        },
        {
          method: "GET",
          url: "/api/cases/:id/audit",
          policy: "rbac:case.read",
        },
        {
          method: "GET",
          url: "/api/cases/:id/progress",
          policy: "rbac:case.read",
        },
        {
          method: "GET",
          url: "/api/cases/:id/tasks",
          policy: "rbac:case.read",
        },
        {
          method: "POST",
          url: "/api/cases/:id/tasks",
          policy: "rbac:case.decision.prepare",
        },
        {
          method: "POST",
          url: "/api/cases/:id/transitions",
          policy: "rbac:case.decision.prepare",
        },
        // Aktenvermerke (append-only): Lesen = case.read; Schreiben (Mensch + KI) = eigene case.note.write.
        {
          method: "GET",
          url: "/api/cases/:id/vermerke",
          policy: "rbac:case.read",
        },
        {
          method: "POST",
          url: "/api/cases/:id/vermerke",
          policy: "rbac:case.note.write",
        },
        {
          method: "POST",
          url: "/api/cases/:id/vermerke/ki",
          policy: "rbac:case.note.write",
        },
        {
          method: "PATCH",
          url: "/api/tasks/:id",
          policy: "rbac:case.decision.prepare",
        },
        // KI-Assistenz (assistiv, HCAI): eigene ai.assist-Permission (nur Sachbearbeitung).
        {
          method: "POST",
          url: "/api/ai/assist",
          policy: "rbac:ai.assist",
        },
        // Bürger-Sicht auf die EIGENEN Anträge: eine eigene Routen-Familie mit EIGENEN Permissions.
        // Bewusst `rbac:` und NICHT `rbac-scoped:` wie die Mailbox — hier gibt es keine Scope-WAHL:
        // die Route IST der Scope, er kommt nicht von der Leitung (scopeOf läse Query/Body).
        // Und NIE `case.read`/`case.decision.prepare`: das sind die Behörden-Rechte über ALLE Fälle.
        {
          method: "GET",
          url: "/api/buerger/antraege",
          policy: "rbac:case.own.read",
        },
        {
          method: "POST",
          url: "/api/buerger/antraege",
          policy: "rbac:case.own.submit",
        },
        {
          method: "GET",
          url: "/api/buerger/antraege/:id",
          policy: "rbac:case.own.read",
        },
        {
          method: "GET",
          url: "/api/buerger/antraege/:id/bescheid",
          policy: "rbac:case.own.read",
        },
        {
          method: "POST",
          url: "/api/buerger/antraege/:id/widerspruch",
          policy: "rbac:case.own.submit",
        },
        {
          method: "GET",
          url: "/api/mailbox",
          policy:
            "rbac-scoped:own=mailbox.own.read,authority=mailbox.authority.read",
        },
        {
          method: "POST",
          url: "/api/mailbox",
          policy:
            "rbac-scoped:own=mailbox.own.write,authority=mailbox.authority.write",
        },
        {
          method: "GET",
          url: "/api/preferences",
          policy: "rbac:preferences.read",
        },
        {
          method: "PUT",
          url: "/api/preferences",
          policy: "rbac:preferences.write",
        },
        { method: "GET", url: "/api/session", policy: "rbac:session.read" },
        // Workspace-APIs brauchen Permissions — nie nur „eingeloggt".
        {
          method: "GET",
          url: "/api/v1/audit-events",
          policy: "permission:audit.read",
        },
        {
          method: "GET",
          url: "/api/v1/users",
          policy: "permission:users.manage",
        },
        {
          method: "POST",
          url: "/api/v1/users",
          policy: "permission:users.manage",
        },
        {
          method: "PATCH",
          url: "/api/v1/users/:actorId",
          policy: "permission:users.manage",
        },
        ...[
          { method: "GET", url: "/api/v1/boards" },
          { method: "POST", url: "/api/v1/boards" },
          { method: "GET", url: "/api/v1/boards/:boardId" },
          { method: "PATCH", url: "/api/v1/boards/:boardId" },
          { method: "POST", url: "/api/v1/boards/:boardId/archive" },
          { method: "POST", url: "/api/v1/boards/:boardId/restore" },
          { method: "POST", url: "/api/v1/boards/:boardId/columns" },
          {
            method: "PATCH",
            url: "/api/v1/boards/:boardId/columns/:columnId",
          },
          {
            method: "POST",
            url: "/api/v1/boards/:boardId/columns/:columnId/archive",
          },
          {
            method: "POST",
            url: "/api/v1/boards/:boardId/columns/:columnId/restore",
          },
          { method: "GET", url: "/api/v1/boards/:boardId/cards/archived" },
          { method: "POST", url: "/api/v1/boards/:boardId/cards" },
          { method: "PATCH", url: "/api/v1/boards/:boardId/cards/:cardId" },
          { method: "POST", url: "/api/v1/boards/:boardId/cards/:cardId/move" },
          {
            method: "POST",
            url: "/api/v1/boards/:boardId/cards/:cardId/archive",
          },
          {
            method: "POST",
            url: "/api/v1/boards/:boardId/cards/:cardId/restore",
          },
        ].map((route) => ({
          ...route,
          policy: "permission:boards.collaborate",
        })),
      ].sort(
        (a, b) =>
          a.url.localeCompare(b.url) || a.method.localeCompare(b.method),
      ),
    );
  });

  it("eine Route ohne config.auth bricht den Server-Start (Startup-Guard)", async () => {
    const app: FastifyInstance = fastify({ logger: false });
    registerAuthPolicyGuard(app);
    expect(() =>
      app.get("/api/v1/unclassified", async () => ({ ok: true })),
    ).toThrow(/no auth policy/);
    await app.close();
  });
});
