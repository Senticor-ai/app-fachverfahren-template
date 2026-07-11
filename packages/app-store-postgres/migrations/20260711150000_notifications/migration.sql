-- Persistente Benachrichtigungen (#18) als ZWEITES Backend über der Fan-out-Naht (#24): ein Notification-Projektor
-- (runConsumerTick) konsumiert getypte Domänen-Events und schreibt daraus dauerhafte In-App-Meldungen. Bisher waren
-- Meldungen NUR clientseitig aus dem Aufgabenbestand abgeleitet (flüchtig, kein Gelesen-Zustand server-seitig).
--
-- IDEMPOTENZ (kritisch): der Fan-out ist at-least-once → derselbe Event kann dem Projektor mehrfach zugestellt werden.
-- Die notification_id ist daher DETERMINISTISCH aus (event_id) abgeleitet; der INSERT ist idempotent (PK-Konflikt →
-- keine Dublette). Mandanten-scoped wie alle app_*-Tabellen.
--
-- Additiv + idempotent (CREATE TABLE/INDEX IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS app_notifications (
  notification_id     text PRIMARY KEY,
  tenant_id           text NOT NULL,
  authority_id        text NOT NULL,
  -- Empfänger (actor_id) oder NULL = an die zuständige Stelle/alle (rollen-/zuständigkeitsbasiert im Client aufgelöst).
  recipient_actor_id  text,
  event_type          text NOT NULL,
  title               text NOT NULL,
  body                text NOT NULL,
  case_id             text,
  task_id             text,
  read                boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- „Meine ungelesenen Meldungen" effizient (der häufigste Query des Postfachs).
CREATE INDEX IF NOT EXISTS app_notifications_inbox_idx
  ON app_notifications (tenant_id, recipient_actor_id, created_at DESC)
  WHERE read = false;
