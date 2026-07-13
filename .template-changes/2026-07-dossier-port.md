---
bump: minor
updateMode: review
migration: none
---

# Auditierter DossierPort — `patchTaskDataWithActivity` + `patchCaseDataWithAudit` (Dual-Mode Phase 1.5)

Zwei symmetrische, auditierte Nähte für Dossier-`data`-Mutationen — die EINZIGEN Wege,
über die die freie `data`-Nutzlast von Aufgabe bzw. Akte verändert werden darf
(Kern-Invariante des Dossier-Modus: KEINE `data`-Mutation ohne Protokoll):

- `TaskStore.patchTaskDataWithActivity(...)` — mutiert `app_tasks.data` (Ziele/Sub-
  Sammlungen) + emittiert append-only `app_task_activity` in derselben TX.
- `CaseStore.patchCaseDataWithAudit(...)` — mutiert `app_cases.data` (die langlebige
  Akte selbst) + schreibt append-only `app_audit_events` in derselben TX, OHNE
  Statuswechsel (anders als `transitionCase` — eine Akte lebt in einem Zustand fort).

Beide: flacher Merge auf oberster Ebene (jsonb `||` / Objekt-Spread), Optimistic-
Locking über `expectedVersion`, Guard vor jeder Mutation (`DossierActivityInvalidError`
bzw. `DossierAuditInvalidError`, HTTP 422) — fehlende Behörde oder ein Protokoll, das
auf einen anderen Task/Fall zeigt, wirft OHNE zu schreiben (Rollback-Parität).

## `patchTaskDataWithActivity`

Neue Store-Methode `TaskStore.patchTaskDataWithActivity(...)` — die auditierte Naht für
Dossier-`data`-Mutationen der Aufgabe (Kern-Invariante: KEINE `data`-Mutation ohne
Protokoll). Sie patcht die `data`-Nutzlast einer Aufgabe (flacher
Merge auf oberster Ebene, jsonb `||` bzw. Objekt-Spread — Patch-Key ersetzt
gleichnamigen Bestand) UND emittiert in DERSELBEN Transaktion eine append-only-
`app_task_activity`. Schlägt der Aktivitäts-Insert fehl, rollt der `data`-Patch mit
zurück (Muster wie `insertCommentWithActivity`/`transitionCase`).

Rein additiv: keine Migration, keine Signatur-Änderung bestehender Methoden. `patchTask`
(Metadaten) bleibt unverändert und rührt `data` NICHT an — Dossier-Nutzlast wandert
ausschließlich über den DossierPort.

Härtungen (`DossierActivityInvalidError`, HTTP 422):
- **Guard `missing-authority`** — die begleitende Aktivität MUSS eine `authorityId`
  tragen. Die DB erzwingt das NICHT (`app_task_activity.authority_id` ist nullable für
  Altbestand), daher der App-Guard. Läuft VOR jeder Mutation.
- **Guard `task-mismatch` / `authority-mismatch`** — die Aktivität muss exakt zur
  mutierten Aufgabe (Mandant + `taskId`) und deren Behörde gehören (kein fremdes/
  fremdbehördliches Protokoll).
- **Optimistic-Locking** über optionales `expectedVersion`; die Version steigt bei
  jedem Patch.

InMemory==Postgres-Parität: der InMemory-Store nutzt einen Staging/Rollback-Shim (alle
Prüfungen VOR der ersten Mutation; die beiden Schreibvorgänge dann synchron-unteilbar
ohne dazwischenliegendes `await`), spiegelt so PG `BEGIN..ROLLBACK`. Contract-Paritäts-
test deckt Happy-Path-Merge, Guard-Rollback (data + Version + Aktivitätszahl
unverändert), `task-mismatch` und Version-Konflikt gegen beide Laufzeiten ab.

Konsumenten erben die Methode automatisch (verbatim kopiertes `app-store-postgres`).
Legitimiert die folgenden Dossier-Phasen (Ziele/Checkliste, integrai-Screen): jede
Dossier-Datenänderung ist ab jetzt strukturell revisionssicher.
