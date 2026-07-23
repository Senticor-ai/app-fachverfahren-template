-- app_verfahren_wissen — der durable VERFAHRENS-WISSENS-Store (Verfahrens-Wiki): das generelle, KI-gestuetzte
-- Wissen EINES Fachverfahrens (Normen-Auslegung, Arbeitshilfen, FAQ, Faehigkeiten), verfahrens-scoped statt
-- fall-scoped. APPEND-ONLY (eine Korrektur ist ein neuer Eintrag) — dieselbe Zellform wie der Fall-Aktenvermerk
-- (Zwei-Ebenen-Symmetrie), nur an der ProcedureVersion verankert.
--
-- WARUM: Bisher lief der WissenStore NUR In-Memory (ephemer) — ein Neustart loeschte das Verfahrens-Wiki, und in
-- PROD gab createWissenStoreFromEnv fail-closed `Unavailable` zurueck. Diese Migration + der PostgresWissenStore
-- geben ihm die durable Persistenz, konsistent mit der uebrigen Store-Politik (CaseStore/TaskStore/AuditStore).
--
-- APPEND-ONLY wie app_audit_events: ein BEFORE UPDATE/DELETE-Trigger wirft, und UPDATE/DELETE ist von PUBLIC
-- entzogen. So ist die Unveraenderlichkeit eine Eigenschaft der TABELLE, nicht nur der Anwendung — eine Korrektur
-- ist immer ein neuer Eintrag (Nachvollziehbarkeit, Evidenz).
--
-- Rein additiv + idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS): ein erneuter Lauf aendert nichts.

CREATE TABLE IF NOT EXISTS app_verfahren_wissen (
  eintrag_id text PRIMARY KEY,
  procedure_id text NOT NULL,
  procedure_version text NOT NULL,
  tenant_id text NOT NULL,
  authority_id text NOT NULL,
  jurisdiction_id text NOT NULL,
  actor_id text NOT NULL,
  art text NOT NULL,
  urheber text NOT NULL,
  text text NOT NULL,
  metadaten jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL
);

-- Der Lese-Pfad ist behoerden-scoped je Verfahren, chronologisch aufsteigend (listEintraege).
CREATE INDEX IF NOT EXISTS app_verfahren_wissen_scope_idx
  ON app_verfahren_wissen (tenant_id, authority_id, procedure_id, procedure_version, occurred_at);

CREATE OR REPLACE FUNCTION app_verfahren_wissen_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_verfahren_wissen is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS app_verfahren_wissen_append_only_trg ON app_verfahren_wissen;
CREATE TRIGGER app_verfahren_wissen_append_only_trg
  BEFORE UPDATE OR DELETE ON app_verfahren_wissen
  FOR EACH ROW EXECUTE FUNCTION app_verfahren_wissen_append_only();
REVOKE UPDATE, DELETE ON app_verfahren_wissen FROM PUBLIC;
