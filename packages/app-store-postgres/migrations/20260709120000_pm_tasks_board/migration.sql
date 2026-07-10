-- PM-Upgrade — verfahrensübergreifende Task-/Board-/Intake-Schicht (Management-Ebene über den fachlichen Fällen).
-- Multi-Tenant konsistent zu app_cases (tenant_id/authority_id/jurisdiction_id, text-IDs, version DEFAULT 1).

CREATE TABLE IF NOT EXISTS app_tasks (
  task_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  procedure_id text NOT NULL,
  case_id text REFERENCES app_cases (case_id) ON DELETE SET NULL,
  title text NOT NULL,
  priority_key text,
  assignee_actor_id text,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  due_at timestamptz,
  sort_rank text NOT NULL,
  parent_task_id text,
  board_column text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Board-Reihenfolge je Behörde (Fractional-Index): (tenant, authority, rank).
CREATE INDEX IF NOT EXISTS app_tasks_board_rank_idx
  ON app_tasks (tenant_id, authority_id, sort_rank);
-- „Meine Aufgaben über alle Verfahren".
CREATE INDEX IF NOT EXISTS app_tasks_assignee_idx
  ON app_tasks (tenant_id, assignee_actor_id);
-- Verfahrens-Filter.
CREATE INDEX IF NOT EXISTS app_tasks_procedure_idx
  ON app_tasks (tenant_id, procedure_id);

CREATE TABLE IF NOT EXISTS app_intake_items (
  intake_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  procedure_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('antrag', 'email', 'formular', 'register')),
  triage_status text NOT NULL
    CHECK (triage_status IN ('pending', 'snoozed', 'accepted', 'declined', 'duplicate')),
  subject text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  task_id text,
  case_id text,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_intake_items_triage_idx
  ON app_intake_items (tenant_id, authority_id, triage_status, received_at DESC);

-- Interne Vermerke/Kommentare — APPEND-ONLY (Aktenmäßigkeit/§ 29 VwVfG: ein Vermerk wird nicht still editiert
-- oder gelöscht; Korrekturen sind neue Vermerke). Deshalb KEIN edited_at/updated_at.
CREATE TABLE IF NOT EXISTS app_task_comments (
  comment_id text PRIMARY KEY,
  task_id text NOT NULL,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  author_actor_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_task_comments_task_idx
  ON app_task_comments (tenant_id, task_id, created_at);

-- Aktivitäts-Feed (append-only) — jede Metadaten-/Statusänderung erzeugt einen Eintrag.
CREATE TABLE IF NOT EXISTS app_task_activity (
  activity_id text PRIMARY KEY,
  task_id text NOT NULL,
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  activity_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_task_activity_task_idx
  ON app_task_activity (tenant_id, task_id, occurred_at);

-- Gespeicherte Views (Filter/Sort/Group/Layout) — personal ODER geteilt, strikt mandanten-/behörden-scoped.
CREATE TABLE IF NOT EXISTS app_saved_views (
  view_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  owner_actor_id text,
  scope text NOT NULL CHECK (scope IN ('personal', 'geteilt')),
  label text NOT NULL,
  layout text NOT NULL,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_saved_views_scope_idx
  ON app_saved_views (tenant_id, authority_id, scope);
