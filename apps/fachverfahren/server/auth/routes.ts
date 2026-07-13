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
import {
  DEFAULT_AUTHORITY_ID,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_TENANT_ID,
  SESSION_COOKIE_NAME,
} from "./constants.js";
import "./principal.js";
import { routeAuth } from "./authorization.js";
import { createInMemoryRateLimiter, type RateLimiter } from "./rate-limit.js";
import {
  DEFAULT_SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  sessionExpiryIso,
} from "./session-token.js";
import {
  effectivePersonas,
  isDuplicateUserError,
} from "@senticor/app-store-postgres";
import { permissionsForRole } from "./workspace-permissions.js";

export type RegistrationMode = "disabled" | "open_unverified";

export interface RegistrationContext {
  tenantId: string;
  registrationMode: RegistrationMode;
}

/** Tenant + Registrierungs-Modus kommen aus dem VERTRAUENSWÜRDIGEN Deployment-Kontext
 *  (konfigurierter Tenant, später Subdomain-/Invite-/OIDC-Mapping) — NIE aus dem
 *  Request-Body. Die Standalone-Implementierung nutzt den konfigurierten Default-Tenant. */
export interface RegistrationContextResolver {
  resolve(request: {
    ip: string;
  }): RegistrationContext | Promise<RegistrationContext>;
}

export interface AuthRouteDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
  bootstrapToken: string | undefined;
  /** Self-Signup-Politik: Default AUS. `open_unverified` heißt ehrlich so, bis
   *  E-Mail-Verifikation existiert (capability:notification, PLAN in rbac.md). */
  registrationMode?: RegistrationMode;
  registrationContextResolver?: RegistrationContextResolver;
  /** Drossel für Registrierung/Login/Passwort — Default: In-Memory (Single-Process). */
  rateLimiter?: RateLimiter;
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
  const publicRoute = routeAuth({ kind: "public" }, deps);
  const authenticated = routeAuth({ kind: "authenticated" }, deps);
  // Zwei Drossel-Profile: Registrierung streng (Konto-Anlage), Credential-Pfade
  // großzügiger (ein Büro hinter NAT teilt sich eine IP). Ein injizierter
  // RateLimiter (deps) übernimmt BEIDE Schlüsselräume — verteilte Implementierungen
  // konfigurieren ihre Limits pro Schlüssel-Präfix selbst.
  const registerLimiter =
    deps.rateLimiter ??
    createInMemoryRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const credentialLimiter =
    deps.rateLimiter ??
    createInMemoryRateLimiter({ limit: 30, windowMs: 15 * 60 * 1000 });
  const registrationResolver: RegistrationContextResolver =
    deps.registrationContextResolver ?? {
      resolve: () => ({
        tenantId: DEFAULT_TENANT_ID,
        registrationMode: deps.registrationMode ?? "disabled",
      }),
    };

  // Audit-Schreiben darf einen Login nie verhindern: das Event ist Pflicht der
  // Baseline, aber ein kaputter Audit-Store soll den Auth-Pfad nicht mitreißen —
  // der Fehler wird geloggt (Fastify-Logger), die Anfrage läuft weiter.
  // tenantId explizit: Login/Bootstrap sind an den Default-Tenant der Route gebunden,
  // principal-basierte Aktionen (Passwortwechsel) gehören in den Tenant der Session
  // (Codex-Review PR #27, Runde 5).
  async function audit(
    eventType: AuditEventType,
    tenantId: string,
    actorId: string | null,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await deps.auditStore.appendEvent({
        id: generateId("audit"),
        tenantId,
        actorId,
        eventType,
        occurredAt: now().toISOString(),
        metadata,
      });
    } catch (error) {
      app.log.error({ err: error, eventType }, "audit event write failed");
    }
  }

  // Statische Status-Anteile: Schema-/Capability-Anzeige (der Client fällt NUR bei
  // Servern OHNE userPersonas-Capability auf den Alle-drei-Legacy-Fallback zurück;
  // fehlt personas trotz Capability, gilt fail closed LEER) + Registration-Modus.
  const statusEnvelope = {
    sessionSchemaVersion: 2,
    capabilities: { userPersonas: true },
    registration: deps.registrationMode ?? "disabled",
  };

  app.get("/auth/status", publicRoute, async () => {
    // Ohne erreichbaren Auth-Store (kein APP_PG_URL, DB down) bewusst degradiert
    // antworten statt 500: Web-Tier oben, Datenbank unten. Der Client behandelt
    // storeAvailable=false wie „API nicht erreichbar" (session-state.ts), und der
    // Browser loggt keinen Ressourcen-Fehler — der hermetische PWA-Browser-Audit
    // läuft genau in diesem Zustand gegen die Landing.
    try {
      const count = await deps.authStore.countUsers({
        tenantId: DEFAULT_TENANT_ID,
      });
      return { ...statusEnvelope, bootstrapped: count > 0 };
    } catch (error) {
      app.log.warn({ err: error }, "auth store unavailable for /auth/status");
      return { ...statusEnvelope, bootstrapped: false, storeAvailable: false };
    }
  });

  app.post<{ Body: BootstrapRequestBody }>(
    "/auth/bootstrap",
    // Gate = Einrichtungs-Token im Body (assertBootstrapToken im Handler).
    routeAuth({ kind: "bootstrap-token" }, deps),
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
        await audit("USER_CREATED", result.user.tenantId, result.user.actorId, {
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

  interface RegisterRequestBody {
    email?: unknown;
    displayName?: unknown;
    password?: unknown;
  }

  // Neutrale Antwort für NEU und BEREITS VERGEBEN (Anti-Enumeration): kein Auto-Login,
  // kein Cookie — Konto-Existenz ist von außen nicht ablesbar. Wortlaut identisch.
  const NEUTRAL_REGISTER_RESPONSE = {
    message:
      "Falls die E-Mail-Adresse noch nicht registriert war, wurde Ihr Konto angelegt. Sie können sich jetzt mit Ihren Zugangsdaten über die Anmeldung anmelden.",
  };
  const MAX_EMAIL_LENGTH = 254;
  const MAX_DISPLAY_NAME_LENGTH = 120;
  const MAX_PASSWORD_LENGTH = 256;
  const MAX_PASSWORD_BYTES = 1024;

  // Self-Signup (default AUS): legt ein citizen-Konto mit Arbeitsbereich „buerger" an.
  // citizen hat KEINE Workspace-Permissions (workspace-permissions.ts) — die Boards-API
  // bleibt zu. Offene Punkte bis zum ehrlichen "open": E-Mail-Verifikation, Passwort-
  // Reset, Invites (PLAN in docs/reference/rbac.md).
  app.post<{ Body: RegisterRequestBody }>(
    "/auth/register",
    routeAuth({ kind: "registration-policy" }, deps),
    async (request, reply) => {
      const context = await registrationResolver.resolve(request);
      if (context.registrationMode !== "open_unverified") {
        await audit("REGISTRATION_REJECTED", context.tenantId, null, {
          reason: "registration_disabled",
        });
        return reply.code(403).send({ error: "registration is disabled" });
      }
      // Quelle drosseln, BEVOR gehasht wird (argon2 ist teuer). request.ip ist nur
      // hinter explizit konfiguriertem trustProxy die Client-IP (rate-limit.ts).
      if (!registerLimiter.allow(`register:${request.ip}`)) {
        await audit("REGISTRATION_REJECTED", context.tenantId, null, {
          reason: "rate_limited",
        });
        return reply
          .code(429)
          .send({ error: "too many registration attempts" });
      }
      const body = request.body ?? {};
      if (
        typeof body.email !== "string" ||
        typeof body.displayName !== "string" ||
        typeof body.password !== "string"
      ) {
        return reply.code(400).send({ error: "invalid registration request" });
      }
      // Längen-Caps VOR dem Hashing (Hashing-DoS) — E-Mail normalisiert (trim/lowercase,
      // der Unique-Index ist ohnehin lower(email)).
      const email = body.email.trim().toLowerCase();
      const displayName = body.displayName.trim();
      if (
        email.length === 0 ||
        email.length > MAX_EMAIL_LENGTH ||
        !email.includes("@") ||
        displayName.length === 0 ||
        displayName.length > MAX_DISPLAY_NAME_LENGTH ||
        body.password.length < MINIMUM_PASSWORD_LENGTH ||
        body.password.length > MAX_PASSWORD_LENGTH ||
        Buffer.byteLength(body.password, "utf8") > MAX_PASSWORD_BYTES
      ) {
        return reply.code(400).send({ error: "invalid registration request" });
      }

      // Hash IMMER berechnen (auch für vergebene Adressen): uniforme Antwortzeit,
      // kein Timing-Orakel über Konto-Existenz.
      const passwordHash = await hashPassword(body.password);
      const nowIso = now().toISOString();
      const actorId = generateId("actor");
      try {
        await deps.authStore.createLocalUserWithCredential({
          user: {
            actorId,
            tenantId: context.tenantId,
            authorityId: DEFAULT_AUTHORITY_ID,
            jurisdictionId: DEFAULT_JURISDICTION_ID,
            email,
            displayName,
            status: "active",
            role: "citizen",
            localPersonas: ["buerger"],
            oidcPersonas: [],
            personaManagementMode: "local",
            principalVersion: 1,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          credential: {
            actorId,
            passwordHash,
            hashAlgo: "argon2id",
            passwordChangedAt: nowIso,
            failedAttempts: 0,
            lockedUntil: null,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        });
      } catch (error) {
        if (isDuplicateUserError(error)) {
          await audit("REGISTRATION_REJECTED", context.tenantId, null, {
            reason: "email_taken",
          });
          return reply.code(200).send(NEUTRAL_REGISTER_RESPONSE);
        }
        throw error;
      }
      await audit("USER_CREATED", context.tenantId, actorId, {
        selfSignup: true,
        role: "citizen",
        personas: ["buerger"],
      });
      return reply.code(200).send(NEUTRAL_REGISTER_RESPONSE);
    },
  );

  app.post<{ Body: LoginRequestBody }>(
    "/auth/login",
    publicRoute,
    async (request, reply) => {
      // IP-Drossel ZUSÄTZLICH zum Konto-Lockout: der Lockout schützt EIN Konto,
      // die Drossel bremst breites Durchprobieren vieler Konten von einer Quelle.
      if (!credentialLimiter.allow(`login:${request.ip}`)) {
        return reply.code(429).send({ error: "too many login attempts" });
      }
      const body = request.body ?? {};
      if (typeof body.email !== "string" || typeof body.password !== "string") {
        return reply.code(400).send({ error: "invalid login request" });
      }

      const user = await deps.authStore.getUserByEmail({
        tenantId: DEFAULT_TENANT_ID,
        email: body.email,
      });
      if (!user || user.status !== "active") {
        await audit("LOGIN_FAILED", DEFAULT_TENANT_ID, user?.actorId ?? null, {
          reason: user ? "account-disabled" : "unknown-account",
        });
        return reply.code(401).send({ error: "invalid credentials" });
      }

      const credential = await deps.authStore.getLocalCredential(user.actorId);
      if (!credential) {
        await audit("LOGIN_FAILED", user.tenantId, user.actorId, {
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
        await audit("LOGIN_LOCKED", user.tenantId, user.actorId, {});
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
          await audit("LOGIN_LOCKED", user.tenantId, user.actorId, {
            failedAttempts: updated.failedAttempts,
          });
        } else {
          await audit("LOGIN_FAILED", user.tenantId, user.actorId, {
            reason: "wrong-password",
            failedAttempts: updated.failedAttempts,
          });
        }
        return reply.code(401).send({ error: "invalid credentials" });
      }

      await deps.authStore.resetLoginFailures(user.actorId);
      await audit("LOGIN_SUCCESS", user.tenantId, user.actorId, {});
      await issueSession(deps.authStore, reply, user, nowValue);
      return reply.send({ actorId: user.actorId, email: user.email });
    },
  );

  // Session-optional und idempotent: räumt Cookie/Session IMMER — auch eine abgelaufene
  // Sitzung kann sich „abmelden", statt an 401 zu scheitern.
  app.post("/auth/logout", publicRoute, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) {
      await deps.authStore.revokeSession(hashSessionToken(token));
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/auth/session", authenticated, async (request, reply) => {
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
    // Der Principal trägt FÄHIGKEITEN (permissions, personas), nicht nur Rohdaten:
    // der Client autorisiert NUR über permissions; workspaceRole ist Anzeige/Diagnose
    // (`role` bleibt EIN Release als deprecated Alias). E-Mail/DisplayName bleiben
    // zusätzlich top-level, damit bereits gescaffoldete Clients weiterlaufen.
    return reply.send({
      actorId: user.actorId,
      tenantId: user.tenantId,
      identity: { provider: "local", subject: user.actorId },
      account: {
        displayName: user.displayName,
        email: user.email,
        status: user.status,
      },
      email: user.email,
      displayName: user.displayName,
      workspaceRole: user.role,
      role: user.role,
      permissions: permissionsForRole(user.role),
      personas: effectivePersonas(user),
      personaManagementMode: user.personaManagementMode,
      principalVersion: user.principalVersion,
    });
  });

  app.post<{ Body: PasswordChangeRequestBody }>(
    "/auth/password",
    authenticated,
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      if (!credentialLimiter.allow(`password:${principal.actorId}`)) {
        return reply.code(429).send({ error: "too many password attempts" });
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
        await audit("LOGIN_LOCKED", principal.tenantId, principal.actorId, {
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
          await audit("LOGIN_LOCKED", principal.tenantId, principal.actorId, {
            via: "password-change",
            failedAttempts: updated.failedAttempts,
          });
        } else {
          await audit("LOGIN_FAILED", principal.tenantId, principal.actorId, {
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
      await audit(
        "PASSWORD_CHANGED",
        principal.tenantId,
        principal.actorId,
        {},
      );
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
