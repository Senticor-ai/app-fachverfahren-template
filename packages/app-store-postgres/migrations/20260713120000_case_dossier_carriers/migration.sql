-- Dual-Mode Phase 1: app_cases traegt jetzt (a) einen frei-formigen `data`-jsonb-Nutzlast-Traeger fuer den DOSSIER-
-- Modus (Akte-Stammfelder einer langlebigen Subjekt-/Fall-Instanz, wie das Ziel-Fachverfahren integrai — der
-- Vorgang/Antrag-Modus laesst ihn leer) und (b) einen `case_kind`-Diskriminator (spiegelt LeistungConfig.kind:
-- 'vorgang'|'dossier'). Rein additiv, idempotent, Default-erhaltend: Bestandsfaelle bekommen data '{}' und case_kind
-- 'vorgang' — kein Verhaltensbruch, kein Backfill noetig. `raw_data` bleibt Intake-reserviert (app_intake_items);
-- die Nutzlast der langlebigen Akte lebt HIER, nicht dort. Mandanten-/Behoerden-Scope (tenant_id/authority_id NOT
-- NULL) + append-only-Audit bleiben unveraendert die Store-Invarianten.

ALTER TABLE app_cases ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app_cases ADD COLUMN IF NOT EXISTS case_kind text NOT NULL DEFAULT 'vorgang';
