-- PM-Upgrade — Automations-Engine: deklarative Regeln + transaktionale Outbox + idempotente Läufe.
-- Die REGELN sind data-driven (condition/actions als jsonb, gespiegelt zu AutomationRule im Kit). Die AUSFÜHRUNG
-- ist server-autoritativ: jede Domain-Mutation schreibt ein Outbox-Event (app_automation_events) in DERSELBEN TX;
-- ein Worker/Poller verarbeitet fällige Events (FOR UPDATE SKIP LOCKED) und protokolliert jeden Lauf idempotent.

CREATE TABLE IF NOT EXISTS app_automation_rules (
  rule_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  procedure_id text NOT NULL,
  trigger_event text NOT NULL,
  condition jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_four_eyes boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_automation_rules_trigger_idx
  ON app_automation_rules (tenant_id, procedure_id, trigger_event, active);

-- Transaktionale Outbox: unverarbeitete Events über einen Partial-Index effizient auffindbar.
CREATE TABLE IF NOT EXISTS app_automation_events (
  event_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  procedure_id text NOT NULL,
  case_id text,
  task_id text,
  trigger_event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS app_automation_events_unprocessed_idx
  ON app_automation_events (created_at)
  WHERE processed_at IS NULL;

-- Idempotenz: ein Lauf je (Regel, Idempotenz-Schlüssel) — verhindert Doppelausführung/Schleifen.
CREATE TABLE IF NOT EXISTS app_automation_runs (
  run_id text PRIMARY KEY,
  rule_id text NOT NULL,
  event_id text,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'blocked', 'skipped', 'failed')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_id, idempotency_key)
);
