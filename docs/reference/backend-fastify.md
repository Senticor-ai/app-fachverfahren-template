# Backend mit Fastify

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für die neutrale Web-Delivery-Runtime in
> `packages/app-runtime-fastify` (komponiert unter
> `apps/fachverfahren/server/`); fachliche API-, OpenAPI-, App-Daten- und
> Postgres-E2E-Routen bleiben explizite Ausbauschritte.
> Quellen: Architekturentscheidungen dieses Templates, `AGENTS.md`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

Das Template nutzt einen TypeScript-Fastify-Server als Web-Delivery-Runtime.
Der SPA-Build bleibt austauschbar, aber Health, Runtime-Konfiguration,
Security-Header, Cache-Header und interne Betriebsendpunkte sind Fastify-first.

Die neutrale Runtime lebt als wiederverwendbares Paket in
`packages/app-runtime-fastify` (`@senticor/app-runtime-fastify`):
Runtime-Config, Dual-Port-Server (public/internal), Health, Static/SPA,
Security-Header, Metrics, Logging, Graceful Shutdown.
`apps/fachverfahren/server/index.ts` ist die dünne Komposition darüber:
App-Identität (`RuntimeConfigOverrides`), Store-Konstruktion und
App-Routen-Registrierung über die Registrar-Naht
(`registerRoutes(app, context)` bzw. `startRuntime({ registerPublicRoutes,
registerInternalRoutes, beforeListen })`).

## Endpunkte

- `GET /livez`
- `GET /readyz`
- `GET /startupz`
- `GET /runtime-config.json`
- `GET /internal/metrics`
- `GET /internal/build-info`
- `GET /internal/openapi.json`

`/internal/*` darf nicht öffentlich geroutet werden. Readiness darf
kritische Abhängigkeiten prüfen; Liveness darf das nicht.

### Fachliche BFF-Routen (`@senticor/app-bff-fastify`, public Port)

- `GET /api/session` — SDK-RBAC-Sicht der Sitzung (`session.read`)
- `GET /api/capabilities` — aufgelöste Permissions (`session.read`)
- `GET /api/preferences` / `PUT /api/preferences` —
  `preferences.read` / `preferences.write`
- `GET /api/mailbox?box=inbox|outbox&scope=own|authority` —
  `mailbox.own.read` bzw. `mailbox.authority.read`
- `POST /api/mailbox` — `mailbox.own.write` bzw. `mailbox.authority.write`

Verträge (TypeBox-DTOs, Fehler-Envelope `{ error, requestId? }`) liegen in
`@senticor/app-bff-contracts`; Statuscodes: 401 ohne Sitzung, 403 bei
verweigerter Permission (beides mit `SecurityEvent` über die `AuditSink`),
400 bei ungültiger Eingabe, 503 ohne erreichbaren `AppStore`. Schreibpfade
emittieren `AppDataAuditEvent`s. Das OpenAPI-Dokument wird auf dem public
Server gesammelt (Collector VOR den BFF-Routen registrieren!) und NUR intern
ausgeliefert; `scripts/check-openapi.mjs` hält den Snapshot
(`schemas/openapi.internal.json`) im Gleichschritt.

## Plattform- und Domain-Routen

Die Runtime (`@senticor/app-runtime-fastify`, komponiert in
`apps/fachverfahren/server/`) liefert den Web-Delivery-Vertrag: SPA, Health,
Runtime-Konfiguration, Security-Header, Cache-Header, Metrics und Build-Info.
Plattform- oder Domain-APIs werden als explizite Fastify-Routen über die
Registrar-Naht ergänzt und behalten ihre Permissions, Events und
Compliance-Hinweise im Domain-Manifest.

Der Server-Build ist absichtlich eng geschnitten:
`apps/fachverfahren/tsconfig.server.json` umfasst nur `server/`. Server-Code
importiert deshalb nicht direkt aus `modules/`. Gemeinsame DTOs gehören nach
einem expliziten Shared- oder Paketvertrag, fachliche Serverlogik bleibt im
Domain-Modul und wird über einen expliziten Registrierungs- oder Paketexportpfad
angebunden.

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

Ein Script `test:e2e:postgres` ist weiterhin ein Ausbauschritt für fachliche
App-Datenrouten gegen einen echten PostgreSQL-Dienst mit vorher ausgeführten
Migrationen.
