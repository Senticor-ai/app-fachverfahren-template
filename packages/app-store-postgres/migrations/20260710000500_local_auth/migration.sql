-- Local username/password auth (kanban plan decision 2) — deliberately separate from
-- app_users so the identity record and its credential material are distinct concerns.
CREATE TABLE IF NOT EXISTS app_local_credentials (
  actor_id text PRIMARY KEY REFERENCES app_users (actor_id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  hash_algo text NOT NULL DEFAULT 'argon2id',
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Session identifiers are hashed at rest (decision 2): the cookie carries the raw
-- bearer token, only its hash is ever persisted.
CREATE TABLE IF NOT EXISTS app_sessions (
  session_id_hash text PRIMARY KEY,
  actor_id text NOT NULL REFERENCES app_users (actor_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_sessions_actor_idx
  ON app_sessions (actor_id, revoked_at, expires_at);
