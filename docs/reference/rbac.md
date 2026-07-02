# Rollen und RBAC

Der erste RBAC-Vertrag lebt in `@senticor/public-sector-sdk`.
Code-Bezeichner bleiben Englisch; deutsche Rollenbezeichnungen sind
Anzeige- und Dokumentationscopy.

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
