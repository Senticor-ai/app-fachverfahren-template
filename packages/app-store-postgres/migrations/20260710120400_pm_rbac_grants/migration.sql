-- PM-Upgrade — RBAC-Grants: die Berechtigungen der verfahrensübergreifenden Management-Ebene (Aufgaben/Board/Inbox/
-- Vermerke/Ansichten/Automation/KI-Assistenz) EXISTIEREN als Deklaration (pm-module-manifest.ts) und werden von den
-- Domain-API-Routen geprüft, waren aber KEINER Rolle gewährt. Ergebnis vor dieser Migration: selbst die Rolle
-- `caseworker` (Sachbearbeitung) hätte in Produktion auf ALLE /api/tasks · /api/inbox · /api/automations · /api/views ·
-- /api/tasks/:id/ai-Routen 403 bekommen — die server-autoritative Management-Ebene wäre komplett tot hinter der RBAC.
-- (Die e2e-Tests bemerken das nicht, weil sie die Permissions direkt per Header injizieren.)
--
-- Diese Migration legt die Permissions an und gewährt sie der Sachbearbeitungs-Rolle `caseworker` (die einzige
-- SB-Rolle der Vorlage; reale Deployments verfeinern die Rollen weiter, z. B. `automation.write`/`view.share` in eine
-- erhöhte Rolle). Additiv + idempotent (ON CONFLICT DO NOTHING) — bricht bestehende Grants nicht.

INSERT INTO app_rbac_permissions (permission_key, description)
VALUES
  ('task.read', 'Aufgaben im Mandanten-Scope lesen'),
  ('task.write', 'Aufgaben-Metadaten (Priorität/Zuweisung/Label/Board/Frist) ändern'),
  ('inbox.read', 'Triage-Eingang lesen'),
  ('inbox.triage', 'Eingang annehmen/ablehnen/triagieren (erzeugt Vorgang)'),
  ('comment.read', 'Interne Vermerke einer Aufgabe lesen (nur Sachbearbeitung)'),
  ('comment.write', 'Internen Vermerk anlegen (append-only)'),
  ('view.read', 'Gespeicherte Ansichten lesen'),
  ('view.write', 'Ansicht speichern/löschen'),
  ('view.share', 'Ansicht als geteilt speichern (erhöhtes Recht)'),
  ('audit.read', 'Append-only Audit eines Falls lesen'),
  ('automation.read', 'Automations-Regeln und -Läufe lesen'),
  ('automation.write', 'Automations-Regeln anlegen/aktiv schalten/simulieren'),
  ('ai.assist', 'KI-Assistenz anfordern/übernehmen (assistiv, Mensch entscheidet)')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO app_rbac_role_permissions (role_key, permission_key)
VALUES
  ('caseworker', 'task.read'),
  ('caseworker', 'task.write'),
  ('caseworker', 'inbox.read'),
  ('caseworker', 'inbox.triage'),
  ('caseworker', 'comment.read'),
  ('caseworker', 'comment.write'),
  ('caseworker', 'view.read'),
  ('caseworker', 'view.write'),
  ('caseworker', 'view.share'),
  ('caseworker', 'audit.read'),
  ('caseworker', 'automation.read'),
  ('caseworker', 'automation.write'),
  ('caseworker', 'ai.assist')
ON CONFLICT (role_key, permission_key) DO NOTHING;
