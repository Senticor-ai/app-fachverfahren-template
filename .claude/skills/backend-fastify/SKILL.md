# Backend Fastify Skill

Nutze diese Anleitung fuer Backend-Aenderungen an der Vorlage.

## Backend-Vertrag

- Fastify ist der BFF-/Backend-Standard.
- Route-Schemas sind die OpenAPI-Quelle.
- OpenAPI JSON liegt unter `/api/openapi.json`.
- Swagger UI liegt unter `/api/v1/docs`.
- Betriebsendpunkte bleiben getrennt:
  - `/livez`
  - `/readyz`
  - `/startupz`
  - `/internal/metrics`

## Umsetzung

- Neue Routen liegen unter `apps/fachverfahren-template/server/routes/`.
- Fachlogik gehoert in Domain-Module, nicht in Plattformrouten.
- Fehlerantworten geben `requestId` aus, aber keine internen Hostnamen,
  Secrets oder Providerdetails.
- Migrationslogik laeuft ueber den `migrator`-Workload und
  `@senticor/app-store-postgres`.
