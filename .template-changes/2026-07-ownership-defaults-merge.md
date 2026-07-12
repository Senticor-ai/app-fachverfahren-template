---
bump: minor
updateMode: auto
migration: none
---

`template:update` merged neue `defaultOwnership`-Einträge automatisch in das
persistierte `.template/ownership.yaml` des Konsumenten (#24). Vorher blieben
Konsumenten, die vor einer Ownership-Ergänzung (z.B. `ci.yml: replace` aus #21)
gescaffoldet wurden, dauerhaft auf ihrem Snapshot: die neue Datei fiel auf den
`merge`-Fallback zurück und erschien als Schein-Konflikt statt als Replace.
Jetzt ergänzt der Update-Plan fehlende Default-Einträge vor der Planung
(bestehende Konsumenten-Einträge gewinnen immer), meldet sie in der neuen
Report-Sektion „Ownership Updates" (JSON: `ownershipUpdates`) und persistiert
sie beim Apply. Die Defaults stammen dabei aus der Ziel-Template-Quelle
(dynamischer Import ihres manifest.ts), nicht aus der laufenden — beim
Konsumenten-Update älteren — CLI; und breitere persistierte Muster zählen als
Override (ein `docs/**: consumer` blockiert einen neuen, spezifischeren
Default, statt per Longest-Match ausgehebelt zu werden). Opt-out: Strategie
auf `consumer` setzen statt die Zeile zu löschen — gelöschte Einträge werden
wieder ergänzt.

Die Scaffold-Exclusion der Template-Repo-internen GitHub-Workflows
(`scaffold-nightly.yml`, `deploy-demo-consumer.yml` via `repositoryOnlyPaths`)
kam bereits mit der Codesphere-CI-Härtung auf main; hier abgesichert durch
einen Render-Test: die generische `.github/workflows/ci.yml` und der
(substituierte) `mirror-gitlab.yml` werden weiterhin kopiert, die beiden
Template-only-Workflows nicht. Bestands-Konsumenten behalten ihre Kopien
(Entfernung wäre eine separate Migration).
