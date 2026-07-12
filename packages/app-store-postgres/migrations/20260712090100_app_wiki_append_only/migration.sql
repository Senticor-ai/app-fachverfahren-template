-- Die Revisionshistorie des Wikis (app_wiki_revisions) STRUKTURELL append-only machen — Revisionssicherheit der
-- Wissensbasis: eine einmal geschriebene Revision darf NIE geändert, gelöscht oder truncatet werden.
--
-- WICHTIG: NUR app_wiki_revisions wird verriegelt. app_wiki_articles (der KOPF) bleibt bewusst MUTABLE — jede
-- Speicherung erhöht dort `version` und überschreibt den aktuellen Stand. Der unveränderliche Verlauf lebt allein
-- in den Revisionen (Spiegel des Audit-Riegels 20260709120100 + 20260711120000_audit_no_truncate).
--
-- Zwei Schichten, je Mutationsart:
--  1) REVOKE — entzieht das Recht (greift für normale Rollen).
--  2) BEFORE-Trigger — der harte Riegel, der AUCH den Tabellen-Owner stoppt (den REVOKE nicht bindet).

REVOKE UPDATE, DELETE, TRUNCATE ON app_wiki_revisions FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_wiki_revisions_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_wiki_revisions is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_wiki_revisions_no_mutation ON app_wiki_revisions;
CREATE TRIGGER app_wiki_revisions_no_mutation
  BEFORE UPDATE OR DELETE ON app_wiki_revisions
  FOR EACH ROW EXECUTE FUNCTION app_wiki_revisions_immutable();

CREATE OR REPLACE FUNCTION app_wiki_revisions_no_truncate()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_wiki_revisions is append-only: TRUNCATE is not permitted'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_wiki_revisions_no_truncate ON app_wiki_revisions;
CREATE TRIGGER app_wiki_revisions_no_truncate
  BEFORE TRUNCATE ON app_wiki_revisions
  FOR EACH STATEMENT EXECUTE FUNCTION app_wiki_revisions_no_truncate();
