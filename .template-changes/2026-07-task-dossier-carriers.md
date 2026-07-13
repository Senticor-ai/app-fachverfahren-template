---
bump: minor
updateMode: review
migration: none
---

# `app_tasks` — `task_kind` + `data`-Nutzlast (Dual-Mode Phase 1b)

Additive Schema-Migration `20260713120100_task_dossier_carriers`: `app_tasks` erhält
`task_kind text NOT NULL DEFAULT 'aufgabe'` (freier Typ-Diskriminator; später z. B.
`'ziel'`/`'checkliste-item'` für Dossier-Sub-Sammlungen, ohne Schema-Churn) und
`data jsonb NOT NULL DEFAULT '{}'` (frei-formige Nutzlast eines Sub-Sammlungs-
Eintrags, z. B. Ziel-Kategorie/Deadline/Completion-Flag).

Spiegelt Phase 1a (`app_cases`): rein additiv, idempotent (`ADD COLUMN IF NOT
EXISTS`), Default-erhaltend — Bestands-Aufgaben bekommen `task_kind 'aufgabe'` +
`data '{}'`, kein Backfill, kein Verhaltensbruch. `raw_data` bleibt Intake-reserviert
(`app_intake_items`) — TABU.

`AppTask` trägt jetzt optionale `taskKind?`/`data?`-Felder (InMemory==Postgres,
Contract-Paritätstest: Default `aufgabe`/`{}`, Dossier-Nutzlast round-trippt,
`patchTask` erhält beide). Konsumenten erben die DB-Migration automatisch (verbatim
kopierte `migrations/`). So bilden Ziele (Task mit `task_kind='ziel'` + Checkliste
via `parent_task_id`), Notizen (`app_task_comments`) und Termine (`due_at`) die
integrai-Sub-Sammlungen ohne dediziertes `SubCollectionDef`-Framework ab.
