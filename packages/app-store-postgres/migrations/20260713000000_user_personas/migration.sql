-- Per-User-Personas (Arbeitsbereiche: buerger | sachbearbeitung | aufsicht) + Workspace-Rolle
-- 'citizen' (Self-Signup) + principal_version (Invalidierungs-/Nebenläufigkeits-Anker).
--
-- FAIL-CLOSED + REPLAY-SICHER: Die Persona-Spalten entstehen zunächst NULLABLE — NULL ist der
-- Legacy-Marker. Nur Zeilen von VOR der Einführung sind NULL und bekommen den Backfill (alle
-- drei Arbeitsbereiche = bisheriges Verhalten). Danach leerer Default + NOT NULL: neue Konten
-- starten OHNE Arbeitsbereiche, jede Anlage entscheidet explizit. Ein nach der Migration
-- bewusst leeres Konto ('{}') wird bei erneutem Lauf dieses SQLs NICHT erneut befüllt.
-- Der Migrator (migrate.ts) führt die Datei in EINER Transaktion mit Advisory-Lock aus.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS local_personas text[];

UPDATE app_users
SET local_personas = ARRAY['buerger','sachbearbeitung','aufsicht']::text[]
WHERE local_personas IS NULL;

ALTER TABLE app_users
  ALTER COLUMN local_personas SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN local_personas SET NOT NULL;

-- Externe (OIDC-)Zuweisungen: getrennte Quelle; Bestand hat keine → leer.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS oidc_personas text[];

UPDATE app_users
SET oidc_personas = ARRAY[]::text[]
WHERE oidc_personas IS NULL;

ALTER TABLE app_users
  ALTER COLUMN oidc_personas SET DEFAULT ARRAY[]::text[],
  ALTER COLUMN oidc_personas SET NOT NULL;

-- Autoritäts-Policy der Persona-Pflege (local | oidc_authoritative | oidc_additive).
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS persona_management_mode text NOT NULL DEFAULT 'local';

-- Versioniert JEDE principal-relevante Mutation (Status, Rollen, beide Persona-Quellen,
-- Modus) — Basis für optimistische Nebenläufigkeit (If-Match) und künftige Invalidierung.
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS principal_version bigint NOT NULL DEFAULT 1;

-- Kanonische Wertebereiche: erlaubte Strings, keine NULL-Elemente, max. Tripel-Kardinalität.
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_local_personas_allowed;
ALTER TABLE app_users ADD CONSTRAINT app_users_local_personas_allowed CHECK (
  local_personas <@ ARRAY['buerger','sachbearbeitung','aufsicht']::text[]
  AND array_position(local_personas, NULL) IS NULL
  AND cardinality(local_personas) <= 3
);

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_oidc_personas_allowed;
ALTER TABLE app_users ADD CONSTRAINT app_users_oidc_personas_allowed CHECK (
  oidc_personas <@ ARRAY['buerger','sachbearbeitung','aufsicht']::text[]
  AND array_position(oidc_personas, NULL) IS NULL
  AND cardinality(oidc_personas) <= 3
);

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_persona_mode_allowed;
ALTER TABLE app_users ADD CONSTRAINT app_users_persona_mode_allowed CHECK (
  persona_management_mode IN ('local', 'oidc_authoritative', 'oidc_additive')
);

-- Workspace-Rolle 'citizen' (selbstregistrierte Bürger:innen, KEINE Workspace-Permissions).
-- Der inline-CHECK aus 20260712000000_workspace_foundation trägt den Auto-Namen
-- app_users_role_check (in der Temp-PG-Probe verifiziert).
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (
  role IN ('admin', 'member', 'citizen')
);
