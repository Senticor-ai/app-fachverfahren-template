-- Case persistence readiness: hybrid snapshot + append-only events + attachment linkage.
-- Existing app_cases was unused (no production rows expected) — single atomic forward migration.

ALTER TABLE app_cases
  ADD COLUMN IF NOT EXISTS leistung_id text,
  ADD COLUMN IF NOT EXISTS payload_version text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS config_version text NOT NULL DEFAULT '1',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

-- Backfill leistung_id from legacy procedure_id when present.
UPDATE app_cases
SET leistung_id = procedure_id
WHERE leistung_id IS NULL;

ALTER TABLE app_cases
  ALTER COLUMN leistung_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS app_case_events (
  event_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES app_cases (case_id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  event_type text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  reason text,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  request_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, sequence)
);

CREATE INDEX IF NOT EXISTS app_case_events_case_seq_idx
  ON app_case_events (case_id, sequence);

CREATE TABLE IF NOT EXISTS app_case_idempotency (
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  idempotency_key text NOT NULL,
  case_id text NOT NULL REFERENCES app_cases (case_id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, authority_id, jurisdiction_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS app_case_attachments (
  attachment_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  case_id text REFERENCES app_cases (case_id) ON DELETE SET NULL,
  purpose text NOT NULL,
  file_name text NOT NULL,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL,
  checksum_sha256 text NOT NULL,
  storage_key text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  bound_at timestamptz,
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_case_attachments_unbound_expiry_idx
  ON app_case_attachments (expires_at)
  WHERE case_id IS NULL;

CREATE INDEX IF NOT EXISTS app_cases_list_idx
  ON app_cases (tenant_id, authority_id, jurisdiction_id, updated_at DESC, case_id DESC);
