-- Template Runtime Foundation (PR 1): Workspace-Rollen, Identity-Links, Audit-Events,
-- Board-Metadaten. Siehe docs/architecture/template-runtime-experience.md.

-- Admin-verwaltete Benutzerkonten: 'admin' legt Konten an, 'member' arbeitet mit.
-- Das Permission-Mapping (users.manage, boards.collaborate, …) lebt im App-Server
-- (workspace-permissions.ts) — die Rolle ist das gespeicherte Primitiv.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin', 'member'));

-- Bestandsdaten: der früheste Benutzer je Tenant wird Admin — vor dieser Migration
-- gab es keinen Weg, weitere Benutzer anzulegen (jeder Tenant hat höchstens einen),
-- und ohne Admin wäre die Benutzerverwaltung unerreichbar.
UPDATE app_users SET role = 'admin'
WHERE actor_id IN (
  SELECT DISTINCT ON (tenant_id) actor_id
  FROM app_users
  ORDER BY tenant_id, created_at ASC, actor_id ASC
);

-- Identity-Links (Authentifizierung ≠ Autorisierung): externe Identität
-- (provider/issuer + subject) → Application Actor. Der IdP beweist nur Identität;
-- Actor, Tenant-Zugehörigkeit, Rollen und Audit-Identität gehören der Anwendung.
-- Der lokale Login registriert provider='local', subject=actor_id; ein späterer
-- OIDC-Provider hängt sich hier ein, ohne die Autorisierung zu berühren.
CREATE TABLE IF NOT EXISTS app_identity_links (
  tenant_id text NOT NULL,
  provider text NOT NULL,
  subject text NOT NULL,
  actor_id text NOT NULL REFERENCES app_users (actor_id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, provider, subject)
);

CREATE INDEX IF NOT EXISTS app_identity_links_actor_idx
  ON app_identity_links (actor_id);

-- Workspace-Audit-Events (Compliance-by-Design, MVP): jede sicherheitsrelevante
-- administrative Aktion erzeugt ein Event. actor_id ist NULL-bar (fehlgeschlagene
-- Logins unbekannter Konten); metadata trägt Kontext ohne PII-Zwang. Ereignis-Katalog:
-- audit-store.ts. BEWUSST eigene Tabelle: app_audit_events (20260623000000_app_foundation)
-- ist der Domain-/Case-Audit-Vertrag des SDK mit anderem Schema (purpose/legal_basis/…).
CREATE TABLE IF NOT EXISTS app_workspace_audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_id text NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS app_workspace_audit_events_tenant_time_idx
  ON app_workspace_audit_events (tenant_id, occurred_at DESC);

-- Board-Metadaten (zukunftsfest ohne neue Produkte): purpose + lifecycle_stage neben
-- dem bestehenden template_key ermöglichen später security-review-/audit-/betrieb-Boards.
ALTER TABLE app_boards
  ADD COLUMN IF NOT EXISTS purpose text NULL;
ALTER TABLE app_boards
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NULL;

-- Feature-Entscheid „Beides": das beim Bootstrap gesäte Discovery-Board wird team-sichtbar
-- und trägt den Produktnamen. visibility hatte bislang KEINE Lese-Wirkung — der Flip ändert
-- nur, was das neue listBoards zusätzlich anzeigt; version bleibt unangetastet (ETags intakt).
UPDATE app_boards
SET visibility = 'team',
    title = 'Fachverfahren Discovery Board',
    purpose = 'requirements-discovery',
    lifecycle_stage = 'design'
WHERE template_key = 'fachverfahren-discovery-v1';
