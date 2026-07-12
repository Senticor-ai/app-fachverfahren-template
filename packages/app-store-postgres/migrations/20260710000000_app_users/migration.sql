CREATE TABLE IF NOT EXISTS app_users (
  actor_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A table-level UNIQUE constraint can only reference plain columns, not
-- expressions — case-insensitive email uniqueness needs an expression index.
CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_email_uq
  ON app_users (tenant_id, lower(email));

CREATE INDEX IF NOT EXISTS app_users_tenant_idx
  ON app_users (tenant_id, status);
