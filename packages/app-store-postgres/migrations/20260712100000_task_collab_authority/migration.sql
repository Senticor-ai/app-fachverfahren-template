-- Collab-Härtung (Phase 0): app_task_activity um authority_id ERGÄNZEN — Symmetrie zu app_task_comments (das die
-- Behörde bereits trägt). Bisher war die Aktivität nur mandanten-/task-scoped; die Behörde ließ sich nur über einen
-- Join auf app_tasks ableiten. Für behörden-scoped Auswertungen + Audit-Vollständigkeit wird sie mitgeführt.
--
-- WICHTIG: Diese Migration MUSS VOR dem append-only-Riegel (20260712100100) laufen — der Backfill ist ein UPDATE,
-- das der append-only-Trigger sonst blockieren würde. Die Reihenfolge ergibt sich aus dem Dateinamen (100000 < 100100).
--
-- authority_id bleibt NULLABLE: eine Aktivität, deren Task (theoretisch) fehlt, behält NULL statt den Backfill zu
-- sprengen; neue Schreibvorgänge setzen die Behörde aus der Server-Session. Additiv + idempotent.

ALTER TABLE app_task_activity ADD COLUMN IF NOT EXISTS authority_id text;

-- Bestehende Zeilen aus dem zugehörigen Task befüllen (die Aktivität ist task-scoped; die Behörde kommt vom Task).
UPDATE app_task_activity a
   SET authority_id = t.authority_id
  FROM app_tasks t
 WHERE a.task_id = t.task_id
   AND a.tenant_id = t.tenant_id
   AND a.authority_id IS NULL;

-- Behörden-scoped Aktivitäts-Abfragen effizient.
CREATE INDEX IF NOT EXISTS app_task_activity_authority_idx
  ON app_task_activity (tenant_id, authority_id, occurred_at);
