import { randomUUID } from "node:crypto";
import type {
  AuditEventType,
  AuditStore,
  AuthStore,
  KanbanStore,
} from "@senticor/app-store-postgres";
import { hashPassword, verifyPassword } from "@senticor/provider-local-auth";
import {
  evaluateLoginAttempt,
  lockAfterFailure,
} from "@senticor/provider-local-auth";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  assertBootstrapToken,
  BootstrapError,
  bootstrapWorkspace,
  MINIMUM_PASSWORD_LENGTH,
} from "./bootstrap.js";
import { DEFAULT_TENANT_ID, SESSION_COOKIE_NAME } from "./constants.js";
import "./principal.js";
import { createRequirePrincipal } from "./require-principal.js";
import {
  DEFAULT_SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  sessionExpiryIso,
} from "./session-token.js";
import { permissionsForRole } from "./workspace-permissions.js";

export interface AuthRouteDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
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

interface PasswordChangeRequestBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRouteDeps,
): void {
  const now = deps.now ?? (() => new Date());
  const generateId =
    deps.generateId ?? ((prefix: string) => `${prefix}.${randomUUID()}`);
  const requirePrincipal = createRequirePrincipal(deps.authStore);

  // Audit-Schreiben darf einen Login nie verhindern: das Event ist Pflicht der
  // Baseline, aber ein kaputter Audit-Store soll den Auth-Pfad nicht mitreißen —
  // der Fehler wird geloggt (Fastify-Logger), die Anfrage läuft weiter.
  async function audit(
    eventType: AuditEventType,
    actorId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await deps.auditStore.appendEvent({
        id: generateId("audit"),
        tenantId: DEFAULT_TENANT_ID,
        actorId,
        eventType,
        occurredAt: now().toISOString(),
        metadata,
      });
    } catch (error) {
      app.log.error({ err: error, eventType }, "audit event write failed");
    }
  }

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
      // In Konstanten festhalten: die Narrowings oben gelten nicht innerhalb der Lock-Closure.
      const email = body.email;
      const password = body.password;
      const displayName = body.displayName;

      try {
        // Token-Gate der HTTP-Route (der vertrauenswürdige Startup-Pfad in
        // auto-bootstrap.ts ruft bootstrapWorkspace ohne Token direkt).
        assertBootstrapToken(deps.bootstrapToken, body.token);
        // Advisory Lock über den GESAMTEN Bootstrap (kanban plan decision 3): zwei
        // gleichzeitige Setup-POSTs würden sonst beide `countUsers() === 0` sehen und
        // zwei Erstbenutzer anlegen — der zweite läuft jetzt in "already-bootstrapped".
        const result = await deps.authStore.withBootstrapLock(
          DEFAULT_TENANT_ID,
          () =>
            bootstrapWorkspace(
              {
                authStore: deps.authStore,
                kanbanStore: deps.kanbanStore,
                ...(deps.now ? { now: deps.now } : {}),
                ...(deps.generateId ? { generateId: deps.generateId } : {}),
              },
              {
                email,
                password,
                displayName,
                ...(typeof body.contentLocale === "string"
                  ? { contentLocale: body.contentLocale }
                  : {}),
              },
            ),
        );
        await audit("USER_CREATED", result.user.actorId, {
          email: result.user.email,
          role: result.user.role,
          via: "bootstrap",
        });
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
        await audit("LOGIN_FAILED", user?.actorId ?? null, {
          reason: user ? "account-disabled" : "unknown-account",
        });
        return reply.code(401).send({ error: "invalid credentials" });
      }

      const credential = await deps.authStore.getLocalCredential(user.actorId);
      if (!credential) {
        await audit("LOGIN_FAILED", user.actorId, {
          reason: "missing-credential",
        });
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
        await audit("LOGIN_LOCKED", user.actorId, {});
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
          await audit("LOGIN_LOCKED", user.actorId, {
            failedAttempts: updated.failedAttempts,
          });
        } else {
          await audit("LOGIN_FAILED", user.actorId, {
            reason: "wrong-password",
            failedAttempts: updated.failedAttempts,
          });
        }
        return reply.code(401).send({ error: "invalid credentials" });
      }

      await deps.authStore.resetLoginFailures(user.actorId);
      await audit("LOGIN_SUCCESS", user.actorId, {});
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
        role: user.role,
        permissions: permissionsForRole(user.role),
      });
    },
  );

  app.post<{ Body: PasswordChangeRequestBody }>(
    "/auth/password",
    { preHandler: requirePrincipal },
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      const body = request.body ?? {};
      if (
        typeof body.currentPassword !== "string" ||
        typeof body.newPassword !== "string"
      ) {
        return reply
          .code(400)
          .send({ error: "invalid password change request" });
      }
      if (body.newPassword.length < MINIMUM_PASSWORD_LENGTH) {
        return reply.code(400).send({
          error: `password must be at least ${MINIMUM_PASSWORD_LENGTH} characters`,
        });
      }

      const credential = await deps.authStore.getLocalCredential(
        principal.actorId,
      );
      if (!credential) {
        return reply.code(401).send({ error: "authentication required" });
      }

      // Gleicher Failure-/Lockout-Pfad wie der Login: eine gestohlene Session darf
      // currentPassword nicht unbegrenzt raten (Codex-Review PR #27, Runde 2).
      const nowValue = now();
      const gate = evaluateLoginAttempt({
        lockedUntil: credential.lockedUntil
          ? new Date(credential.lockedUntil)
          : null,
        now: nowValue,
      });
      if (!gate.allowed) {
        await audit("LOGIN_LOCKED", principal.actorId, {
          via: "password-change",
        });
        return reply.code(423).send({ error: "account temporarily locked" });
      }

      const currentOk = await verifyPassword(
        body.currentPassword,
        credential.passwordHash,
      );
      if (!currentOk) {
        const updated = await deps.authStore.recordLoginFailure(
          principal.actorId,
        );
        const lockedUntil = lockAfterFailure(updated.failedAttempts, nowValue);
        if (lockedUntil) {
          await deps.authStore.setAccountLock(
            principal.actorId,
            lockedUntil.toISOString(),
          );
          await audit("LOGIN_LOCKED", principal.actorId, {
            via: "password-change",
            failedAttempts: updated.failedAttempts,
          });
        } else {
          await audit("LOGIN_FAILED", principal.actorId, {
            reason: "wrong-current-password",
            via: "password-change",
            failedAttempts: updated.failedAttempts,
          });
        }
        return reply.code(403).send({ error: "current password is incorrect" });
      }

      const passwordHash = await hashPassword(body.newPassword);
      // updateLocalCredentialPassword resettet die Lockout-Zähler mit.
      await deps.authStore.updateLocalCredentialPassword({
        actorId: principal.actorId,
        passwordHash,
        hashAlgo: "argon2id",
        passwordChangedAt: nowValue.toISOString(),
      });
      await audit("PASSWORD_CHANGED", principal.actorId, {});
      return reply.code(204).send();
    },
  );
}

export async function issueSession(
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
