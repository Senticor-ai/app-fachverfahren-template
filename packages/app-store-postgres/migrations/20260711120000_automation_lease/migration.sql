-- Event-Durability — AT-LEAST-ONCE via Lease/Reclaim. Bisher setzte `claimDueEvents` `processed_at = now` schon
-- BEIM Claim (terminal): stirbt der Consumer NACH dem Claim, aber VOR der Regel-Ausführung, ist das Event für immer
-- verloren (at-most-once). Neu: der Claim LEAST nur (setzt `locked_until = now + visibility`, zählt `attempts` hoch);
-- `processed_at` wird ERST bei erfolgreicher Behandlung durch die Engine (`markProcessed`) gesetzt. Läuft die Lease
-- ab, ohne dass `processed_at` gesetzt wurde (Crash), wird das Event erneut claimbar → Wiederaufnahme. DOPPEL-EFFEKTE
-- beim Re-Claim sind für die heutigen Aktionen unschädlich, weil diese idempotent bzw. optimistic-lock-geschützt sind
-- (`status-uebergang` via expectedVersion); die `app_automation_runs`-Idempotenz `(rule_id, idempotency_key)`
-- dedupliziert die AUDIT-Zeile, nicht die Effekt-Ausführung.
--
-- Additiv + idempotent (IF NOT EXISTS). Bestehende Zeilen: `attempts = 0`, `locked_until = NULL` → sofort claimbar
-- (kein Verhaltensbruch). Deterministische Fehler markiert die Engine terminal (kein Re-Claim-Sturm) — die Lease
-- schützt ausschließlich gegen den PROZESS-Crash. `attempts` wird hier nur BUCHGEFÜHRT; ein Cap/Dead-Letter gegen
-- prozess-tötende Poison-Events folgt separat (Skalierungsplan #9).

ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS locked_until timestamptz;

-- Claimbare Events effizient auffindbar: unverarbeitet UND (nie geleast ODER Lease abgelaufen). Der Partial-Index
-- deckt genau das `claimDueEvents`-Prädikat (unbearbeitete Zeilen), `locked_until` als Sortier-/Filterspalte.
CREATE INDEX IF NOT EXISTS app_automation_events_claimable_idx
  ON app_automation_events (locked_until)
  WHERE processed_at IS NULL;
