CREATE TABLE IF NOT EXISTS dog_tax_cases (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dog_tax_cases_tenant_status_idx
  ON dog_tax_cases (tenant_id, status);

-- Hundesteuer: extend this migration with jurisdiction-approved fields before production use.
