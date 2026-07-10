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
  mailboxAuthorityRead: {
    permission: "mailbox.authority.read",
    description: "Behördlichen Posteingang und Ausgang lesen",
  },
  caseRead: {
    permission: "case.read",
    description: "Vorgänge lesen",
  },
  casePrepareDecision: {
    permission: "case.decision.prepare",
    description: "Entscheidung vorbereiten",
  },
  // ── Verfahrensübergreifende Management-Ebene (PM-Upgrade): Aufgaben/Board/Inbox/Vermerke/Ansichten/Automation/KI.
  //    Ohne diese Grants wären die /api/tasks · /api/inbox · /api/automations · /api/views-Routen in PROD tot (403).
  taskRead: { permission: "task.read", description: "Aufgaben lesen" },
  taskWrite: {
    permission: "task.write",
    description:
      "Aufgaben-Metadaten (Priorität/Zuweisung/Label/Board/Frist) ändern",
  },
  inboxRead: { permission: "inbox.read", description: "Triage-Eingang lesen" },
  inboxTriage: {
    permission: "inbox.triage",
    description: "Eingang annehmen/ablehnen/triagieren",
  },
  commentRead: {
    permission: "comment.read",
    description: "Interne Vermerke lesen",
  },
  commentWrite: {
    permission: "comment.write",
    description: "Internen Vermerk anlegen (append-only)",
  },
  viewRead: {
    permission: "view.read",
    description: "Gespeicherte Ansichten lesen",
  },
  viewWrite: {
    permission: "view.write",
    description: "Ansicht speichern/löschen",
  },
  viewShare: {
    permission: "view.share",
    description: "Ansicht als geteilt speichern (erhöhtes Recht)",
  },
  auditRead: {
    permission: "audit.read",
    description: "Append-only Audit eines Falls lesen",
  },
  automationRead: {
    permission: "automation.read",
    description: "Automations-Regeln und -Läufe lesen",
  },
  automationWrite: {
    permission: "automation.write",
    description: "Automations-Regeln anlegen/aktiv schalten/simulieren",
  },
  aiAssist: {
    permission: "ai.assist",
    description:
      "KI-Assistenz anfordern/übernehmen (assistiv, Mensch entscheidet)",
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
        builtInPermissions.caseRead,
        builtInPermissions.casePrepareDecision,
        // Management-Ebene (PM-Upgrade) — die Sachbearbeitung bedient Aufgaben/Board/Inbox/Vermerke/Ansichten/
        // Automation/KI-Assistenz. Reale Deployments können automation.write/view.share in eine erhöhte Rolle heben.
        builtInPermissions.taskRead,
        builtInPermissions.taskWrite,
        builtInPermissions.inboxRead,
        builtInPermissions.inboxTriage,
        builtInPermissions.commentRead,
        builtInPermissions.commentWrite,
        builtInPermissions.viewRead,
        builtInPermissions.viewWrite,
        builtInPermissions.viewShare,
        builtInPermissions.auditRead,
        builtInPermissions.automationRead,
        builtInPermissions.automationWrite,
        builtInPermissions.aiAssist,
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
