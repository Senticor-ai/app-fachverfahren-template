---
bump: minor
updateMode: review
migration: none
---

# `app_cases` — Dossier-Nutzlast-Träger + `case_kind` (Dual-Mode Phase 1)

Additive Schema-Migration `20260713120000_case_dossier_carriers`: `app_cases` erhält
`data jsonb NOT NULL DEFAULT '{}'` (frei-formiger Nutzlast-Träger der langlebigen
Akte im Dossier-Modus) und `case_kind text NOT NULL DEFAULT 'vorgang'` (Modus-
Diskriminator, spiegelt `LeistungConfig.kind`).

Rein additiv + idempotent (`ADD COLUMN IF NOT EXISTS`), Default-erhaltend: Bestands-
fälle bekommen `data '{}'` und `case_kind 'vorgang'` — kein Backfill, kein
Verhaltensbruch. `raw_data` bleibt Intake-reserviert (`app_intake_items`); die Akte-
Nutzlast lebt HIER. Mandanten-/Behörden-Scope (`tenant_id`/`authority_id NOT NULL`)

- append-only-Audit bleiben unverändert die Store-Invarianten.

`AppCase` trägt jetzt optionale `caseKind?`/`data?`-Felder (InMemory==Postgres,
Contract-Paritätstest); beim Schreiben optional (Store defaultet). Konsumenten
erben die DB-Migration automatisch (verbatim kopierte `migrations/`); keine
Template-Datei-Migration nötig. Der Dossier-Modus mutiert `data` ab Phase 1.5 NUR
über den auditierten DossierPort (append-only-Activity in derselben Transaktion).
