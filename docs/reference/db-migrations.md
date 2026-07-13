# Datenbankmigrationen

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für Migrator, `dev/postgres.yaml`, Domain-API und
> PostgreSQL-E2E-Verträge; PLAN für die Komfortskripte `dev:postgres` und
> `dev:all`.
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

## PostgreSQL-E2E

`pnpm run test:e2e:postgres` führt denselben CaseStore- und Domain-API-Vertrag
gegen `InMemoryAppStore` sowie – bei gesetztem `APP_PG_URL` oder
`APP_PG_DIRECT_URL` – gegen PostgreSQL aus. Die Migrationen müssen vorher mit
`pnpm run db:migrate` angewendet sein.

`pnpm run test:e2e:server` ist die attended Stufe: Sie startet den gebauten
Server, fährt reale HTTP-Aufrufe und prüft anschließend den Datenbankzustand.
Sie benötigt `APP_PG_DIRECT_URL`, `psql` und `curl`.

## Babelfish als Migrationsbrücke

Babelfish ist kein Greenfield-Default. Jede Nutzung braucht
T-SQL-Kompatibilitätsanalyse, ein Inventar von Stored Procedures, Jobs und
Integrationen, einen Portability Score, eine Zielarchitektur für natives
PostgreSQL, ein Sunset-Datum sowie Reconciliation- und Rollback-Tests.

Die Migration muss beweisen, dass die Legacy-Anwendung während der
Übergangsphase läuft und die Daten später exportiert und nativ in PostgreSQL
betrieben werden können.
