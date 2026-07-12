# Template-Lifecycle

Das Fachverfahren-Template ist eine versionierte Plattform-Basis. Vollständige
Apps werden nicht als einmalige Kopie behandelt, sondern tragen Provenienz,
Eigentumsregeln und eine updatefähige Template-CLI.

## Full-Repo-Scaffold

Für opencode.de-fähige Apps ist der Full-Repo-Scaffold der Standard:

```bash
pnpm run scaffold:domain-app -- --domain fachverfahren --display-name Fachverfahren --target /tmp/app-fachverfahren --allow-existing-empty
```

Der Scaffold verweigert eine nicht saubere Template-Quelle. `--allow-dirty`
darf nur nach bewusster Freigabe verwendet werden und schreibt Dirty-Provenienz
in `.template/lock.json`. `--force` ersetzt ein Zielverzeichnis vollständig;
für existierende leere Zielverzeichnisse `--allow-existing-empty` verwenden.

Der app-only Export bleibt separat:

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

## Provenienz

Jeder Full-Repo-Scaffold enthält:

- `.template/answers.json`: stabile Eingaben wie Domain, Anzeigename und
  Features.
- `.template/lock.json`: Template-Quelle, Template-Version, Commit,
  Generator-Version und angewandte Migrationen.
- `.template/ownership.yaml`: Aktualisierungsstrategie je Pfad.
- `.template/README.md`: kurze Erklärung der Metadaten.

Diese Dateien enthalten keine Zeitstempel und keine lokalen Maschinenpfade.

## Ownership

Die Strategien sind:

- `replace`: Template besitzt die ganze Datei.
- `merge`: Drei-Wege-Merge mit der alten Template-Version als Basis.
- `structured-merge`: bekannte JSON-/YAML-Schlüssel werden gezielt angepasst.
- `consumer`: Template-Updates fassen den Pfad nicht an.

Erklärung für einen Pfad:

```bash
pnpm run template:explain -- apps/fachverfahren/src/domain/example.ts
```

`template:update` ergänzt neue Standard-Einträge des Templates automatisch in
`.template/ownership.yaml` (sichtbar in der Report-Sektion „Ownership
Updates"); bestehende Einträge des Konsumenten gewinnen dabei immer. Wer einen
Pfad dauerhaft vom Template ausnehmen will, setzt die Strategie auf
`consumer`, statt die Zeile zu löschen — gelöschte Einträge werden beim
nächsten Update wieder ergänzt. Strategie-Änderungen an bestehenden Einträgen
propagiert das Template nur über Migrationen.

## Update-Workflow

Status und Prüfung:

```bash
pnpm run template:status
pnpm run template:doctor
```

Vorschau:

```bash
pnpm run template:diff -- --to 0.2.0
pnpm run template:upgrade -- --from 0.1.0 --to 0.2.0 --dry-run
```

Update:

```bash
pnpm run template:update -- --to 0.2.0
```

`template:upgrade` ist der agentenlesbare Upgrade-Vertrag mit Angaben zu
Ownership, Migrationen, Kompatibilität und Capability-Deprecations.
`template:update` bleibt als rückwärtskompatibler Befehl erhalten.

`template:update` verlangt einen sauberen Git-Worktree. Bei Konflikten erzeugt
der Befehl einen präzisen Bericht, statt still halb angewandte Änderungen
liegen zu lassen.

## Migrationen

Strukturelle Änderungen liegen unter `tooling/template/migrations/<id>/` und
bestehen aus `migration.json`, `up.ts` und `migration.test.ts`.

Neue Migration:

```bash
pnpm run template:migration:new -- --id 2026-06-ci-component
```

Migrationen müssen idempotent, deterministisch, dry-run-fähig und durch Tests
abgedeckt sein.

## Release und Fleet

Jede Template-Änderung mit Consumer-Wirkung braucht ein Fragment unter
`.template-changes/`:

```bash
pnpm run template:change -- --bump minor --update-mode review --migration 2026-06-template-lifecycle
```

Fleet-Befehle erzeugen Status- und MR-Pläne. Sie pushen nicht direkt auf
Default-Branches:

```bash
pnpm run template:consumers:status
pnpm run template:consumers:mr -- --to 0.2.0
```

## Checks

Template-Source prüfen:

```bash
pnpm run test:template
pnpm run check:template-invariants
```

Generierten Scaffold prüfen:

```bash
pnpm run check:scaffold
pnpm run check:scaffold-reproducible
```
