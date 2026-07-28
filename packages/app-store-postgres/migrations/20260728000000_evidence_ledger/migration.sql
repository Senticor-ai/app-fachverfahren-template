-- app_evidence_ledger — der DAUERHAFTE, hash-verkettete Evidence-Ledger (Blueprint §15.3/§27): der Nachweis
-- der agentischen Governance-Handlungen (Spine-Vorschlag, Chat-Runde, Review, Approval).
--
-- GEMESSENER BEFUND, der diese Migration ausloest: der Evidence-Ledger war der EINZIGE Speicher dieses Pakets
-- ohne Tabelle — `InMemoryEvidenceLedger` lief als Produktions-Wiring im Server-Entrypoint (server/index.ts).
-- Alle Nachbarn (audit, auth, case, kanban, task, wissen) sind seit jeher durable. Eine Hash-Kette, die beim
-- Neustart verschwindet, belegt nichts: sie ist ein Siegel auf einer Tuer, die es nicht mehr gibt.
--
-- Muster 1:1 wie app_verfahren_wissen / app_audit_events:
--   • APPEND-ONLY als Eigenschaft der TABELLE (BEFORE UPDATE/DELETE-Trigger + REVOKE), nicht nur der Anwendung.
--   • mandantengetrennt (tenant_id) und je ledger_id eine eigene Kette (prev_hash/entry_hash aus
--     src/audit-chain.ts -> src/evidence-ledger.ts, dieselbe kanonische Hash-Primitive wie das fachliche Audit).
-- Rein additiv + idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS): ein erneuter Lauf aendert nichts.

CREATE TABLE IF NOT EXISTS app_evidence_ledger (
  evidence_id text PRIMARY KEY,
  ledger_id text NOT NULL,
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  entry_type text NOT NULL,
  summary text NOT NULL,
  -- Nur Referenzen (composableId, aufgabe, modelId, caseId) — nie Inhalt/PII, s. evidence-ledger.ts.
  refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- BEWUSST text, NICHT timestamptz (Abweichung von den Nachbartabellen, mit Grund): `occurred_at` geht in die
  -- gehashten Bytes ein. Ein timestamptz-Roundtrip normalisiert die Zeichenkette (Offset -> UTC, Mikro- ->
  -- Millisekunden) und wuerde die Kette fuer jede nicht schon kanonische Eingabe BRECHEN — der Ledger muss
  -- exakt die Bytes zurueckgeben, ueber die gehasht wurde. Die Reihenfolge traegt `seq`, nicht die Zeit.
  occurred_at text NOT NULL,
  -- Genesis eines Stroms: prev_hash IS NULL.
  prev_hash text,
  entry_hash text NOT NULL,
  -- Die Anhaenge-Reihenfolge = die KETTEN-Reihenfolge (deckungsgleich mit dem In-Memory-Ledger, dessen
  -- Einfuege-Reihenfolge die Kette definiert). `occurred_at` taugt dafuer nicht: mehrere Eintraege einer
  -- Runde tragen denselben Zeitstempel.
  seq bigserial NOT NULL
);

-- Der Lese-Pfad (list/verify) ist mandanten- + strom-scoped in Anhaenge-Reihenfolge.
CREATE INDEX IF NOT EXISTS app_evidence_ledger_stream_idx
  ON app_evidence_ledger (tenant_id, ledger_id, seq);

-- KEINE GABELUNG: je Strom darf jeder Vorgaenger nur EINEN Nachfolger haben und es darf nur EINEN Genesis
-- geben. COALESCE(prev_hash,'') ist noetig, weil UNIQUE mehrere NULL zulaesst — sonst koennten zwei
-- gleichzeitige Appends zwei Genesis-Eintraege schreiben. Zusammen mit dem Advisory-Lock im Store
-- (pg_advisory_xact_lock je Strom) ist das der harte Riegel: der Lock serialisiert, dieser Index beweist es.
CREATE UNIQUE INDEX IF NOT EXISTS app_evidence_ledger_chain_uidx
  ON app_evidence_ledger (tenant_id, ledger_id, COALESCE(prev_hash, ''));

CREATE OR REPLACE FUNCTION app_evidence_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'app_evidence_ledger is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS app_evidence_ledger_append_only_trg ON app_evidence_ledger;
CREATE TRIGGER app_evidence_ledger_append_only_trg
  BEFORE UPDATE OR DELETE ON app_evidence_ledger
  FOR EACH ROW EXECUTE FUNCTION app_evidence_ledger_append_only();
REVOKE UPDATE, DELETE ON app_evidence_ledger FROM PUBLIC;
