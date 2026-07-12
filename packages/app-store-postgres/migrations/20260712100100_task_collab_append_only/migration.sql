-- Collab-Härtung (Phase 0): app_task_comments UND app_task_activity STRUKTURELL append-only machen. Beide sind
-- fachlich bereits append-only (Vermerke + Änderungsprotokoll werden NIE editiert/gelöscht), aber bisher nur per
-- Konvention. Dieser Riegel spiegelt den Audit-Riegel (20260709120100 + 20260711120000_audit_no_truncate):
--  1) REVOKE UPDATE/DELETE/TRUNCATE — entzieht das Recht (greift für normale Rollen).
--  2) BEFORE UPDATE/DELETE-Trigger (ROW) + BEFORE TRUNCATE-Trigger (STATEMENT) — der harte Riegel, der AUCH den
--     Tabellen-Owner stoppt (den REVOKE nicht bindet). Je Tabelle eine eigene Trigger-Funktion (sprechende Fehler).

-- ── app_task_comments ──────────────────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE, TRUNCATE ON app_task_comments FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_task_comments_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_task_comments is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_task_comments_no_mutation ON app_task_comments;
CREATE TRIGGER app_task_comments_no_mutation
  BEFORE UPDATE OR DELETE ON app_task_comments
  FOR EACH ROW EXECUTE FUNCTION app_task_comments_immutable();

CREATE OR REPLACE FUNCTION app_task_comments_no_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_task_comments is append-only: TRUNCATE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_task_comments_no_truncate ON app_task_comments;
CREATE TRIGGER app_task_comments_no_truncate
  BEFORE TRUNCATE ON app_task_comments
  FOR EACH STATEMENT EXECUTE FUNCTION app_task_comments_no_truncate();

-- ── app_task_activity ──────────────────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE, TRUNCATE ON app_task_activity FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_task_activity_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_task_activity is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_task_activity_no_mutation ON app_task_activity;
CREATE TRIGGER app_task_activity_no_mutation
  BEFORE UPDATE OR DELETE ON app_task_activity
  FOR EACH ROW EXECUTE FUNCTION app_task_activity_immutable();

CREATE OR REPLACE FUNCTION app_task_activity_no_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_task_activity is append-only: TRUNCATE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_task_activity_no_truncate ON app_task_activity;
CREATE TRIGGER app_task_activity_no_truncate
  BEFORE TRUNCATE ON app_task_activity
  FOR EACH STATEMENT EXECUTE FUNCTION app_task_activity_no_truncate();
