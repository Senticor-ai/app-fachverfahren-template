CREATE TABLE IF NOT EXISTS app_boards (
  board_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  owner_actor_id text NOT NULL REFERENCES app_users (actor_id),
  title text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'personal' CHECK (visibility IN ('personal', 'team')),
  content_locale text NOT NULL DEFAULT 'de',
  template_key text,
  template_version integer,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_boards_tenant_owner_idx
  ON app_boards (tenant_id, owner_actor_id, archived_at);

CREATE TABLE IF NOT EXISTS app_board_columns (
  column_id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES app_boards (board_id) ON DELETE CASCADE,
  title text NOT NULL,
  position_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_board_columns_board_idx
  ON app_board_columns (board_id, archived_at, position_key);

CREATE TABLE IF NOT EXISTS app_board_cards (
  card_id text PRIMARY KEY,
  board_id text NOT NULL REFERENCES app_boards (board_id) ON DELETE CASCADE,
  column_id text NOT NULL REFERENCES app_board_columns (column_id) ON DELETE CASCADE,
  title text NOT NULL,
  description_markdown text,
  kind text NOT NULL DEFAULT 'task' CHECK (
    kind IN ('question', 'hypothesis', 'research', 'decision', 'feature', 'task', 'risk', 'defect')
  ),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  assignee_actor_id text REFERENCES app_users (actor_id),
  due_at timestamptz,
  blocked_reason text,
  position_key text NOT NULL,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_key text,
  created_by_actor_id text NOT NULL REFERENCES app_users (actor_id),
  version integer NOT NULL DEFAULT 1,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_board_cards_board_idx
  ON app_board_cards (board_id, archived_at);

CREATE INDEX IF NOT EXISTS app_board_cards_column_idx
  ON app_board_cards (column_id, archived_at, position_key);

CREATE INDEX IF NOT EXISTS app_board_cards_assignee_idx
  ON app_board_cards (assignee_actor_id, archived_at, due_at);

-- Idempotent re-seeding: a starter card is only (re)created once per board+sourceKey,
-- and an archived starter card acts as a tombstone the seeder must respect.
CREATE UNIQUE INDEX IF NOT EXISTS app_board_cards_board_source_key_uq
  ON app_board_cards (board_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_board_card_checklist_items (
  item_id text PRIMARY KEY,
  card_id text NOT NULL REFERENCES app_board_cards (card_id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_board_card_checklist_items_card_idx
  ON app_board_card_checklist_items (card_id, position_key);

-- Open-ended origin/relationship model for a card (decision 7): reference_kind is a
-- free string ("url", "case", "topic", "file", "folder", "email", "issue:github", ...),
-- never a closed enum, so new origin kinds are new rows, never a schema migration.
CREATE TABLE IF NOT EXISTS app_board_card_references (
  reference_id text PRIMARY KEY,
  card_id text NOT NULL REFERENCES app_board_cards (card_id) ON DELETE CASCADE,
  reference_kind text NOT NULL,
  reference_system text,
  external_id text,
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_board_card_references_card_idx
  ON app_board_card_references (card_id, reference_kind);
