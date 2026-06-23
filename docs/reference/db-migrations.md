# Datenbankmigrationen

Migrationen laufen als kontrollierter Kubernetes-Job im `migrator`-Workload.
Sie werden nicht beim Start jeder Web-Replik automatisch ausgeführt.

## Paket

`packages/app-store-postgres` enthält den Basismigrator für PostgreSQL:

- timestamped Migrationen
- Checksum-Drift-Erkennung
- Advisory Lock
- Migrationstabelle `app_schema_migrations`
- Ablehnung bekannter PgBouncer-/Pooler-URLs ohne Direct-URL
- Plattformtabellen für Vorgangsbasis, Audit, RBAC, Benutzereinstellungen und
  Posteingang/Ausgang

```bash
APP_PG_DIRECT_URL=postgres://app:app@postgres:5432/app \
pnpm run db:migrate
```

## Domain-Module

Fachverfahren legen eigene Migrationen unter
`modules/<domain>/migrations/` ab und referenzieren sie im
`domain.module.yaml`. Die Plattformmigrationen bleiben nur die administrative
Basis.

## Plattformdaten

Die erste Plattformmigration liefert:

- `app_user_preferences`: Heller/Dunkler/System-Modus sowie
  Barrierefreiheitspräferenzen je `tenant_id` und `actor_id`.
- `app_rbac_roles`, `app_rbac_permissions`, `app_rbac_role_permissions` und
  `app_actor_roles`: rollenbasierter Zugriff für `citizen` und `caseworker`.
- `app_mailbox_messages`: fachneutraler Posteingang und Ausgang für Bürgerinnen
  und Bürger sowie Sachbearbeitung.

Produktionsbetrieb nutzt `PostgresAppStore` aus `@senticor/app-store-postgres`.
Integrationstests nutzen `InMemoryAppStore`, damit dieselben API-Verträge ohne
laufende Datenbank testbar bleiben.

## Laufzeitbindung

- Web-Workload: `APP_PG_URL` aus `app-postgresql/pooled-url` für
  Benutzereinstellungen, RBAC-geschützten Posteingang und Ausgang.
- Migrator-Job: `APP_PG_DIRECT_URL` aus `app-postgresql/direct-url`, damit
  Migrationen nicht über PgBouncer oder andere Pooler laufen.

Neue Tabellen müssen mandantenfähig bleiben: `tenant_id`, `authority_id` und
`jurisdiction_id` sind getrennte Konzepte und dürfen nicht in einem losen
Gemeindeschlüssel zusammenfallen.

## PostgreSQL-E2E

Der schnelle E2E-Test nutzt `InMemoryAppStore`. Der servicebasierte E2E-Test
nutzt denselben Fastify-Pfad gegen PostgreSQL:

```bash
APP_E2E_PG_URL=postgres://app:app@localhost:5432/app \
APP_E2E_PG_DIRECT_URL=postgres://app:app@localhost:5432/app \
pnpm run test:e2e:postgres
```

Der Test führt die Plattformmigrationen aus, schreibt fachneutrale
Postfach-Fixtures über `PostgresAppStore.saveMailboxMessage(...)` und prüft
helle/dunkle Darstellung, Barrierefreiheitspräferenzen, Posteingang, Ausgang
und RBAC-Grenzen.
