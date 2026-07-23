-- Audit-Hash-Kette (Issue #53): tamper-evidentes „git über alles"-Log. Ergänzt app_audit_events um
-- prev_hash + entry_hash — die kryptografische Verkettung je Stream (tenant_id, case_id): jedes Ereignis
-- kettet über entry_hash = SHA-256(kanonische Bytes inkl. prev_hash) an seinen Vorgänger. Der DB-Riegel
-- (BEFORE UPDATE/DELETE-Trigger + REVOKE, 20260715000000) macht das Log tamper-RESISTENT; die Kette macht es
-- tamper-EVIDENT (Modifikation/Löschung/Reorder werden bei der Verifikation erkannt, s. src/audit-chain.ts).
--
-- Rein additiv + idempotent (ADD COLUMN IF NOT EXISTS). ADD COLUMN ist DDL — der append-only-Trigger greift
-- NICHT (er blockiert nur Zeilen-UPDATE/DELETE). Bestandszeilen von VOR dieser Migration bleiben NULL
-- (unverkettet); die Kette ist ab hier lückenlos tamper-evident (kein rückwirkender Backfill über das Log).

ALTER TABLE app_audit_events ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE app_audit_events ADD COLUMN IF NOT EXISTS entry_hash text;

-- Stützt den „letzter Eintrag im Stream"-Lookup beim verketteten Append (insertChainedAuditEvent) und die
-- deterministische Stream-Reihenfolge (occurred_at, audit_event_id).
CREATE INDEX IF NOT EXISTS app_audit_events_stream_idx
  ON app_audit_events (tenant_id, case_id, occurred_at, audit_event_id);
