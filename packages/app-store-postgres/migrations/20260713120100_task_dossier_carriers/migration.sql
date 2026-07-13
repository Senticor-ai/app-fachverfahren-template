-- Dual-Mode Phase 1b: app_tasks traegt jetzt (a) `task_kind` (freier Typ-Diskriminator — Default 'aufgabe'; spaeter
-- z. B. 'ziel'/'checkliste-item' fuer Dossier-Sub-Sammlungen, ohne Schema-Churn) und (b) `data jsonb` (frei-formige
-- Nutzlast eines Sub-Sammlungs-Eintrags, z. B. Ziel-Kategorie/Deadline/Completion-Flag). Rein additiv, idempotent,
-- Default-erhaltend: Bestands-Aufgaben bekommen task_kind 'aufgabe' + data '{}' — kein Backfill, kein Verhaltensbruch.
-- `raw_data` bleibt Intake-reserviert (app_intake_items) — TABU. tenant_id/authority_id NOT NULL + append-only-Audit
-- bleiben unveraendert die Store-Invarianten; data-Mutationen laufen ab Phase 1.5 NUR ueber den auditierten DossierPort.

ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS task_kind text NOT NULL DEFAULT 'aufgabe';
ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;
