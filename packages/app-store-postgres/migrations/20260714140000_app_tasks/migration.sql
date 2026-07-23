-- app_tasks — Aufgaben/Ziele/Schritte/Termine EINER Akte (ADR-0001 / ADR-0003 Task-Hierarchie). Erweitert die
-- SDK-`Task`-Form (taskId, caseId, title, state, assignedTo, dueAt) um die Dossier-Träger `task_kind`
-- (aufgabe|ziel|checkliste-item|termin), `parent_task_id` (Schritt → Ziel) und `data` (frei-formige Nutzlast:
-- Ziel-Kategorie/Status/Deadline, Schritt-`erledigt`-Flag, …). So bildet EINE polymorphe Tabelle die Ziele-mit-
-- Schritten-Hierarchie + Fortschritt (compute-on-read) ab, ohne pro Element-Typ eine eigene Tabelle. Fall-scoped
-- (FK auf app_cases, ON DELETE CASCADE); Mandanten-Scope über tenant_id (wie app_cases). Rein additiv + idempotent.

CREATE TABLE IF NOT EXISTS app_tasks (
  task_id text PRIMARY KEY,
  case_id text NOT NULL REFERENCES app_cases (case_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  title text NOT NULL,
  state text NOT NULL DEFAULT 'open',
  assigned_to text,
  due_at timestamptz,
  task_kind text NOT NULL DEFAULT 'aufgabe',
  parent_task_id text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_rank text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ziele/Termine einer Akte listen (nach Typ) + nach Rang ordnen.
CREATE INDEX IF NOT EXISTS app_tasks_case_kind_idx
  ON app_tasks (tenant_id, case_id, task_kind, sort_rank);

-- Schritte je Ziel (parent) + Fortschritts-Aggregation.
CREATE INDEX IF NOT EXISTS app_tasks_parent_idx
  ON app_tasks (parent_task_id);

-- Fristen-Scan (Termine/Deadlines mit due_at) je Mandant.
CREATE INDEX IF NOT EXISTS app_tasks_due_idx
  ON app_tasks (tenant_id, due_at)
  WHERE due_at IS NOT NULL;
