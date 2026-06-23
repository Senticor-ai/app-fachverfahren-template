# Backend mit Fastify

Das Template nutzt ein TypeScript-Fastify-Backend als BFF und Plattform-API.
Der SPA-Build bleibt austauschbar, aber der Serververtrag ist Fastify-first.

## Endpunkte

- `GET /livez`
- `GET /readyz`
- `GET /startupz`
- `GET /runtime-config.json`
- `GET /internal/metrics`
- `GET /api/openapi.json`
- Swagger UI: `/api/v1/docs`
- `GET /api/v1/me/preferences`
- `PUT /api/v1/me/preferences`
- `GET /api/v1/me/posteingang`
- `GET /api/v1/me/ausgang`
- `GET /api/v1/work/posteingang`
- `GET /api/v1/work/ausgang`

`/internal/metrics` darf nicht öffentlich geroutet werden. Readiness darf
kritische Abhängigkeiten prüfen; Liveness darf das nicht.

## OpenAPI

Route-Schemas sind die Quelle für OpenAPI. Neue Plattformrouten liegen unter
`apps/fachverfahren-template/server/routes/`. Domain-spezifische Routen werden
aus `modules/<domain>/server/` registriert und behalten ihre eigenen
Permissions, Events und Compliance-Hinweise im Domain-Manifest.

Der Server-Build ist absichtlich eng geschnitten:
`apps/fachverfahren-template/tsconfig.server.json` umfasst nur `server/` und
`shared/`. Server-Code importiert deshalb nicht direkt aus `modules/`. Gemeinsame
DTOs gehören nach `shared/`, fachliche Serverlogik bleibt im Domain-Modul und
wird über einen expliziten Registrierungs- oder Paketexportpfad angebunden.

## App-Daten

Benutzereinstellungen und Postfachdaten laufen über `AppStore`. In Produktion
stellt `@senticor/app-store-postgres` den `PostgresAppStore`; Tests injizieren
`InMemoryAppStore`. Die App startet ohne Datenbank, aber die App-Datenendpunkte
benötigen im produktiven Betrieb `APP_PG_URL` oder `APP_PG_DIRECT_URL`.
Im Kubernetes-Basisprofil liest der Web-Workload `APP_PG_URL` aus
`app-postgresql/pooled-url`; der `migrator`-Job nutzt bevorzugt
`APP_PG_DIRECT_URL` aus `app-postgresql/direct-url`.

Die Endpunkte geben ohne Sitzung `401` zurück. Rollen werden serverseitig über
die RBAC-Registry geprüft: Bürgerinnen und Bürger lesen nur eigene Postfächer,
Sachbearbeitung liest den behördlichen Posteingang und Ausgang.
`pnpm run test:e2e:postgres` validiert diese Endpunkte gegen einen echten
PostgreSQL-Dienst mit vorher ausgeführten Migrationen.
