---
bump: minor
updateMode: review
migration: 2026-07-bff-runtime-packages
---

Extrahiert die Fastify-Runtime in wiederverwendbare Pakete
(@senticor/app-runtime-fastify, @senticor/app-bff-contracts,
@senticor/app-bff-fastify): neutrale Web-Delivery-Runtime mit
Registrar-Naehten, TypeBox-Wire-Vertraege und BFF-Routen
(/api/session, /api/capabilities, /api/preferences, /api/mailbox) mit
SDK-RBAC-Durchsetzung, AuditSink-/SessionResolver-Naht, intern
ausgeliefertem OpenAPI-Dokument (Snapshot-Gate check:openapi) und
Prozess-Rauchtest smoke:runtime. Template-verwaltete Pfade (packages/**,
apps/\*/server/**, scripts/check-*.mjs, schemas/**) kommen ueber
template:update; die Migration ergaenzt die konsumenten-eigene Verdrahtung
(Workspace-Deps, tsconfig-Referenzen, vitest-Aliase, Dockerfile-COPYs,
Catalog-Eintraege, CI-Schritte).
