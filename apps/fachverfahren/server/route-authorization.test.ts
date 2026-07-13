// route-authorization.test.ts — K2: JEDE /auth/*- und /api/*-Route trägt eine EXPLIZITE
// Autorisierungs-Policy (config.auth, gesetzt über routeAuth()). Die Tabelle unten ist die
// abgenommene Klassifizierung; eine neue Route ohne Eintrag macht diesen Test rot, eine
// Route ganz ohne Policy bricht schon den Server-Start (registerAuthPolicyGuard).
import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
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

function policyLabel(policy: RouteAuthPolicy | undefined): string {
  if (!policy) return "(none)";
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
    const auth = (route.config as { auth?: RouteAuthPolicy } | undefined)?.auth;
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
