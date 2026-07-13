---
bump: minor
updateMode: review
migration: none
---

# Dossier-Aufgaben-Filter — `ListTasksQuery.caseId` + `.taskKind` (Dual-Mode Phase 3b)

`ListTasksQuery` erhält zwei additive, optionale Filter:

- `caseId?` — schränkt auf die Aufgaben genau eines Falls/einer Akte ein
  (`app_tasks.case_id`). Die Dossier-Ansicht listet damit die Ziele/Termine EINER
  Klient:innen-Akte.
- `taskKind?` — schränkt auf einen Aufgaben-Typ ein (z. B. `'ziel'`), damit die Ansicht
  die Ziele einer Akte OHNE deren Checkliste-Items/Termine zieht.

Beide sind reine zusätzliche Prädikate (In-Memory-Filter bzw. `AND (... IS NULL OR ...)`
in der Postgres-Query, parametrisiert) — bestehende Aufrufer ohne die Felder verhalten
sich unverändert. Damit ist die Store-Abfrage-Fläche für Dossier-Ansichten vollständig:
`listTasks(caseId, taskKind)` liefert die Ziele-Liste, `aggregateChildFlag` den
LIMIT-freien Checklisten-Fortschritt.

Rein additiv, keine Migration. Contract-Paritätstest InMemory==Postgres (caseId grenzt
korrekt ein, taskKind zieht nur die Ziele). Der integrai-Modellierungs-Beweis listet die
Ziele der Akte jetzt über diesen Filter. Konsumenten erben die Felder automatisch.
