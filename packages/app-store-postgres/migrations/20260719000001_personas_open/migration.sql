-- Personas OEFFNEN — der bisherige CHECK (Migration 20260713000000_user_personas) erlaubte NUR die 3
-- kanonischen Personas (`local_personas <@ ARRAY['buerger','sachbearbeitung','aufsicht']`) und maximal drei
-- (`cardinality <= 3`). Das war die HAERTESTE Grenze der Generalitaet: ein Fachverfahren konnte serverseitig
-- keine eigenen Personas fuehren (Beschaffung: requester/approver/einkauf/lieferant; HR: antragsteller/
-- vorgesetzter/personalstelle) — jedes 4.-Persona-Insert schlug auf Postgres fehl.
--
-- WARUM LOCKERBAR: Personas sind AUSSCHLIESSLICH Produkt-Erlebnis/Navigation, NIE Autorisierung (die trifft
-- der Server ueber RBAC/Permissions). Ein offener Wertebereich ist daher unbedenklich. Behalten wird NUR die
-- Integritaets-Pruefung (keine NULL-Elemente). Rueckwaertskompatibel: bestehende Werte erfuellen die weitere
-- Menge; kein Backfill. Additiv + idempotent (DROP IF EXISTS + neu).

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_local_personas_allowed;
ALTER TABLE app_users ADD CONSTRAINT app_users_local_personas_allowed CHECK (
  array_position(local_personas, NULL) IS NULL
);

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_oidc_personas_allowed;
ALTER TABLE app_users ADD CONSTRAINT app_users_oidc_personas_allowed CHECK (
  array_position(oidc_personas, NULL) IS NULL
);
