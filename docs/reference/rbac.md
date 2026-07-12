# Rollen und RBAC

Der erste RBAC-Vertrag lebt in `@senticor/public-sector-sdk`.
Code-Bezeichner bleiben Englisch; deutsche Rollenbezeichnungen sind
Anzeige- und Dokumentationscopy.

## Workspace-Rollen (`app_users.role`)

Die laufende Anwendung nutzt für den Mitarbeiter-Workspace (Boards,
Benutzerverwaltung, Audit, Export) ein schlankes, produktives Rollenmodell
direkt am Benutzerkonto: `admin` und `member`. Routen prüfen **nie**
Rollen-Literale, sondern immer Workspace-Permissions
(`apps/fachverfahren/server/auth/workspace-permissions.ts`):

| Permission           | admin | member |
| -------------------- | ----- | ------ |
| `users.manage`       | ✅    | —      |
| `boards.manage`      | ✅    | —      |
| `boards.collaborate` | ✅    | ✅     |
| `audit.read`         | ✅    | —      |
| `tenant.export`      | ✅    | —      |

Feinere Rollen (Sachbearbeiter, Teamleiter, Fachadministrator, Revision)
entstehen später ausschließlich durch Erweiterung dieses Mappings — ohne
Routen-Refactoring. Abgrenzung: die SDK-RBAC-Registry unten (citizen/
caseworker + `app_rbac_*`-Tabellen) ist der Vertrag für fachliche
Domain-Permissions und bewusst noch nicht mit dem Workspace verdrahtet;
`app_users.role` ist die heutige Wahrheit für Workspace-Zugriffe.

## Eingebaute Rollen

| Code-Rolle   | Anzeige         | Zweck                                                    |
| ------------ | --------------- | -------------------------------------------------------- |
| `citizen`    | Bürgerin/Bürger | Eigene Sitzung, Einstellungen, Posteingang und Ausgang   |
| `caseworker` | Sachbearbeitung | Behördlicher Posteingang/Ausgang und Vorgangsbearbeitung |

`caseworker` ist der technische Rollen-Key für Sachbearbeiterinnen und
Sachbearbeiter.

Die UI-Rolle ist keine Autorisierung. Fastify-Routen prüfen serverseitig gegen
Permissions aus der RBAC-Registry.

## Wichtige Permissions

- `preferences.read`
- `preferences.write`
- `mailbox.own.read`
- `mailbox.authority.read`
- `case.read`
- `case.decision.prepare`

## Neue Rollen ergänzen

Neue Rollen werden nicht als verstreute `if`-Bedingungen eingeführt. Vorgehen:

1. Rolle mit `extendRbacRegistry(...)` registrieren.
2. Rolle in einer Migration in `app_rbac_roles` eintragen.
3. Permissions in `app_rbac_permissions` und `app_rbac_role_permissions`
   verknüpfen.
4. Actor-Zuordnungen in `app_actor_roles` schreiben.
5. API- und Storybook-Tests für erlaubte und verbotene Pfade ergänzen.

Domain-Module (Generator-Pfad, PLAN) dürfen eigene Permissions definieren,
müssen sie aber im `domain.module.yaml` und in Migrationen nachvollziehbar
machen.
