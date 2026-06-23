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
pnpm run precommit:check
```

## Pre-Commit-Gate

`.husky/pre-commit` ruft `pnpm run precommit:check` auf. Der Check umfasst:

- strict ESM Policy
- TypeScript-only Source Policy
- Storybook Coverage Gate
- CSS Token Alias Gate
- Prettier Format-Check
- ESLint
- TypeScript Project References
- Vitest

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
