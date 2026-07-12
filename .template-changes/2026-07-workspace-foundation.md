---
bump: minor
updateMode: review
migration: none
---

Secure Workforce Workspace (Template Runtime Foundation, PR 1): Workspace-
Rollen `admin`/`member` (`app_users.role`, DB-Migration
`20260712000000_workspace_foundation` inkl. Backfill: frühester Benutzer je
Tenant wird Admin), Permission-Modell statt Rollen-ifs (users.manage,
boards.manage, boards.collaborate, audit.read, tenant.export), admin-only
Benutzer-API `/api/v1/users` (Anlegen mit Initialpasswort + persönlichem
Starter-Board „Mein Board", Aktivieren/Deaktivieren mit sofortiger
Session-Revocation) samt UI `/admin/users`, Passwort-Änderung
`/auth/password`, Audit-Events für alle sicherheitsrelevanten Aktionen
(`app_audit_events` + `GET /api/v1/audit-events`), Identity-Links
(`app_identity_links`, Authentifizierung ≠ Autorisierung — OIDC-Naht
dokumentiert in docs/capabilities/identity-and-trust.md), Auto-Bootstrap
beim Serverstart über `AUTH_BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` (idempotent).

Verhaltensänderung für Bestandsdaten (deshalb review): das Bootstrap-
Discovery-Board wird per Backfill team-sichtbar und heißt jetzt
„Fachverfahren Discovery Board"; `GET /api/v1/boards` zeigt zusätzlich
team-sichtbare Boards des Tenants, Team-Boards sind für alle Mitglieder
kollaborierbar (Board-Verwaltung bleibt Owner/Admin). Die Persona-Shells
verlinken „Boards" in der Navigation.
