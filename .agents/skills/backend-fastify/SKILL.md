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

Die neutrale Web-Delivery-Runtime lebt im Paket **`@senticor/app-runtime-fastify`**
(`packages/app-runtime-fastify/`): SPA-Auslieferung (inkl. History-Fallback →
`index.html`), Health/Readiness, Runtime-Konfiguration, Security- und Cache-Header,
interne Metrics/Build-Info, Graceful Shutdown. `apps/fachverfahren/server/index.ts`
ist nur noch die dünne KOMPOSITION: App-Identität (`RuntimeConfigOverrides`),
Store-Konstruktion und Registrierung der App-Routen über die Registrar-Naht.

Öffentliche Bau-Funktionen (Paket; die App re-exportiert Wrapper mit App-Identität):

- `readRuntimeConfig(env, overrides)` — liest `STATIC_DIR`, Header-/Timeout-/Host-Politik aus der Umgebung; `overrides` trägt App-Identität (applicationId, displayName, Static-Dir-Fallback).
- `buildPublicServer({ config, state, metrics, registerRoutes })` — SPA + `GET /livez` · `/readyz` · `/startupz` · `/runtime-config.json`; `registerRoutes(app, context)` ist DIE Naht für App-Routen/Plugins/Guards.
- `buildInternalServer({ config, metrics, registerRoutes })` — `GET /internal/metrics` · `/internal/build-info` (NIE öffentlich routen).
- `startRuntime({ env, configOverrides, registerPublicRoutes, registerInternalRoutes, beforeListen })` — Dual-Port-Bootstrap + Shutdown; `beforeListen` = Platz für idempotente Startarbeit (z.B. Auto-Bootstrap).

Der Server-Build ist bewusst eng: `apps/fachverfahren/tsconfig.server.json` umfasst
nur `server/` (+ Paket-Referenzen). Server-Code importiert daher **nicht** direkt aus
`modules/` — gemeinsame DTOs laufen über einen expliziten Shared-/Paketvertrag, fachliche
Serverlogik bleibt im Domain-Modul und wird über einen expliziten Registrierungs-/Exportpfad
angebunden. Nach Änderungen am Runtime-Paket vor App-Tests IMMER
`pnpm --filter @senticor/app-runtime-fastify build` (vitest löst `@senticor/*` auf `dist/` auf).

## App-Daten

Benutzereinstellungen und Postfachdaten laufen über `AppStore`: PROD =
`@senticor/app-store-postgres` (`PostgresAppStore`, braucht `APP_PG_URL`/`APP_PG_DIRECT_URL`),
Tests = `InMemoryAppStore`. Die App startet ohne DB; fachliche App-Datenrouten geben ohne
Sitzung `401` (schema-gültiger Body zuerst, sonst `400`). RBAC serverseitig.

## Testen

- Runtime-Verhalten (Header, Static, Readiness, Nähte): `packages/app-runtime-fastify/src/servers.test.ts`.
- Kompositions-Test der App (Naht-Verdrahtung, App-Identität): `apps/fachverfahren/server/index.test.ts`.
- End-to-End gegen das **reale** Bundle (baut in `beforeAll`, prüft Persona-Routen + Liveness):
  `tests/e2e/personas.e2e.test.ts` via `vitest.e2e.config.ts`:

```bash
pnpm run test:e2e
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
