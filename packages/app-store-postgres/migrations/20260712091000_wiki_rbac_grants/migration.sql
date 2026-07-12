-- Wissensbasis/Wiki (#20) — RBAC-Grants: die Domain-API-Routen /api/wiki[/:id][/revisions] prüfen `wiki.read`, das
-- kommende Authoring (Phase 3, POST/PATCH) `wiki.write`. Ohne diese Grants bekäme selbst die Rolle `caseworker`
-- (Sachbearbeitung) in Produktion 403 auf die Wissensbasis — die e2e-Tests bemerken das nicht, weil sie die
-- Permissions direkt per Header injizieren (dieselbe Lücke wie bei den PM-Grants 20260710120400).
--
-- Additiv + idempotent (ON CONFLICT DO NOTHING) — bricht bestehende Grants nicht. Spiegelt rbac.ts (builtInPermissions
-- .wikiRead/.wikiWrite + caseworker-Grant): EINE Wahrheit über beide Pfade (x-roles ↔ DB-Grants).

INSERT INTO app_rbac_permissions (permission_key, description)
VALUES
  ('wiki.read', 'Wissensbasis/Wiki-Artikel und -Revisionen lesen'),
  ('wiki.write', 'Wiki-Artikel anlegen/aktualisieren (versioniert)')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO app_rbac_role_permissions (role_key, permission_key)
VALUES
  ('caseworker', 'wiki.read'),
  ('caseworker', 'wiki.write')
ON CONFLICT (role_key, permission_key) DO NOTHING;
