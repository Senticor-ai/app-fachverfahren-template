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
  // ── Bürger-Sicht auf EIGENE Vorgänge ──────────────────────────────────────────────────────────
  // Bewusst EIGENE Permissions statt `case.read` für die Bürgerrolle: `case.read` ist die
  // BEHÖRDEN-Sicht und listet alle Vorgänge der Behörde — sie an Bürger:innen zu geben wäre ein
  // Totalverlust. Namens- und Schnittmuster folgen `mailbox.own.*` (die Präzedenz für „nur meins").
  // Lesen und Einreichen sind GETRENNT: ein Schreibrecht darf nie auf einem Leserecht mitreiten.
  caseOwnRead: {
    permission: "case.own.read",
    description: "Eigene Vorgänge lesen",
  },
  caseOwnSubmit: {
    permission: "case.own.submit",
    description: "Eigenen Antrag einreichen",
  },
  // ── KI-Assistenz (assistiv, HCAI) ─────────────────────────────────────────────────────────────
  // Die Sachbearbeitung darf KI-VORSCHLÄGE anfordern (Triage, Vollständigkeit, Zusammenfassung).
  // Die KI entscheidet NIE rechtsnah; jeder Vorschlag trägt reviewRequired=true (serverseitig erzwungen,
  // Vier-Augen). Eine EIGENE Permission (nicht `case.read`), damit KI-Nutzung getrennt entziehbar ist.
  aiAssist: {
    permission: "ai.assist",
    description: "KI-Assistenz (Vorschläge) anfordern",
  },
  // ── Aktenvermerk (append-only, attribuierbar Mensch/KI) ──────────────────────────────────────────
  // Einen unveränderlichen Aktenvermerk an einen Fall schreiben (Mensch ODER KI-Entwurf). EIGENE
  // Permission, getrennt von `case.decision.prepare`: Vermerke dokumentieren, sie entscheiden nicht —
  // ein Recht zu vermerken darf nicht auf dem Entscheidungs-Vorbereitungsrecht mitreiten.
  caseNoteWrite: {
    permission: "case.note.write",
    description: "Aktenvermerk an einen Fall schreiben",
  },
  // ── Zahlung/Gebühr (ePayBL-Naht) ──────────────────────────────────────────────────────────────
  // Eine Gebühr/Zahlung für den EIGENEN Vorgang veranlassen und ihren Status prüfen. EIGENE Permission
  // (nicht `case.own.submit`): Zahlen ist getrennt vom Einreichen — ein Zahlungsrecht reitet nie auf dem
  // Einreichen mit. Bürger:innen zahlen ihre Gebühr; die Behörde sieht den Zahlstatus über die Fall-Sicht.
  paymentInitiate: {
    permission: "payment.initiate",
    description:
      "Zahlung/Gebühr für einen eigenen Vorgang veranlassen und prüfen",
  },
  // ── Bescheid-Zustellung (De-Mail/eBO-Naht) ──────────────────────────────────────────────────────
  // Einen Bescheid rechtssicher ZUSTELLEN + den Zustellstatus prüfen (VwZG · De-Mail/eBO). EIGENE
  // Permission, getrennt vom behördlichen Postfach (mailbox.authority.*): Zustellen ist eine hoheitliche
  // Außenwirkung (Zustellfiktion), nicht das interne Nachrichtenfach. Nur die Sachbearbeitung stellt zu.
  bescheidVersand: {
    permission: "bescheid.versand",
    description:
      "Einen Bescheid rechtssicher zustellen und den Zustellstatus prüfen",
  },
  // ── Register-/Nachweis-Abruf (Once-Only · NOOTS/EvidenceRetrieval) ───────────────────────────────
  // Einen Nachweis aus einem Register abrufen, damit die Bürger:in ihn NICHT erneut einreichen muss
  // (Once-Only-Prinzip). Zweckgebunden. EIGENE Permission: der Register-Abruf ist eine eigene
  // datenschutzrelevante Handlung, getrennt vom Lesen des Vorgangs (case.read).
  registerAbruf: {
    permission: "register.abruf",
    description:
      "Nachweis aus einem Register abrufen (Once-Only, zweckgebunden)",
  },
  // ── DSGVO-Löschung (Art. 17 / §84 SGB X) ─────────────────────────────────────────────────────────
  // Personenbezogene Felder eines Falls löschen (referenzielle Redaction → Tombstone) + die Löschung
  // append-only protokollieren. EIGENE, eng gefasste Permission — bewusst getrennt von
  // `case.decision.prepare`: eine Löschung ist eine datenschutzrechtliche Handlung, kein
  // Bearbeitungsschritt, und darf nie auf dem Entscheidungs-Vorbereitungsrecht mitreiten. Der
  // eingefrorene Bescheid-VA (Audit-payload) ist strukturell ausgenommen; nur `case.data` wird redigiert.
  casePiiErase: {
    permission: "case.pii.erase",
    description:
      "Personenbezogene Falldaten löschen (DSGVO Art. 17 / §84 SGB X)",
  },
  // ── Legal Hold (Löschsperre) ─────────────────────────────────────────────────────────────────────
  // Einen Fall unter Löschsperre stellen bzw. sie aufheben (Beweissicherung, laufender Rechtsstreit,
  // Ermittlung). EIGENE Permission, bewusst GETRENNT von `case.pii.erase`: die Sperre BEGRENZT das
  // Löschrecht — sie darf nicht auf dem Löschrecht selbst mitreiten (sonst hebt der Löschende seine
  // eigene Sperre auf). Ein aktiver Legal Hold blockiert die DSGVO-Löschung.
  caseLegalHold: {
    permission: "case.legal-hold",
    description: "Einen Fall unter Löschsperre stellen oder sie aufheben",
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
        // NUR die eigenen Vorgänge — NIE `case.read` (das ist die Behörden-Sicht über ALLE Fälle).
        builtInPermissions.caseOwnRead,
        builtInPermissions.caseOwnSubmit,
        // Die eigene Gebühr veranlassen/prüfen (ePayBL-Naht) — getrennt vom Einreichen.
        builtInPermissions.paymentInitiate,
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
        // KI-Assistenz ist ein Sachbearbeitungs-Werkzeug (Bürger:innen erhalten sie in dieser Scheibe nicht).
        builtInPermissions.aiAssist,
        // Aktenvermerke schreiben (Mensch-Vermerk + KI-Vermerk-Entwurf am Fall).
        builtInPermissions.caseNoteWrite,
        // Bescheide rechtssicher zustellen (De-Mail/eBO) — hoheitliche Außenwirkung.
        builtInPermissions.bescheidVersand,
        // Nachweise aus Registern abrufen (Once-Only) — die Bürger:in reicht nicht doppelt ein.
        builtInPermissions.registerAbruf,
        // Personenbezogene Falldaten auf Löschverlangen redigieren (DSGVO Art. 17 / §84 SGB X).
        builtInPermissions.casePiiErase,
        // Löschsperre setzen/aufheben (Beweissicherung) — begrenzt das Löschrecht, reitet nicht darauf mit.
        builtInPermissions.caseLegalHold,
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
