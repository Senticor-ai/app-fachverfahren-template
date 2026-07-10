-- PM-Upgrade — Deadline-Scanner-Fortschritt: `deadline_emitted_at` markiert, für welchen Fristzeitpunkt (`due_at`)
-- bereits ein `frist-erreicht`-Event emittiert wurde. Ohne diesen Marker bliebe jede erreichte Frist DAUERHAFT im
-- „fällig"-Ergebnis (die Fristregel setzt Status/Label, aber nie `due_at`): jeder Poller-Tick würde dieselben
-- überfälligen Aufgaben re-scannen (Schreib-Sturm) und — sobald mehr als das LIMIT-Fenster akkumuliert — NEUERE
-- Fristen dauerhaft verdrängen (still verpasste Fristen). Mit dem Marker emittiert der Scanner je Frist GENAU EINMAL;
-- eine VERSCHOBENE Frist (`due_at` wandert über `deadline_emitted_at` hinaus) feuert wieder.
-- Additiv + idempotent (IF NOT EXISTS) — bestehende Aufgaben starten mit NULL (= noch nicht emittiert).

ALTER TABLE app_tasks ADD COLUMN IF NOT EXISTS deadline_emitted_at timestamptz;

-- Fällige, noch nicht emittierte Fristen effizient auffindbar.
CREATE INDEX IF NOT EXISTS app_tasks_due_unemitted_idx
  ON app_tasks (tenant_id, authority_id, procedure_id, due_at)
  WHERE due_at IS NOT NULL;
