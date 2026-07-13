# Backend mit Fastify

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für Web-Delivery-Runtime, Domain-API, App-Daten und E2E-Tests;
> PLAN ausschließlich für eine veröffentlichte OpenAPI-Beschreibung.
> Quellen: `apps/fachverfahren/server/`, `package.json`,
> `scripts/e2e-domain-api.sh`, `AGENTS.md`.
> Pflicht-Lektüre vorher: `AGENTS.md`,
> `.agents/skills/backend-fastify/SKILL.md`.

Das Template nutzt einen TypeScript-Fastify-Server als Web-Delivery-Runtime.
Der SPA-Build bleibt austauschbar, aber Health, Runtime-Konfiguration,
Security-Header, Cache-Header und interne Betriebsendpunkte sind Fastify-first.

## Endpunkte

- `GET /livez`
- `GET /readyz`
- `GET /startupz`
- `GET /runtime-config.json`
- `GET /internal/metrics`
- `GET /internal/build-info`

`/internal/metrics` darf nicht öffentlich geroutet werden. Readiness darf
kritische Abhängigkeiten prüfen; Liveness darf das nicht.

## Plattform- und Domain-Routen

`apps/fachverfahren/server/domain-api.ts` registriert die server-autoritative
Domain-API. Sie umfasst insbesondere Vorgänge und Übergänge, Audit,
Arbeitsaufgaben und Eingang, Automationsregeln, Benachrichtigungen, Wiki,
Kommentare, Aktivität, gespeicherte Ansichten, Relationen und assistive
KI-Aktionen. Der Mandanten- und Behörden-Scope kommt aus der Sitzung, nicht aus
Request-Body oder Query.

Mutierende Routen erzwingen Schema-Validierung, Permissions, optimistisches
Locking und – bei kritischen Übergängen – das Vier-Augen-Prinzip. Eine
veröffentlichte OpenAPI-Beschreibung dieser Routen ist weiterhin PLAN.

Der Server-Build ist absichtlich eng geschnitten:
`apps/fachverfahren/tsconfig.server.json` umfasst nur `server/`. Server-Code
importiert deshalb nicht direkt aus `modules/`. Der vorhandene `ModuleHost`
kann explizit übergebene Moduldefinitionen mounten; im Scaffold existiert aber
keine Modulinstanz. Gemeinsame DTOs gehören in einen Shared- oder Paketvertrag.

## App-Daten

Benutzereinstellungen und Postfachdaten laufen über `AppStore`. In Produktion
stellt `@senticor/app-store-postgres` den `PostgresAppStore`; Tests injizieren
`InMemoryAppStore`. Die App startet ohne Datenbank, aber die App-Datenendpunkte
benötigen im produktiven Betrieb `APP_PG_URL` oder `APP_PG_DIRECT_URL`.
Im Kubernetes-Basisprofil liest der Web-Workload `APP_PG_URL` aus
`app-postgresql/pooled-url`; der `migrator`-Job nutzt bevorzugt
`APP_PG_DIRECT_URL` aus `app-postgresql/direct-url`.

Fachliche App-Datenendpunkte geben ohne Sitzung `401` zurück. Rollen werden
serverseitig über die RBAC-Registry geprüft: Bürgerinnen und Bürger lesen nur
eigene Postfächer, Sachbearbeitung liest den behördlichen Posteingang und
Ausgang.

Fastify validiert den Request-Body vor dem Route-Handler. Tests, die `401`
erwarten, müssen deshalb einen schema-gültigen Body senden; ein ungültiger Body
liefert zuerst `400`.

Die vorhandenen E2E-Stufen sind:

- `pnpm run test:e2e`: baut das reale SPA und prüft Persona- und Health-Routen
  per Fastify `inject()`.
- `pnpm run test:e2e:postgres`: führt Domain-API- und Store-Verträge aus;
  PostgreSQL-Fälle laufen, wenn `APP_PG_URL` oder `APP_PG_DIRECT_URL` gesetzt
  und die Migrationen ausgeführt sind.
- `pnpm run test:e2e:server`: startet den gebauten Server gegen einen echten,
  migrierten PostgreSQL-Dienst und prüft den HTTP-Roundtrip. Dieser attended
  Test benötigt zusätzlich `psql` und `curl`.
