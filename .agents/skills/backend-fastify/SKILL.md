---
name: backend-fastify
description: Understand and extend the Fastify web-delivery runtime under apps/fachverfahren/server/ (SPA serving, health/readiness, runtime config, security + cache headers, internal metrics, app-data via AppStore). Use when adding server routes, wiring platform/domain APIs, or writing server/e2e tests.
---

# Backend mit Fastify

Nutze diese Anleitung, wenn ein Agent den **Web-Delivery-Server** unter
`apps/fachverfahren/server/` versteht, erweitert oder testet.

> Pflicht-Lektüre: [`docs/reference/backend-fastify.md`](../../../docs/reference/backend-fastify.md)
> (Endpunkte, Betriebsvertrag, App-Daten/Postgres) und `AGENTS.md`.

## Was der Server liefert (IST)

Ein TypeScript-Fastify-Server als neutrale Web-Delivery-Runtime: SPA-Auslieferung
(inkl. History-Fallback → `index.html`), Health/Readiness, Runtime-Konfiguration,
Security- und Cache-Header, interne Metrics/Build-Info.

Öffentliche Bau-Funktionen (`apps/fachverfahren/server/index.ts`):

- `readRuntimeConfig(env)` — liest `STATIC_DIR`, Header-/Timeout-/Host-Politik aus der Umgebung.
- `buildPublicServer({ config, state })` — SPA + `GET /livez` · `/readyz` · `/startupz` · `/runtime-config.json`.
- `buildInternalServer({ config, metrics })` — `GET /internal/metrics` · `/internal/build-info` (NIE öffentlich routen).

Der Server-Build ist bewusst eng: `apps/fachverfahren/tsconfig.server.json` umfasst
nur `server/`. Server-Code importiert daher **nicht** direkt aus `modules/` — gemeinsame
DTOs laufen über einen expliziten Shared-/Paketvertrag, fachliche Serverlogik bleibt im
Domain-Modul und wird über einen expliziten Registrierungs-/Exportpfad angebunden.

## App-Daten

Benutzereinstellungen und Postfachdaten laufen über `AppStore`: PROD =
`@senticor/app-store-postgres` (`PostgresAppStore`, braucht `APP_PG_URL`/`APP_PG_DIRECT_URL`),
Tests = `InMemoryAppStore`. Die App startet ohne DB; fachliche App-Datenrouten geben ohne
Sitzung `401` (schema-gültiger Body zuerst, sonst `400`). RBAC serverseitig.

## Testen

- Unit gegen synthetisches `STATIC_DIR` + `app.inject()`: `apps/fachverfahren/server/index.test.ts`.
- End-to-End gegen das **reale** Bundle (baut in `beforeAll`, prüft Persona-Routen + Liveness):

```bash
pnpm run test:e2e        # tests/e2e/personas.e2e.test.ts (vitest.e2e.config.ts)
```

Nach jeder Änderung an der Austausch-Naht zusätzlich den Vertrag erneuern:

```bash
pnpm --filter @senticor/fachverfahren emit:contract
pnpm run check:leistung-contract
```

## Grenzen

Fachliche API-, OpenAPI- und Postgres-E2E-Routen (`test:e2e:postgres`) bleiben
explizite Ausbauschritte — hier keine Domänenlogik erfinden, sondern als
Fastify-Route mit Permissions/Events/Compliance im Domain-Manifest ergänzen.
