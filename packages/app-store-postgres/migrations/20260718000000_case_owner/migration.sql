-- app_cases.owner_actor_id — der EIGENTÜMER-Anker eines Falls (für „meine Anträge" der Bürger:innen).
--
-- WARUM EINE EIGENE SPALTE, und nicht `subject_ids`: `subject_ids` ist CLIENT-kontrolliert (das BFF
-- übernimmt `body.subjectIds` ungeprüft, cases.ts) und ein reines FACHdatum ohne Formatbindung. Würde
-- Ownership daran hängen, könnte sich ein Angreifer über den Body fremde Zuordnung erschleichen.
-- `owner_actor_id` wird AUSSCHLIESSLICH aus `session.actorId` gestempelt — nie aus Query/Body. Das ist
-- exakt die Mailbox-Präzedenz (app_mailbox_messages.owner_actor_id, mailbox.ts: ownerActorId =
-- session.actorId).
--
-- NULLABLE, KEIN DEFAULT, KEIN BACKFILL: ein behörden-initiiertes Dossier hat keinen Bürger-Eigentümer.
-- NULL zählt NIE als „meins" — und zwar von selbst, ohne Sonderfall im Code: das Prädikat vergleicht auf
-- Gleichheit, und `NULL = $1` ist in SQL niemals wahr. Fail-closed by construction.
--
-- KEIN FK auf app_users: der Case-Store ist bewusst SDK-/Nutzer-entkoppelt; app_mailbox_messages.owner_actor_id
-- hat aus demselben Grund keinen.
--
-- DER INDEX IST NICHT OPTIONAL: app_cases hat heute nur (tenant_id, state). „Meine Anträge" filtert auf
-- (tenant_id, owner_actor_id) und sortiert nach opened_at DESC — ohne diesen Index wäre der Bürger-Pfad
-- ein Seq-Scan über ALLE Fälle des Mandanten. Symmetrisch zu app_mailbox_messages_owner_box_idx.
--
-- Rein additiv + idempotent; bestehende Fälle verhalten sich unverändert.

ALTER TABLE app_cases
  ADD COLUMN IF NOT EXISTS owner_actor_id text;

CREATE INDEX IF NOT EXISTS app_cases_owner_idx
  ON app_cases (tenant_id, owner_actor_id, opened_at DESC);
