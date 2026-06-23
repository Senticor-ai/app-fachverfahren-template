CREATE TABLE IF NOT EXISTS app_rbac_roles (
  role_key text PRIMARY KEY,
  display_name text NOT NULL,
  description text NOT NULL,
  built_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_rbac_permissions (
  permission_key text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_rbac_role_permissions (
  role_key text NOT NULL REFERENCES app_rbac_roles (role_key) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES app_rbac_permissions (permission_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS app_actor_roles (
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  role_key text NOT NULL REFERENCES app_rbac_roles (role_key),
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  PRIMARY KEY (tenant_id, actor_id, role_key)
);

CREATE INDEX IF NOT EXISTS app_actor_roles_actor_idx
  ON app_actor_roles (tenant_id, actor_id, valid_to);

CREATE TABLE IF NOT EXISTS app_user_preferences (
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  color_scheme text NOT NULL DEFAULT 'light'
    CHECK (color_scheme IN ('light', 'dark', 'system')),
  high_contrast boolean NOT NULL DEFAULT false,
  large_text boolean NOT NULL DEFAULT false,
  reduced_motion boolean NOT NULL DEFAULT false,
  reduced_density boolean NOT NULL DEFAULT false,
  navigation_auto_expand boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, actor_id)
);

ALTER TABLE app_user_preferences
  ADD COLUMN IF NOT EXISTS navigation_auto_expand boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS app_mailbox_messages (
  message_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  owner_actor_id text NOT NULL,
  case_id text REFERENCES app_cases (case_id) ON DELETE SET NULL,
  message_box text NOT NULL CHECK (message_box IN ('inbox', 'outbox')),
  audience text NOT NULL CHECK (audience IN ('citizen', 'caseworker')),
  subject text NOT NULL,
  body_preview text NOT NULL,
  status text NOT NULL CHECK (status IN ('unread', 'read', 'sent', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_mailbox_messages_owner_box_idx
  ON app_mailbox_messages (tenant_id, owner_actor_id, message_box, created_at DESC);

CREATE INDEX IF NOT EXISTS app_mailbox_messages_authority_box_idx
  ON app_mailbox_messages (tenant_id, authority_id, audience, message_box, created_at DESC);

INSERT INTO app_rbac_roles (role_key, display_name, description, built_in)
VALUES
  (
    'citizen',
    'Bürgerin/Bürger',
    'Nutzt das Bürgerportal für eigene Vorgänge, Posteingang, Ausgang und Einstellungen.',
    true
  ),
  (
    'caseworker',
    'Sachbearbeitung',
    'Bearbeitet Vorgänge im behördlichen Fachverfahren mit Posteingang, Ausgang und Entscheidungsvorbereitung.',
    true
  )
ON CONFLICT (role_key) DO UPDATE
SET display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    built_in = EXCLUDED.built_in;

INSERT INTO app_rbac_permissions (permission_key, description)
VALUES
  ('session.read', 'Eigene Sitzung lesen'),
  ('preferences.read', 'Eigene Benutzereinstellungen lesen'),
  ('preferences.write', 'Eigene Benutzereinstellungen ändern'),
  ('mailbox.own.read', 'Eigenen Posteingang und Ausgang lesen'),
  ('mailbox.authority.read', 'Behördlichen Posteingang und Ausgang lesen'),
  ('case.read', 'Vorgänge lesen'),
  ('case.decision.prepare', 'Entscheidung vorbereiten')
ON CONFLICT (permission_key) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO app_rbac_role_permissions (role_key, permission_key)
VALUES
  ('citizen', 'session.read'),
  ('citizen', 'preferences.read'),
  ('citizen', 'preferences.write'),
  ('citizen', 'mailbox.own.read'),
  ('caseworker', 'session.read'),
  ('caseworker', 'preferences.read'),
  ('caseworker', 'preferences.write'),
  ('caseworker', 'mailbox.authority.read'),
  ('caseworker', 'case.read'),
  ('caseworker', 'case.decision.prepare')
ON CONFLICT (role_key, permission_key) DO NOTHING;
