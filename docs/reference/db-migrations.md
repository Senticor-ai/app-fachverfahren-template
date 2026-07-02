# Datenbankmigrationen

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für den Migrator (`packages/app-store-postgres`,
> `pnpm run db:migrate`, `dev/postgres.yaml`); PLAN für alles, was den
> BFF/Server voraussetzt (`dev:postgres`, `dev:all`, `test:e2e:postgres`) —
> diese Scripts existieren noch nicht, siehe
> `docs/reference/backend-fastify.md`.
> Quellen: `packages/app-store-postgres`, `AGENTS.md`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

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

## Lokale PostgreSQL-Instanz

Für lokale Entwicklung liefert das Repository `dev/postgres.yaml` statt einer
Compose-Datei. Das Manifest läuft mit Rancher Desktop auf containerd/k3s und mit
Docker Desktop, sobald Kubernetes aktiviert ist.

PostgreSQL wird über das Manifest gestartet und weitergeleitet, zum Beispiel:

```bash
kubectl apply -f dev/postgres.yaml
kubectl port-forward svc/postgres 5432:5432
```

(PLAN) Komfort-Scripts `dev:postgres` (Start + Port-Forward) und `dev:all`
(BFF, Vite und Port-Forwarding gemeinsam) gehören zur Backend-Zielarchitektur
und existieren noch nicht.

## Domain-Module (PLAN)

Fachverfahren legen eigene Migrationen unter
`modules/<domain>/migrations/` ab und referenzieren sie im
`domain.module.yaml` (Generator-Pfad, siehe `modules/README.md`). Die
Plattformmigrationen bleiben nur die administrative Basis.

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

## PostgreSQL-E2E (PLAN)

Zielbild: ein schneller E2E-Test mit `InMemoryAppStore` und ein
servicebasierter E2E-Test (`test:e2e:postgres` mit `APP_E2E_PG_URL` und
optional `APP_E2E_PG_DIRECT_URL`) gegen denselben Server-Pfad. Beides setzt
die Backend-Stufe voraus und existiert im Scaffold noch nicht.
