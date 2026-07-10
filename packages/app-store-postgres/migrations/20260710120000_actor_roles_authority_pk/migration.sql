-- PM-Upgrade — Zuständigkeit: ein Akteur kann DIESELBE Rolle in MEHREREN Behörden eines Mandanten halten.
-- Der ursprüngliche Primärschlüssel (tenant_id, actor_id, role_key) verhinderte das: ein zweites INSERT für eine
-- andere Behörde kollidierte auf dem PK und überschrieb (via ON CONFLICT) die authority_id — die erste Behörde ging
-- verloren, und der KI-Zuständigkeitsfilter entschied still falsch. Der PK wird um authority_id erweitert.
-- Forward-only + idempotent: bestehende Zeilen sind bereits eindeutig auf dem 3-Spalten-PK, also erst recht auf dem
-- 4-Spalten-PK — der Umbau ist verlustfrei.

ALTER TABLE app_actor_roles DROP CONSTRAINT IF EXISTS app_actor_roles_pkey;
ALTER TABLE app_actor_roles ADD PRIMARY KEY (tenant_id, actor_id, role_key, authority_id);
