-- PM-Upgrade — app_audit_events STRUKTURELL append-only machen (bisher nur Konvention).
-- Revisionssicherheit: ein einmal geschriebenes Audit-Event darf NIE geändert oder gelöscht werden.
--
-- Zwei Schichten:
--  1) REVOKE UPDATE, DELETE — entzieht das Recht (greift für normale Rollen).
--  2) BEFORE UPDATE/DELETE-Trigger — der harte Riegel, der AUCH den Tabellen-Owner stoppt (der REVOKE nicht bindet).

REVOKE UPDATE, DELETE ON app_audit_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_audit_events_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_audit_events is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_audit_events_no_mutation ON app_audit_events;
CREATE TRIGGER app_audit_events_no_mutation
  BEFORE UPDATE OR DELETE ON app_audit_events
  FOR EACH ROW EXECUTE FUNCTION app_audit_events_immutable();
