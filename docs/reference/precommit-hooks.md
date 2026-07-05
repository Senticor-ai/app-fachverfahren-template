# Pre-Commit Hooks

Dieses Repository nutzt Husky für lokale Git-Hooks. Die Hooks sind ein
schnelles Sicherheitsnetz, ersetzen aber nicht die CI.

## Installation

```bash
pnpm install
```

Der `prepare`-Schritt richtet Husky ein, wenn `.git` vorhanden ist. In
Container-Builds oder exportierten Source-Artefakten ohne `.git` wird die
Einrichtung bewusst übersprungen.

Manuell ausführen:

```bash
pnpm run check:precommit
pnpm run check:push
```

## Pre-Commit-Gate

`.husky/pre-commit` erzeugt zuerst den Vertrags-Snapshot neu
(`pnpm --filter @senticor/fachverfahren emit:contract`). Hat sich
`apps/fachverfahren/leistung.contract.json` dadurch geändert (Config
geändert, aber `emit:contract` vergessen — z. B. eine
Leichte-Sprache-Anreicherung nach dem letzten Snapshot), bricht der Commit
ab: Diff prüfen, `git add apps/fachverfahren/leistung.contract.json`,
Commit erneut versuchen. Erst danach läuft `pnpm run check:precommit`. Der
Check umfasst:

- staged Git-Hygiene (`git diff --cached --check`)
- Secret-Smoke-Scan
- neue Runtime-Env-Variablen müssen in `.env.example` dokumentiert werden
- File-Length-Grenze für versehentlich zu große Dateien
- strict ESM Policy
- TypeScript-only Source Policy
- Storybook Coverage Gate
- CSS Token Alias Gate
- Template TypeScript Gate
- Prettier Format-Check
- ESLint
- TypeScript Project References
- Vitest

## Commit-Message-Gate

`.husky/commit-msg` erzwingt Conventional-Commit-artige Betreffzeilen:

```text
<type>(optional-scope): <subject>
```

Zulässige Typen sind `feat`, `fix`, `refactor`, `test`, `docs`, `chore`,
`ci`, `perf`, `style`, `build` und `security`.

## Pre-Push-Gate

`.husky/pre-push` ruft `pnpm run check:push` auf. Dieser lokale CI-Näherungswert
läuft über `check:ci` und ergänzt das Pre-Commit-Gate um Build,
Kubernetes-Render-Test und Evidence-Plan.

## Bypass

Nur in begründeten Ausnahmefällen:

```bash
git commit --no-verify
```

Oder für Installationsumgebungen:

```bash
HUSKY=0 pnpm install
```

CI muss die gleichen oder strengere Gates ausführen. Ein lokaler Bypass ist
keine Freigabe.
