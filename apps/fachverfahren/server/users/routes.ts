import { randomUUID } from "node:crypto";
import type {
  AuditEventType,
  AuditStore,
  AuthStore,
  KanbanStore,
  UserAccount,
} from "@senticor/app-store-postgres";
import { hashPassword } from "@senticor/provider-local-auth";
import type { FastifyInstance } from "fastify";
import { MINIMUM_PASSWORD_LENGTH } from "../auth/bootstrap.js";
import "../auth/principal.js";
import { createRequirePrincipal } from "../auth/require-principal.js";
import { seedPersonalStarterBoard } from "../auth/starter-board.js";
import { createRequirePermission } from "../auth/workspace-permissions.js";

export interface UserRouteDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
  now?: () => Date;
  generateId?: (prefix: string) => string;
}

interface CreateUserRequestBody {
  email?: unknown;
  displayName?: unknown;
  initialPassword?: unknown;
}

interface UpdateUserRequestBody {
  status?: unknown;
}

/** Safe-Fields, nie ein gespreadetes UserAccount — Credentials/interne Felder bleiben drin. */
function toUserResponse(user: UserAccount) {
  return {
    actorId: user.actorId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

/** Duplikat-Erkennung über beide Store-Implementierungen: Postgres meldet die
 *  Unique-Violation als SQLSTATE 23505, der InMemory-Store wirft "... already exists". */
function isDuplicateUserError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "23505" || /already exists/i.test(error.message);
}

/** Admin-Benutzerverwaltung (Feature-Entscheid: Admin legt Konten an, keine
 *  Selbst-Registrierung). Alle Routen verlangen die Permission `users.manage`. */
export function registerUserRoutes(
  app: FastifyInstance,
  deps: UserRouteDeps,
): void {
  const now = deps.now ?? (() => new Date());
  const generateId =
    deps.generateId ?? ((prefix: string) => `${prefix}.${randomUUID()}`);
  const requirePrincipal = createRequirePrincipal(deps.authStore);
  const requireUsersManage = createRequirePermission(
    deps.authStore,
    "users.manage",
  );
  const guards = [requirePrincipal, requireUsersManage];

  // Audit-Events gehören in den Tenant des HANDELNDEN Principals — nicht pauschal in
  // den Default-Tenant, sonst verschwänden sie aus dem Trail des betroffenen Tenants
  // (Codex-Review PR #27).
  async function audit(
    eventType: AuditEventType,
    tenantId: string,
    actorId: string | null,
    metadata: Record<string, unknown>,
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

  app.get("/api/v1/users", { preHandler: guards }, async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      return reply.code(401).send({ error: "authentication required" });
    }
    const users = await deps.authStore.listUsers({
      tenantId: principal.tenantId,
    });
    return reply.send(users.map(toUserResponse));
  });

  app.post<{ Body: CreateUserRequestBody }>(
    "/api/v1/users",
    { preHandler: guards },
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      const body = request.body ?? {};
      if (
        typeof body.email !== "string" ||
        body.email.trim() === "" ||
        typeof body.displayName !== "string" ||
        body.displayName.trim() === "" ||
        typeof body.initialPassword !== "string"
      ) {
        return reply.code(400).send({ error: "invalid user request" });
      }
      if (body.initialPassword.length < MINIMUM_PASSWORD_LENGTH) {
        return reply.code(400).send({
          error: `password must be at least ${MINIMUM_PASSWORD_LENGTH} characters`,
        });
      }
      // Normalisieren: " user@example.org " und "user@example.org" sind DASSELBE Konto —
      // ungetrimmte Eingaben erzeugten sonst visuelle Duplikate, mit denen sich niemand
      // regulär anmelden kann (Codex-Review PR #27).
      const email = body.email.trim();
      const displayName = body.displayName.trim();

      const existing = await deps.authStore.getUserByEmail({
        tenantId: principal.tenantId,
        email,
      });
      if (existing) {
        return reply
          .code(409)
          .send({ error: "a user with this email already exists" });
      }

      const nowValue = now();
      const nowIso = nowValue.toISOString();
      const actorId = generateId("actor");
      let user: UserAccount;
      try {
        user = await deps.authStore.createUser({
          actorId,
          tenantId: principal.tenantId,
          // Kontext der handelnden Session vererben: ein Admin einer Nicht-Default-
          // Behörde legt Konten SEINER Behörde an (Codex-Review PR #27, Runde 5).
          authorityId: principal.authorityId,
          jurisdictionId: principal.jurisdictionId,
          email,
          displayName,
          status: "active",
          role: "member",
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      } catch (error) {
        // NUR das Duplikat (Race auf den Unique-Index (tenant_id, lower(email)) zwischen
        // Pre-Check und INSERT) wird zum 409 — alle anderen Persistenzfehler (fehlende
        // Migration, Verbindungsabbruch) müssen als 5xx sichtbar bleiben (Codex-Review PR #27).
        if (isDuplicateUserError(error)) {
          return reply
            .code(409)
            .send({ error: "a user with this email already exists" });
        }
        throw error;
      }

      // Gleiche Rollback-Grenze wie bootstrapWorkspace: scheitert Credential, Identity-Link
      // oder Starter-Board, wird der Benutzer kompensierend gelöscht — sonst bliebe ein
      // Konto ohne Login-Möglichkeit zurück.
      try {
        const passwordHash = await hashPassword(body.initialPassword);
        await deps.authStore.createLocalCredential({
          actorId,
          passwordHash,
          hashAlgo: "argon2id",
          passwordChangedAt: nowIso,
          failedAttempts: 0,
          lockedUntil: null,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        await deps.authStore.linkIdentity({
          tenantId: principal.tenantId,
          provider: "local",
          subject: actorId,
          actorId,
        });
        const board = await seedPersonalStarterBoard(
          deps.kanbanStore,
          {
            tenantId: principal.tenantId,
            authorityId: principal.authorityId,
            jurisdictionId: principal.jurisdictionId,
            ownerActorId: actorId,
            contentLocale: "de",
            now: nowValue,
          },
          { generateId },
        );
        await audit("USER_CREATED", principal.tenantId, principal.actorId, {
          createdActorId: actorId,
          email: user.email,
          role: user.role,
          via: "admin",
        });
        return reply
          .code(201)
          .send({ ...toUserResponse(user), boardId: board.boardId });
      } catch (error) {
        await deps.authStore
          .deleteUser({ tenantId: principal.tenantId, actorId })
          .catch(() => {
            // Best effort — der ursprüngliche Fehler beschreibt die Ursache.
          });
        throw error;
      }
    },
  );

  app.patch<{ Params: { actorId: string }; Body: UpdateUserRequestBody }>(
    "/api/v1/users/:actorId",
    { preHandler: guards },
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      const status = request.body?.status;
      if (status !== "active" && status !== "disabled") {
        return reply.code(400).send({ error: "invalid user request" });
      }
      // Selbst-Aussperrungs-Guard: der letzte Admin darf sich nicht selbst deaktivieren.
      if (request.params.actorId === principal.actorId) {
        return reply
          .code(400)
          .send({ error: "you cannot change your own account status" });
      }
      const target = await deps.authStore.getUserById({
        tenantId: principal.tenantId,
        actorId: request.params.actorId,
      });
      if (!target) {
        return reply.code(404).send({ error: "user not found" });
      }

      // updateUserStatus widerruft bei `disabled` ATOMAR alle aktiven Sessions
      // (eine Store-Transaktion) — kein Fenster für „deaktiviert, aber Session lebt".
      const updated = await deps.authStore.updateUserStatus({
        tenantId: principal.tenantId,
        actorId: target.actorId,
        status,
      });
      await audit(
        "USER_STATUS_CHANGED",
        principal.tenantId,
        principal.actorId,
        {
          targetActorId: target.actorId,
          status,
        },
      );
      return reply.send(toUserResponse(updated));
    },
  );
}
