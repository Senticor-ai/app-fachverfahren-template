# Domain-Module

Konkrete Fachverfahren werden hier als Domain-Module angelegt.

```text
modules/<domain>/
  domain.module.yaml
  contracts/
  server/
  ui/
  forms/
  permissions/
  events/
  migrations/
  i18n/
  tests/
  compliance/
```

Vor der Implementierung eines Screens gehoert ein Screen Contract in das Modul,
zum Beispiel:

```text
modules/<domain>/ui/<screen>.contract.yaml
```

Nutze `docs/ux-ui/screen-contract.template.yaml` als Vorlage. Schreibe zuerst
Tests und Storybook-Zustaende fuer Loading, Empty, Error, Ready,
Rollen-/Rechte-Sichtbarkeit und Accessibility.

## Vorlagen und Beispiele

- `modules/_template/` ist die kopierbare Skeleton-Struktur fuer neue
  Fachverfahren.
- `modules/neutral-example/` ist ein neutrales Beispielverfahren mit Manifest,
  Screen Contracts, Storybook, Tests, Permissions, Events, Migrationen und
  Compliance-Profil.

Pruefung:

```bash
pnpm run check:domain-contracts
```

Der Template-Runtime-Code bleibt domain-neutral. Validierungsszenarien wie
Hundesteuer duerfen hier in einem separaten Modul entstehen, aber nicht in die
Plattformpakete zurueckkopiert werden.
