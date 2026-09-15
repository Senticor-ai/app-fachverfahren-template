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

`.husky/pre-commit` prüft zuerst die FRISCHE des Vertrags-Snapshots — und
fasst dabei weder Worktree noch Index an. Es zieht die Laufzeit-Closure von
`emit:contract` per `git show :<pfad>` aus dem **Index** in ein
Temp-Verzeichnis (`emit-contract.mts`, `leistung.config.ts`,
`contract-snapshot.ts` plus die gestagte `leistung.contract.json`), emittiert
dort und vergleicht. Weicht das Ergebnis vom gestagten Snapshot ab (Config
geändert, aber `emit:contract` vergessen — z. B. eine
Leichte-Sprache-Anreicherung nach dem letzten Snapshot), bricht der Commit ab
und verlangt `pnpm --filter @senticor/fachverfahren emit:contract` plus
`git add apps/fachverfahren/leistung.contract.json`.

> Warum aus dem Index und nicht über `git stash push --keep-index`: bei einer
> echt teilweise gestagten Datei (`MM`) rundet der Pop nicht sauber und kann
> Konfliktmarker in die Quelle schreiben. Das ist eine Git-Eigenschaft, kein
> Fehler des Skripts.

Erst danach läuft `pnpm run check:precommit`. Das ist
`check:git-hygiene && check:fast`:

**`check:git-hygiene`** (`scripts/git-hooks/git-hygiene.sh`) — läuft nur, wenn
überhaupt etwas gestaged ist:

- `git diff --cached --check` (Whitespace-Fehler im Staged-Diff)
- File-Length-Grenze für versehentlich zu große Dateien
- neue Runtime-Env-Variablen müssen in `.env.example` dokumentiert werden
- Secret-Smoke-Scan

**`check:fast`** (`tooling/check/run-checks.mjs`) liest die Kette
`precommit:check` aus `package.json` — **`package.json` ist die Wahrheit über
das, WAS läuft** — und fährt ihre 23 Einträge NEBENLÄUFIG statt seriell. Der
Runner stoppt nicht beim ersten Fehler, sondern nennt am Ende alle und schreibt
`reports/checks.json`. Welche Einträge NICHT überlappen dürfen, steht als DATEN
in `tooling/check/lanes.json` — heute genau ein Paar: `typecheck` vor `test`
(`tsc -b` schreibt `dist/`, vitest liest es). Die 23 Einträge:

`check:esm` · `check:typescript-policy` · `check:domain-contracts` ·
`check:leistung-contract` · `check:procedure-contract` · `check:bpmn-example` ·
`check:antrag-procedure` · `check:composables` · `check:storybook` ·
`check:css-tokens` · `check:motion` · `check:template-types` ·
`check:agent-discovery` · `check:module-contracts` · `check:module-boundaries` ·
`check:capability-catalog` · `check:source-registry` ·
`check:template-invariants` · `check:scaffold` · `format:check` · `lint` ·
`typecheck` · `test`

In **keinem** Tor verdrahtet und nur manuell zu fahren sind
`check:docs-manifest`, `check:runbook-commands` und `check:docs-language`.

## Commit-Message-Gate

`.husky/commit-msg` erzwingt Conventional-Commit-artige Betreffzeilen:

```text
<type>(optional-scope): <subject>
```

Zulässige Typen sind `feat`, `fix`, `refactor`, `test`, `docs`, `chore`,
`ci`, `perf`, `style`, `build` und `security`.

## Pre-Push-Gate

`.husky/pre-push` ruft `pnpm run check:push` (= `check:ci`,
`scripts/ci-validate.sh`) auf und danach `pnpm run test:generated-app-ci`.

`check:ci` fährt in dieser Reihenfolge: `build:packages`, `check:precommit`,
`check:dockerfile-paths`, `build:app`, `build:server`, `check:web-delivery`,
`check:openapi`, `smoke:runtime`, `test:e2e`. Mit `CI_PROFILE=full` (Default)
kommen `test:k8s:render`, `check:k8s-delivery`, `test:supply-chain` und
`evidence:build` dazu; `CI_PROFILE=core` lässt genau diese vier weg — es sind
die Schritte, die schweres Fremdwerkzeug (kubeconform, conftest, syft, trivy)
und Netz brauchen.

`HUSKY_SKIP_PRE_PUSH=1` überspringt den ganzen Hook. `SKIP_SCAFFOLD_CI=1`
überspringt nur die Scaffolded-App-Health — und nur LOKAL: in CI (`CI=true`)
wird der Schalter ignoriert und das Gate läuft trotzdem.

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
