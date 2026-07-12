import type { AuthStore, KanbanStore } from "@senticor/app-store-postgres";
import { verifyPassword } from "@senticor/provider-local-auth";
import {
  evaluateLoginAttempt,
  lockAfterFailure,
} from "@senticor/provider-local-auth";
import type { FastifyInstance, FastifyReply } from "fastify";
import { BootstrapError, bootstrapWorkspace } from "./bootstrap.js";
import { DEFAULT_TENANT_ID, SESSION_COOKIE_NAME } from "./constants.js";
import "./principal.js";
import { createRequirePrincipal } from "./require-principal.js";
import {
  DEFAULT_SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  sessionExpiryIso,
} from "./session-token.js";

export interface AuthRouteDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  bootstrapToken: string | undefined;
  now?: () => Date;
  generateId?: (prefix: string) => string;
}

interface BootstrapRequestBody {
  token?: unknown;
  email?: unknown;
  password?: unknown;
  displayName?: unknown;
  contentLocale?: unknown;
}

interface LoginRequestBody {
  email?: unknown;
  password?: unknown;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRouteDeps,
): void {
  const now = deps.now ?? (() => new Date());
  const requirePrincipal = createRequirePrincipal(deps.authStore);

  app.get("/auth/status", async () => {
    const count = await deps.authStore.countUsers({
      tenantId: DEFAULT_TENANT_ID,
    });
    return { bootstrapped: count > 0 };
  });

  app.post<{ Body: BootstrapRequestBody }>(
    "/auth/bootstrap",
    async (request, reply) => {
      const body = request.body ?? {};
      if (
        typeof body.token !== "string" ||
        typeof body.email !== "string" ||
        typeof body.password !== "string" ||
        typeof body.displayName !== "string"
      ) {
        return reply.code(400).send({ error: "invalid bootstrap request" });
      }

      try {
        const result = await bootstrapWorkspace(
          {
            authStore: deps.authStore,
            kanbanStore: deps.kanbanStore,
            bootstrapToken: deps.bootstrapToken,
            ...(deps.now ? { now: deps.now } : {}),
            ...(deps.generateId ? { generateId: deps.generateId } : {}),
          },
          {
            token: body.token,
            email: body.email,
            password: body.password,
            displayName: body.displayName,
            ...(typeof body.contentLocale === "string"
              ? { contentLocale: body.contentLocale }
              : {}),
          },
        );
        await issueSession(deps.authStore, reply, result.user, now());
        return reply.code(201).send({
          actorId: result.user.actorId,
          email: result.user.email,
          boardId: result.board.boardId,
        });
      } catch (error) {
        if (error instanceof BootstrapError) {
          const statusCode = error.code === "already-bootstrapped" ? 409 : 403;
          return reply.code(statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.post<{ Body: LoginRequestBody }>(
    "/auth/login",
    async (request, reply) => {
      const body = request.body ?? {};
      if (typeof body.email !== "string" || typeof body.password !== "string") {
        return reply.code(400).send({ error: "invalid login request" });
      }

      const user = await deps.authStore.getUserByEmail({
        tenantId: DEFAULT_TENANT_ID,
        email: body.email,
      });
      if (!user || user.status !== "active") {
        return reply.code(401).send({ error: "invalid credentials" });
      }

      const credential = await deps.authStore.getLocalCredential(user.actorId);
      if (!credential) {
        return reply.code(401).send({ error: "invalid credentials" });
      }

      const nowValue = now();
      const gate = evaluateLoginAttempt({
        lockedUntil: credential.lockedUntil
          ? new Date(credential.lockedUntil)
          : null,
        now: nowValue,
      });
      if (!gate.allowed) {
        return reply.code(423).send({ error: "account temporarily locked" });
      }

      const passwordOk = await verifyPassword(
        body.password,
        credential.passwordHash,
      );
      if (!passwordOk) {
        const updated = await deps.authStore.recordLoginFailure(user.actorId);
        const lockedUntil = lockAfterFailure(updated.failedAttempts, nowValue);
        if (lockedUntil) {
          await deps.authStore.setAccountLock(
            user.actorId,
            lockedUntil.toISOString(),
          );
        }
        return reply.code(401).send({ error: "invalid credentials" });
      }

      await deps.authStore.resetLoginFailures(user.actorId);
      await issueSession(deps.authStore, reply, user, nowValue);
      return reply.send({ actorId: user.actorId, email: user.email });
    },
  );

  app.post(
    "/auth/logout",
    { preHandler: requirePrincipal },
    async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE_NAME];
      if (token) {
        await deps.authStore.revokeSession(hashSessionToken(token));
      }
      reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
      return reply.code(204).send();
    },
  );

  app.get(
    "/auth/session",
    { preHandler: requirePrincipal },
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      const user = await deps.authStore.getUserById({
        tenantId: principal.tenantId,
        actorId: principal.actorId,
      });
      if (!user) {
        return reply.code(401).send({ error: "authentication required" });
      }
      return reply.send({
        actorId: user.actorId,
        email: user.email,
        displayName: user.displayName,
      });
    },
  );
}

async function issueSession(
  authStore: AuthStore,
  reply: FastifyReply,
  user: {
    actorId: string;
    tenantId: string;
    authorityId: string;
    jurisdictionId: string;
  },
  now: Date,
): Promise<void> {
  const token = generateSessionToken();
  await authStore.createSession({
    sessionIdHash: hashSessionToken(token),
    actorId: user.actorId,
    tenantId: user.tenantId,
    authorityId: user.authorityId,
    jurisdictionId: user.jurisdictionId,
    createdAt: now.toISOString(),
    expiresAt: sessionExpiryIso(now),
    revokedAt: null,
  });
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: Math.floor(DEFAULT_SESSION_TTL_MS / 1000),
  });
}
