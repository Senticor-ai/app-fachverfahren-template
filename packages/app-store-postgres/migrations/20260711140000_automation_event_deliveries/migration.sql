-- Multi-Consumer-Fan-out (#24): per-Consumer-Zustellverfolgung ÜBER der geteilten Outbox. Die Automations-Engine
-- bleibt EIN Consumer und nutzt weiter `app_automation_events.processed_at` als IHREN Terminal-Marker (unangetastet).
-- ZUSÄTZLICHE Consumer (Such-Projektor, Notifier, ein 2. Domänen-Backend) verfolgen ihren Fortschritt HIER — je
-- (event_id, consumer) EINE Zeile mit eigenem Lease/attempts/Status. Kein Consumer fasst `processed_at` an → die
-- Engine bleibt bit-genau, wie sie ist. Fan-out-on-READ: die Zeile entsteht ERST beim Claim (kein Schreib-Verstärker
-- auf dem Domain-Schreibpfad; `enqueueEvent`/`insertAutomationEventTx`/Outbox bleiben UNVERÄNDERT). Nur GETYPTE
-- Events (event_type IS NOT NULL, #16) werden gefächert.
--
-- Additiv + idempotent (CREATE TABLE/INDEX IF NOT EXISTS). KEINE Änderung an app_automation_events.

CREATE TABLE IF NOT EXISTS app_event_deliveries (
  event_id         text NOT NULL,
  consumer         text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dead')),
  attempts         integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  first_claimed_at timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  reason           text,
  PRIMARY KEY (event_id, consumer)
);

-- Re-Claim-Pfad je Consumer: offene, lease-abgelaufene Zustellungen effizient auffindbar (Partial-Index wie
-- `app_automation_events_claimable_idx`). Der NEU-Zustell-Pfad (noch keine Row) nutzt den Anti-Join gegen die PK.
CREATE INDEX IF NOT EXISTS app_event_deliveries_claimable_idx
  ON app_event_deliveries (consumer, locked_until)
  WHERE status = 'pending';
