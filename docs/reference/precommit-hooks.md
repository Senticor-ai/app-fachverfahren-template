# Pre-Commit Hooks

Dieses Repository nutzt Husky fuer lokale Git-Hooks. Die Hooks sind ein
schnelles Sicherheitsnetz, ersetzen aber nicht die CI.

## Installation

```bash
pnpm install
```

Der `prepare`-Schritt richtet Husky ein, wenn `.git` vorhanden ist. In
Container-Builds oder exportierten Source-Artefakten ohne `.git` wird die
Einrichtung bewusst uebersprungen.

Manuell ausfuehren:

```bash
pnpm run precommit:check
```

## Pre-Commit-Gate

`.husky/pre-commit` ruft `pnpm run precommit:check` auf. Der Check umfasst:

- strict ESM Policy
- TypeScript-only Source Policy
- Storybook Coverage Gate
- Prettier Format-Check
- ESLint
- TypeScript Project References
- Vitest

## Bypass

Nur in begruendeten Ausnahmefaellen:

```bash
git commit --no-verify
```

Oder fuer Installationsumgebungen:

```bash
HUSKY=0 pnpm install
```

CI muss die gleichen oder strengere Gates ausfuehren. Ein lokaler Bypass ist
keine Freigabe.
