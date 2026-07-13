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

-- Backfill für Bestands-Konten: vor dieser Migration angelegte lokale Benutzer haben
-- Credentials, aber keinen Identity-Link — resolveActorForIdentity könnte sie sonst nie
-- auflösen, während neue Konten es können. Idempotent via ON CONFLICT DO NOTHING.
INSERT INTO app_identity_links (tenant_id, provider, subject, actor_id)
SELECT u.tenant_id, 'local', u.actor_id, u.actor_id
FROM app_users u
JOIN app_local_credentials c ON c.actor_id = u.actor_id
ON CONFLICT (tenant_id, provider, subject) DO NOTHING;

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

-- Kompensations-Löschung reparieren (Codex-Review PR #27): bootstrapWorkspace und die
-- Benutzer-API löschen bei Teil-Fehlschlag den frisch angelegten Benutzer — das scheiterte
-- in Postgres am FK app_boards.owner_actor_id OHNE cascade, sobald das Seed-Board schon
-- existierte (User+Credential+Identity-Link blieben als Zombie zurück). deleteUser wird
-- ausschließlich als Kompensation FRISCH angelegter Konten aufgerufen; deren Boards/Karten
-- gehören ihnen selbst, der Cascade räumt den gesamten Board-Graph mit ab
-- (columns/cards cascaden bereits über board_id).
ALTER TABLE app_boards
  DROP CONSTRAINT IF EXISTS app_boards_owner_actor_id_fkey;
ALTER TABLE app_boards
  ADD CONSTRAINT app_boards_owner_actor_id_fkey
  FOREIGN KEY (owner_actor_id) REFERENCES app_users (actor_id) ON DELETE CASCADE;

-- Karten-Referenzen auf Actors dürfen die Konto-Löschung NICHT blockieren (empirisch:
-- der NO-ACTION-FK created_by_actor_id verhinderte das Kompensations-DELETE trotz
-- Board-Cascade). Karten auf FREMDEN Boards überleben den Ersteller — die Urheberschaft
-- wird anonymisiert (SET NULL, auch DSGVO-freundlich); Zuweisungen werden gelöst.
ALTER TABLE app_board_cards
  ALTER COLUMN created_by_actor_id DROP NOT NULL;
ALTER TABLE app_board_cards
  DROP CONSTRAINT IF EXISTS app_board_cards_created_by_actor_id_fkey;
ALTER TABLE app_board_cards
  ADD CONSTRAINT app_board_cards_created_by_actor_id_fkey
  FOREIGN KEY (created_by_actor_id) REFERENCES app_users (actor_id) ON DELETE SET NULL;
ALTER TABLE app_board_cards
  DROP CONSTRAINT IF EXISTS app_board_cards_assignee_actor_id_fkey;
ALTER TABLE app_board_cards
  ADD CONSTRAINT app_board_cards_assignee_actor_id_fkey
  FOREIGN KEY (assignee_actor_id) REFERENCES app_users (actor_id) ON DELETE SET NULL;

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
    purpose = 'requirements-discovery',
    lifecycle_stage = 'design',
    -- Nur den unveränderten Default-Titel umbenennen: hat ein Konsument sein Board
    -- bereits via PATCH umbenannt, bleibt SEIN Titel erhalten (Codex-Review PR #27).
    title = CASE
      WHEN title = 'Build the Fachverfahren' THEN 'Fachverfahren Discovery Board'
      ELSE title
    END
WHERE template_key = 'fachverfahren-discovery-v1';
