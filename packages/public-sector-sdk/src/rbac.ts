export type BuiltInRoleKey = "citizen" | "caseworker";

export interface RbacPermission {
  permission: string;
  description: string;
}

export interface RbacRoleDefinition {
  roleKey: string;
  displayName: string;
  description: string;
  permissions: readonly RbacPermission[];
  builtIn: boolean;
}

export interface RbacRegistry {
  roles: readonly RbacRoleDefinition[];
}

export const builtInPermissions = {
  sessionRead: {
    permission: "session.read",
    description: "Eigene Sitzung lesen",
  },
  preferencesRead: {
    permission: "preferences.read",
    description: "Eigene Benutzereinstellungen lesen",
  },
  preferencesWrite: {
    permission: "preferences.write",
    description: "Eigene Benutzereinstellungen ändern",
  },
  mailboxOwnRead: {
    permission: "mailbox.own.read",
    description: "Eigenen Posteingang und Ausgang lesen",
  },
  mailboxOwnWrite: {
    permission: "mailbox.own.write",
    description: "Nachrichten im eigenen Postfach verfassen",
  },
  mailboxAuthorityRead: {
    permission: "mailbox.authority.read",
    description: "Behördlichen Posteingang und Ausgang lesen",
  },
  mailboxAuthorityWrite: {
    permission: "mailbox.authority.write",
    description: "Nachrichten im behördlichen Postfach verfassen",
  },
  caseRead: {
    permission: "case.read",
    description: "Vorgänge lesen",
  },
  casePrepareDecision: {
    permission: "case.decision.prepare",
    description: "Entscheidung vorbereiten",
  },
} as const satisfies Record<string, RbacPermission>;

export const builtInRbacRegistry = {
  roles: [
    {
      roleKey: "citizen",
      displayName: "Bürgerin/Bürger",
      description:
        "Nutzt das Bürgerportal für eigene Vorgänge, Posteingang, Ausgang und Einstellungen.",
      permissions: [
        builtInPermissions.sessionRead,
        builtInPermissions.preferencesRead,
        builtInPermissions.preferencesWrite,
        builtInPermissions.mailboxOwnRead,
        builtInPermissions.mailboxOwnWrite,
      ],
      builtIn: true,
    },
    {
      roleKey: "caseworker",
      displayName: "Sachbearbeitung",
      description:
        "Bearbeitet Vorgänge im behördlichen Fachverfahren mit Posteingang, Ausgang und Entscheidungsvorbereitung.",
      permissions: [
        builtInPermissions.sessionRead,
        builtInPermissions.preferencesRead,
        builtInPermissions.preferencesWrite,
        builtInPermissions.mailboxAuthorityRead,
        builtInPermissions.mailboxAuthorityWrite,
        builtInPermissions.caseRead,
        builtInPermissions.casePrepareDecision,
      ],
      builtIn: true,
    },
  ],
} as const satisfies RbacRegistry;

export function extendRbacRegistry(
  extensions: readonly RbacRoleDefinition[] = [],
  baseRegistry: RbacRegistry = builtInRbacRegistry,
): RbacRegistry {
  const roleKeys = new Set<string>();
  const roles = [...baseRegistry.roles, ...extensions];

  for (const role of roles) {
    if (roleKeys.has(role.roleKey)) {
      throw new Error(`duplicate role key "${role.roleKey}"`);
    }
    roleKeys.add(role.roleKey);
  }

  return { roles };
}

export function resolvePermissionsForRoles(
  roleKeys: readonly string[],
  registry: RbacRegistry = builtInRbacRegistry,
): string[] {
  const rolesByKey = new Map(
    registry.roles.map((role) => [role.roleKey, role] as const),
  );
  const permissions = new Set<string>();

  for (const roleKey of roleKeys) {
    const role = rolesByKey.get(roleKey);
    if (!role) {
      throw new Error(`unknown role "${roleKey}"`);
    }
    for (const permission of role.permissions) {
      permissions.add(permission.permission);
    }
  }

  return [...permissions].sort();
}

export function hasPermission(
  roleKeys: readonly string[],
  permission: string,
  registry: RbacRegistry = builtInRbacRegistry,
): boolean {
  try {
    return resolvePermissionsForRoles(roleKeys, registry).includes(permission);
  } catch {
    return false;
  }
}
