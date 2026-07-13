---
bump: patch
updateMode: auto
migration: none
---

# Fix: `aggregateChildFlag`-Postgres-SQL — Cast-Klammerung (Robustheit)

`(COUNT(*) FILTER (WHERE data->>$flagKey = 'true'))::int` wird jetzt explizit geklammert.
Ohne Klammern hängt es von der Cast-Präzedenz nach der `FILTER`-Klausel ab, ob PostgreSQL
den `::int`-Cast auf das Aggregat oder auf das `'true'`-Literal bezieht — eine Mehrdeutigkeit,
die nur auf dem Postgres-Pfad auftritt (die InMemory-Vertragstests decken sie nicht ab). Die
Klammerung ist eindeutig valide und verhaltensgleich. Kein API-/Schema-Bruch.
