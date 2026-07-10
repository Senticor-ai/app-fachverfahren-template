-- PM-Upgrade — die append-only-Garantie von app_audit_events auch gegen TRUNCATE härten.
--
-- Der bestehende Riegel (20260709120100) ist ein ROW-LEVEL BEFORE UPDATE/DELETE-Trigger + REVOKE UPDATE, DELETE.
-- TRUNCATE feuert aber KEINE Row-Level-Trigger und wird von REVOKE UPDATE/DELETE nicht abgedeckt — ein
-- `TRUNCATE app_audit_events` (durch beliebigen Code-Pfad oder Operator) löschte die gesamte revisionssichere
-- Audit-Historie STILL, ohne Fehler. Das schließt die Lücke:
--  1) REVOKE TRUNCATE — entzieht das Recht (greift für normale Rollen).
--  2) BEFORE TRUNCATE-Trigger (STATEMENT-Ebene) — der harte Riegel, der AUCH den Tabellen-Owner stoppt (den REVOKE
--     nicht bindet). Genau wie beim UPDATE/DELETE-Riegel.

REVOKE TRUNCATE ON app_audit_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_audit_events_no_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_audit_events is append-only: TRUNCATE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_audit_events_no_truncate ON app_audit_events;
CREATE TRIGGER app_audit_events_no_truncate
  BEFORE TRUNCATE ON app_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION app_audit_events_no_truncate();
