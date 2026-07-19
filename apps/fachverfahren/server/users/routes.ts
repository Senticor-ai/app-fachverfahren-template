import { randomUUID } from "node:crypto";
import type {
  AuditEventType,
  AuditStore,
  AuthStore,
  KanbanStore,
  UserAccount,
  UserPersona,
} from "@senticor/app-store-postgres";
import {
  effectivePersonas,
  isDuplicateUserError,
  StalePrincipalVersionError,
} from "@senticor/app-store-postgres";
import { hashPassword } from "@senticor/provider-local-auth";
import type { FastifyInstance } from "fastify";
import { MINIMUM_PASSWORD_LENGTH } from "../auth/bootstrap.js";
import "../auth/principal.js";
import { seedPersonalStarterBoard } from "../auth/starter-board.js";
import { routeAuth } from "../auth/authorization.js";

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
  personas?: unknown;
}

interface UpdateUserRequestBody {
  status?: unknown;
  personas?: unknown;
}

/** Arbeitsbereichs-Liste validieren: Array, jedes Element im kanonischen Tripel.
 *  LEER ist gültig (Null-Arbeitsbereiche-Konto); Duplikate normalisiert der Store. */
function isPersonaArray(value: unknown): value is UserPersona[] {
  // Personas sind OFFEN (nicht-Autz): ein Array nicht-leerer Strings genuegt — kein Enum-Filter mehr, damit
  // ein Fachverfahren eigene Personas (Beschaffung/HR) pflegen kann. Duplikate normalisiert der Store.
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

/** Safe-Fields, nie ein gespreadetes UserAccount — Credentials/interne Felder bleiben drin.
 *  `workspaceRole` ist der akkurate Name; `role` bleibt EIN Release als deprecated Alias.
 *  `personas` = wirksame Arbeitsbereiche (effectivePersonas), die Quellen liegen daneben. */
function toUserResponse(user: UserAccount) {
  return {
    actorId: user.actorId,
    email: user.email,
    displayName: user.displayName,
    workspaceRole: user.role,
    role: user.role,
    status: user.status,
    personas: effectivePersonas(user),
    localPersonas: user.localPersonas,
    oidcPersonas: user.oidcPersonas,
    personaManagementMode: user.personaManagementMode,
    principalVersion: user.principalVersion,
    createdAt: user.createdAt,
  };
}

/** If-Match-Header → erwartete principalVersion (ETag-Form `"3"` oder nackte Zahl). */
function parseExpectedPrincipalVersion(
  header: string | undefined,
): number | undefined {
  if (!header) return undefined;
  const raw = header.replace(/^W\//, "").replaceAll('"', "").trim();
  const version = Number(raw);
  return Number.isInteger(version) && version > 0 ? version : undefined;
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
  const usersManage = routeAuth(
    { kind: "permission", action: "users.manage" },
    deps,
  );

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

  app.get("/api/v1/users", usersManage, async (request, reply) => {
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
    usersManage,
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
        typeof body.initialPassword !== "string" ||
        // Arbeitsbereiche sind PFLICHT (fail-closed): jede Anlage entscheidet explizit,
        // welche Sichten das Konto bekommt — leer ist eine gültige Entscheidung.
        !isPersonaArray(body.personas)
      ) {
        return reply.code(400).send({ error: "invalid user request" });
      }
      const personas = body.personas;
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
      const passwordHash = await hashPassword(body.initialPassword);
      let user: UserAccount;
      try {
        // User + Credential + „local"-Identity-Link ATOMAR (eine Store-Transaktion):
        // es kann kein aktives Konto ohne Login-Weg entstehen.
        user = await deps.authStore.createLocalUserWithCredential({
          user: {
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
            localPersonas: personas,
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

      // Rollback-Grenze nur noch für den Starter-Board-Seed (anderer Store, keine
      // gemeinsame Transaktion): scheitert er, wird das Konto kompensierend gelöscht.
      try {
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
    usersManage,
    async (request, reply) => {
      const principal = request.principal;
      if (!principal) {
        return reply.code(401).send({ error: "authentication required" });
      }
      const body = request.body ?? {};
      const status = body.status;
      const hasStatus = status !== undefined;
      const hasPersonas = body.personas !== undefined;
      if (
        (!hasStatus && !hasPersonas) ||
        (hasStatus && status !== "active" && status !== "disabled") ||
        (hasPersonas && !isPersonaArray(body.personas))
      ) {
        return reply.code(400).send({ error: "invalid user request" });
      }
      // Selbst-Aussperrungs-Guard: der letzte Admin darf sich nicht selbst deaktivieren.
      if (hasStatus && request.params.actorId === principal.actorId) {
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
      // Lokale Persona-Pflege ist bei OIDC-Autorität gesperrt — die externen Claims
      // besitzen die Zuweisungen; erst der Modus-Wechsel (separates, explizites
      // Admin-Control) gibt die lokale Pflege wieder frei.
      if (
        hasPersonas &&
        target.personaManagementMode === "oidc_authoritative"
      ) {
        return reply.code(409).send({
          error: "personas are managed by the external identity provider",
        });
      }

      // EIN atomarer Patch (Status und/oder Arbeitsbereiche): genau ein Version-Bump
      // bei realer Änderung; `disabled` widerruft Sessions in derselben Transaktion.
      // If-Match trägt die erwartete principalVersion (optimistische Nebenläufigkeit).
      const expectedPrincipalVersion = parseExpectedPrincipalVersion(
        request.headers["if-match"] as string | undefined,
      );
      let result;
      try {
        result = await deps.authStore.updateUserAccess({
          tenantId: principal.tenantId,
          actorId: target.actorId,
          ...(expectedPrincipalVersion !== undefined
            ? { expectedPrincipalVersion }
            : {}),
          patch: {
            ...(hasStatus ? { status } : {}),
            ...(hasPersonas
              ? { localPersonas: body.personas as UserPersona[] }
              : {}),
          },
        });
      } catch (error) {
        if (error instanceof StalePrincipalVersionError) {
          return reply.code(409).send({
            error: "the account changed in the meantime — reload and retry",
          });
        }
        throw error;
      }

      // Audit NUR bei realer Änderung (No-ops sind kein Ereignis) — mit before/after
      // für Nachvollziehbarkeit.
      if (result.changed && result.before.status !== result.after.status) {
        await audit(
          "USER_STATUS_CHANGED",
          principal.tenantId,
          principal.actorId,
          {
            targetActorId: target.actorId,
            status: result.after.status,
          },
        );
      }
      if (
        result.changed &&
        result.before.localPersonas.join(",") !==
          result.after.localPersonas.join(",")
      ) {
        await audit(
          "USER_PERSONAS_CHANGED",
          principal.tenantId,
          principal.actorId,
          {
            targetActorId: target.actorId,
            before: result.before.localPersonas,
            after: result.after.localPersonas,
            source: "local_admin",
            scope: "local",
          },
        );
      }
      return reply.send(toUserResponse(result.after));
    },
  );
}
