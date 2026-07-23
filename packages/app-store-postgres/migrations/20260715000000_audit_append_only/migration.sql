-- app_audit_events append-only-Riegel (ADR-0001-Pflicht: revisionssichere, fachliche Audit-Ereignisse).
-- Bislang war "append-only" nur interface-seitig (der Store macht ausschliesslich INSERT/SELECT). Dieser Riegel
-- erzwingt es auf DB-Ebene ROLLEN-UNABHAENGIG per BEFORE UPDATE OR DELETE-Trigger, der IMMER wirft — auch fuer
-- Owner/Superuser, gegen die ein reines REVOKE nicht greift. Das REVOKE (unten) ist eine zusaetzliche,
-- weniger privilegierte Verteidigungslinie (defense-in-depth). Rein additiv + idempotent (CREATE OR REPLACE
-- FUNCTION + DROP TRIGGER IF EXISTS/CREATE TRIGGER), kein Backfill, keine Schema-Aenderung an app_audit_events.

CREATE OR REPLACE FUNCTION app_audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_audit_events is append-only (ADR-0001): % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_audit_events_append_only_trg ON app_audit_events;
CREATE TRIGGER app_audit_events_append_only_trg
  BEFORE UPDATE OR DELETE ON app_audit_events
  FOR EACH ROW EXECUTE FUNCTION app_audit_events_append_only();

-- Zusaetzliche Verteidigungslinie fuer nicht-privilegierte Rollen (der Trigger bleibt der robuste Kern).
REVOKE UPDATE, DELETE ON app_audit_events FROM PUBLIC;
