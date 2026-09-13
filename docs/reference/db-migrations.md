# Datenbankmigrationen

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für den Migrator (`packages/app-store-postgres`,
> `pnpm run db:migrate`, `dev/postgres.yaml`), für den BFF
> (`packages/app-bff-fastify`) und für die Testläufe `pnpm run test:pg` und
> `pnpm run test:e2e`. Die Scripts `dev:postgres` und `dev:all` existieren
> weiterhin NICHT, siehe `docs/reference/backend-fastify.md`.
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

**Die Wahrheit sind die 15 Plattformmigrationen unter
`packages/app-store-postgres/migrations/`** — von `app_foundation`
(2026-06-23) bis `evidence_ledger` (2026-07-28). Diese Liste nennt die
Gruppen, nicht ihren Inhalt; wer Details braucht, liest das Verzeichnis:

- **Fundament + Präferenzen + Postfach + RBAC**: `app_user_preferences`
  (Heller/Dunkler/System-Modus, Barrierefreiheitspräferenzen je `tenant_id`
  und `actor_id`), `app_rbac_*` (rollenbasierter Zugriff für `citizen` und
  `caseworker`), `app_mailbox_messages` (fachneutraler Posteingang/Ausgang).
- **Konten, lokale Anmeldung, Arbeitsbereiche**: `app_users`, `local_auth`,
  `user_personas`, `personas_open`.
- **Kanban-Boards** des Sachbearbeitungs-Workspace.
- **Workspace-Fundament** (Workspace-Rollen `admin`/`member`).
- **Aufgaben** (`app_tasks`).
- **Audit** — append-only plus Hash-Kette.
- **Falldaten und Eigentümerschaft** (`case_data`, `case_owner`).
- **Verfahrens-Wissen** (append-only `app_verfahren_wissen`).
- **Evidence-Ledger** (hash-verkettet).

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

## PostgreSQL-Integration (IST)

`pnpm run test:pg` fährt die Store-Tests von `@senticor/app-store-postgres`
gegen ein ECHTES PostgreSQL: `vitest.pg.config.ts` startet den Dienst über
testcontainers (`tests/pg/global-setup.ts`). Ohne laufendes Docker überspringt
der Lauf, statt rot zu werden. Der schnelle, hermetische Pfad bleibt
`pnpm run test` (mit `InMemoryAppStore`) und `pnpm run test:e2e` (reales
Bundle). Ein Script `test:e2e:postgres` existiert nicht.
