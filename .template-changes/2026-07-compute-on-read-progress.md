---
bump: minor
updateMode: review
migration: none
---

# compute-on-read Ziele-Fortschritt — `TaskStore.aggregateChildFlag` (Dual-Mode Phase 3a)

Neue Store-Methode `TaskStore.aggregateChildFlag(...)` — aggregiert je Eltern-Aufgabe
(`parentTaskId` ∈ `parentTaskIds`) die Kinder eines `taskKind` und liefert pro Elternteil
`{ total, gesetzt }`, wobei `gesetzt` zählt, wie viele Kinder ein boolesches `data`-Flag
gesetzt haben (`data->>flagKey = 'true'`, deckt jsonb-Boolean `true` UND String `"true"`).

Motivation (aus dem integrai-Modellierungs-Beweis, Phase 1.5c): der Ziele-Fortschritt
(Checkliste erledigt/gesamt) darf NICHT über `listTasks` projiziert werden — das kappt bei
200 Zeilen und würde den Fortschritt bei großen Checklisten verfälschen. Diese Methode ist
die dedizierte, **LIMIT-FREIE** Aggregation:

- Postgres: `COUNT(*)` + `COUNT(*) FILTER (WHERE data->>$flagKey = 'true')` `GROUP BY
  parent_task_id` — kein Cap, keine geladenen Kind-Zeilen, der Flag-Key ist parametrisiert.
- InMemory: iteriert über ALLE Kinder (kein Cap), gruppiert nach `parentTaskId`.

Wertneutral: der Flag-Key ist ein Parameter (die Domäne übergibt `flagKey='erledigt'`,
`taskKind='checkliste-item'`), der Store kennt keine Domänen-Semantik. Eltern ohne passende
Kinder erscheinen NICHT im Ergebnis (Aufrufer behandelt Fehlen als 0/0). Der Fortschritt %
wird projiziert, NIE redundant persistiert.

Rein additiv, keine Migration. Contract-Paritätstest InMemory==Postgres mit **> 200 Kindern**
(beweist die Cap-Vermeidung: `listTasks` liefert < N, die Aggregation den vollen Zählstand).
Konsumenten erben die Methode automatisch (verbatim kopiertes `app-store-postgres`).
