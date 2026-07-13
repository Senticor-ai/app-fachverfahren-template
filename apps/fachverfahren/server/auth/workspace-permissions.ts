import type { AuthStore, UserRole } from "@senticor/app-store-postgres";
import type { FastifyReply, FastifyRequest } from "fastify";

/** Workspace-Permissions statt Rollen-ifs in Routen: Routen prüfen IMMER eine Permission,
 *  nie `role === "admin"`. Damit lassen sich später feinere Rollen (Sachbearbeiter,
 *  Teamleiter, Fachadministrator, Revision) ergänzen, ohne Routen anzufassen — nur dieses
 *  Mapping wächst. Abgrenzung zur (bewusst noch unverdrahteten) SDK-RBAC-Registry:
 *  docs/reference/rbac.md. */
export type WorkspacePermission =
  | "users.manage"
  | "boards.manage"
  | "boards.collaborate"
  | "audit.read"
  | "tenant.export";

const ALL_PERMISSIONS: WorkspacePermission[] = [
  "users.manage",
  "boards.manage",
  "boards.collaborate",
  "audit.read",
  "tenant.export",
];

const ROLE_PERMISSIONS: Record<UserRole, WorkspacePermission[]> = {
  admin: ALL_PERMISSIONS,
  member: ["boards.collaborate"],
};

export function permissionsForRole(role: UserRole): WorkspacePermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function hasWorkspacePermission(
  role: UserRole,
  permission: WorkspacePermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Fastify-preHandler NACH requirePrincipal: lädt die Rolle live (kein Session-Schema-
 *  Change — Demotion/Deaktivierung wirkt sofort auf geschützte APIs) und prüft die
 *  geforderte Permission gegen das App-Identity-Modell, nie gegen den Auth-Provider. */
export function createRequirePermission(
  authStore: AuthStore,
  permission: WorkspacePermission,
) {
  return async function requirePermission(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const principal = request.principal;
    if (!principal) {
      await reply.code(401).send({ error: "authentication required" });
      return;
    }
    const user = await authStore.getUserById({
      tenantId: principal.tenantId,
      actorId: principal.actorId,
    });
    if (
      !user ||
      user.status !== "active" ||
      !hasWorkspacePermission(user.role, permission)
    ) {
      await reply
        .code(403)
        .send({ error: `permission "${permission}" required` });
    }
  };
}
