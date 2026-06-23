# Backend Fastify Skill

Nutze diese Anleitung für Backend-Änderungen an der Vorlage.

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
- Fachlogik gehört in Domain-Module, nicht in Plattformrouten.
- Fehlerantworten geben `requestId` aus, aber keine internen Hostnamen,
  Secrets oder Providerdetails.
- Fastify validiert Request-Bodies vor dem Route-Handler. Tests für `401`
  müssen einen schema-gültigen Body senden, sonst kommt zuerst `400`.
- Migrationslogik läuft über den `migrator`-Workload und
  `@senticor/app-store-postgres`.
