import type { UserRole } from "@senticor/app-store-postgres";

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

// citizen = selbstregistrierte Bürger:innen: KEINE Workspace-Permissions. Ihre
// Persona-Sichten sind heute rein clientseitige Demo-Daten; sobald echte Fach-APIs
// entstehen (z.B. application.read), brauchen diese RESOURCE-Autorisierung
// (Ownership/Zuweisung) über den AuthorizationService — nie Persona-Checks.
const ROLE_PERMISSIONS: Record<UserRole, WorkspacePermission[]> = {
  admin: ALL_PERMISSIONS,
  member: ["boards.collaborate"],
  citizen: [],
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

// Die Durchsetzung lebt in auth/authorization.ts (routeAuth/requireAuthorization):
// Routen deklarieren ihre Policy als Route-Config, die preHandler werden daraus
// abgeleitet — dieses Modul liefert nur noch das Rolle→Permission-Mapping.
