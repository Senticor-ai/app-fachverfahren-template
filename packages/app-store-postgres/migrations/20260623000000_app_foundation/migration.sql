CREATE TABLE IF NOT EXISTS app_cases (
  case_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  procedure_id text NOT NULL,
  procedure_version text NOT NULL,
  state text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  subject_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_cases_tenant_state_idx
  ON app_cases (tenant_id, state);

CREATE TABLE IF NOT EXISTS app_audit_events (
  audit_event_id text PRIMARY KEY,
  case_id text,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  purpose text NOT NULL,
  legal_basis_id text NOT NULL,
  request_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_audit_events_case_idx
  ON app_audit_events (case_id, occurred_at);
