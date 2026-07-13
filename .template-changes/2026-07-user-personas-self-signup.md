---
bump: minor
updateMode: auto
migration: none
---

Per-User-ARBEITSBEREICHE (Personas buerger|sachbearbeitung|aufsicht) als
Konto-Daten, fail-closed und OIDC-ready: neue Spalten `local_personas`,
`oidc_personas`, `persona_management_mode`, `principal_version` auf
`app_users` (Migration `20260713000000_user_personas`, NULL-Legacy-Marker:
Bestandskonten erhalten alle drei, NEUE Konten starten leer — jede Anlage
entscheidet explizit). Der Rollen-Wechsler und die Landing zeigen nur noch
zugewiesene Arbeitsbereiche (bei ≤1 kein Wechsler); Deep-Links auf fremde
Sichten leitet `RequirePersonaExperience` um (Navigation, KEINE
Autorisierung). Null Arbeitsbereiche ist gültig (Landing-Hinweis).

Sicherheits-relevante VERHALTENSÄNDERUNGEN für Konsumenten:

- **Boards-API verlangt jetzt `boards.collaborate`** (vorher nur
  „eingeloggt") — nötig, weil Self-Signup-Konten (`workspaceRole=citizen`,
  keine Permissions) existieren können.
- **EINE Autorisierungs-Pipeline**: Routen deklarieren ihre Policy als
  Route-Config (`routeAuth` in `auth/authorization.ts`); eine
  `/auth`-/`/api`-Route OHNE Policy bricht den Server-Start. Eigene
  Konsumenten-Routen müssen klassifiziert werden.
- `GET /auth/session` liefert den erweiterten Principal (`workspaceRole` +
  deprecated Alias `role`, `personas`, `personaManagementMode`,
  `principalVersion`, `tenantId`, `identity`, `account`); `GET /auth/status`
  meldet `sessionSchemaVersion`, `capabilities.userPersonas` und
  `registration`.
- Admin-Users-API: `personas` ist PFLICHT beim Anlegen; PATCH ist atomar
  (`updateUserAccess`, Status und/oder Personas, `If-Match` → 409 bei
  Konflikt, 409 bei `oidc_authoritative`).
- **Self-Signup** `POST /auth/register` (Default AUS;
  `AUTH_REGISTRATION_MODE=open_unverified` schaltet frei): citizen-Konto mit
  Arbeitsbereich buerger, neutrale Anti-Enumeration-Antwort ohne Auto-Login,
  Tenant nur aus dem Deployment-Kontext, Rate-Limiter-Interface (In-Memory-
  Default trägt nur Single-Process).
- OIDC-Nahtstellen ohne OIDC-Flow: Claim-Vertrag `senticor_personas`
  (Parser + Zustands-Semantik in `auth/external-personas.ts`, authoritative
  - fehlender Claim = Login-Ablehnung), idempotenter Voll-Set-Sync über
    `updateUserAccess` (No-op bumpt nichts).

Propagation: Store (`packages/app-store-postgres`), Migration und
`apps/*/server/**` sind update-verwaltet (replace) und kommen per
`template:update`; Client (`apps/*/src/**`) und Admin-UI sind NICHT
update-verwaltet — Bestandskonsumenten erhalten das Client-Erlebnis per
Re-Scaffold oder manuelle Übernahme. Alter Client + neuer Server bleibt
funktionsfähig (Capability-gesteuerter Legacy-Fallback im neuen Client;
alte Clients ignorieren die neuen Felder). Details: `docs/reference/rbac.md`.
