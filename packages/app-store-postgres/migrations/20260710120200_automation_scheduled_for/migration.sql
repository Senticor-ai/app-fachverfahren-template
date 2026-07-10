-- PM-Upgrade — zeitgetriebene Trigger (Scheduler): `scheduled_for` macht Outbox-Events ZEIT-fällig.
-- Sofort-Events (beim-eingang / beim-uebergang) lassen `scheduled_for` NULL und werden weiterhin sofort geclaimt;
-- zeitgetriebene Trigger (z. B. `frist-erreicht`) setzen `scheduled_for` auf den Fristzeitpunkt. `claimDueEvents`
-- gated darauf: `WHERE processed_at IS NULL AND (scheduled_for IS NULL OR scheduled_for <= now)`.
-- Additiv + idempotent (IF NOT EXISTS) — bestehende Zeilen bleiben mit NULL sofort fällig, kein Verhaltensbruch.

ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- Fällige, geplante Events effizient auffindbar (Partial-Index, nur unverarbeitete geplante Events).
CREATE INDEX IF NOT EXISTS app_automation_events_due_idx
  ON app_automation_events (scheduled_for)
  WHERE processed_at IS NULL AND scheduled_for IS NOT NULL;
