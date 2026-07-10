-- PM-Upgrade — Aufgaben-Beziehungen (Plane-Parität): blockiert / blockiert-von / Dublette / bezieht-sich-auf /
-- Widerspruch-zu. Mandanten-/behörden-scoped; Selbstreferenz wird per CHECK verhindert, Zyklen prüft die Anwendung
-- beim Anlegen. Forward-only, additiv (die Tabelle existierte in keiner Migration).

CREATE TABLE IF NOT EXISTS app_task_relations (
  relation_id text PRIMARY KEY,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  task_id text NOT NULL,
  related_task_id text NOT NULL,
  relation_type text NOT NULL CHECK (
    relation_type IN ('blocks', 'blocked-by', 'duplicate', 'relates', 'widerspruch-zu')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (task_id <> related_task_id)
);

CREATE INDEX IF NOT EXISTS app_task_relations_task_idx
  ON app_task_relations (tenant_id, task_id);

-- Doppelte Beziehungen desselben Typs zwischen denselben Aufgaben vermeiden.
CREATE UNIQUE INDEX IF NOT EXISTS app_task_relations_unique_idx
  ON app_task_relations (tenant_id, task_id, related_task_id, relation_type);
