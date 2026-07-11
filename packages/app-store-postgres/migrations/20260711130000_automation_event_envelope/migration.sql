-- Domain-Event-Envelope (#16): typisiertes Outbox-Event als Fundament für getypten Multi-Consumer-Fan-out (#24).
-- `event_type` ist der stabile DOMÄNEN-Ereignisname (was geschah, z. B. `case.transitioned`) — abgegrenzt vom
-- `trigger_event` (Automations-Regel-Match-Key). `correlation_id` traced eine auslösende Anfrage über mehrere Events;
-- `causation_id` verweist auf das verursachende Event (bei Wurzel-Events NULL, in #24 für Ketten gesetzt);
-- `occurred_at` ist die DOMÄNEN-Zeit (bei Fristen der Fälligkeitszeitpunkt, nicht die Scan-Zeit).
--
-- Additiv + idempotent (IF NOT EXISTS), alle Spalten NULLBAR. Bestehende Zeilen bleiben NULL → kein Verhaltensbruch;
-- die Automations-Engine matched weiter über `trigger_event`, nicht über `event_type`.

ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS event_type text;
ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS event_version integer;
ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS correlation_id text;
ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS causation_id text;
ALTER TABLE app_automation_events ADD COLUMN IF NOT EXISTS occurred_at timestamptz;

-- Getypter Fan-out/Projektion nach event_type effizient (nur getypte Events; ältere/ungetypte bleiben aussen vor).
CREATE INDEX IF NOT EXISTS app_automation_events_event_type_idx
  ON app_automation_events (event_type)
  WHERE event_type IS NOT NULL;
