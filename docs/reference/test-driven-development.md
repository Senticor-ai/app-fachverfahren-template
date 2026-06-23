# Test Driven Development

Dieses Repository soll Fachverfahren testgetrieben ermoeglichen. TDD heisst hier
nicht nur Unit-Tests, sondern ein pruefbarer Vertrag aus Domain-Regeln,
Capabilities, API, UI, Accessibility und Evidence.

## Ablauf

1. Screen Contract oder Capability Contract schreiben.
2. Fehlenden Test schreiben.
3. Minimal implementieren.
4. Refaktorieren, ohne den Vertrag zu veraendern.
5. Storybook-State oder Evidence aktualisieren.

## Testpyramide

- Domain-Kernel: reine Unit-Tests fuer Zustaende, Fristen, Versionen,
  Retention-Regeln und Berechtigungsentscheidungen.
- Platform Contracts: Contract-Tests fuer Ports und Adapter.
- Backend: Fastify `inject`-Tests fuer Routen, OpenAPI-Schemas, Fehlerpfade und
  Autorisierung.
- E2E: `apps/fachverfahren-template/e2e` prüft die erste vertikale Strecke aus
  Login, Rollen, Benutzereinstellungen, Posteingang/Ausgang und RBAC.
- PostgreSQL-E2E: `pnpm run test:e2e:postgres` nutzt
  `APP_E2E_PG_URL` und optional `APP_E2E_PG_DIRECT_URL`, führt Migrationen aus
  und prüft dieselbe Strecke gegen den echten Datenbankdienst.
- Mocking: MSW-Handler fuer Browser-, Node- und E2E-Tests, damit UI und
  Integration frueh gegen stabile API-Zustaende laufen.
- Datenbank: Migrationstests, Checksum-Drift, Rollback- und Restore-Szenarien.
- UI: Component-Tests und Storybook-Stories fuer alle Screen States.
- Kubernetes/Evidence: Render-, Policy- und Evidence-Bundle-Checks.

## Domain-Modul-Struktur

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

Tests gehoeren in das Domain-Modul, wenn sie Fachlogik pruefen. Tests gehoeren in
Plattformpakete, wenn sie wiederverwendbare Vertrage pruefen.

## Screen Contract

Jeder UI-Screen hat einen Contract:

```yaml
id: case-inbox
route: /cases
owner: domain-module
persona: caseworker
inputs:
  - cases[]
  - activeRole
  - jurisdictionConfig
outputs:
  - case.opened
  - filter.changed
states:
  - loading
  - empty
  - error
  - ready
  - success
ia:
  pattern: master-detail
  navigation:
    - role-gated sidebar entries
  profile:
    - profile, settings and logout remain reachable from shell
  scroll:
    - list and detail panel scroll independently
content:
  language:
    - precise German microcopy for administrative work
  architectureTerms:
    - no basis-service, port or adapter wording in primary UI
hcai:
  mode: none
  controls:
    - AI output is marked, sourced and overrideable when present
a11y:
  landmarks:
    - main
  keyboard:
    - Tab reaches filter controls
    - Enter opens focused row
  focusOrder:
    - heading
    - primary filter
    - table
  zoom:
    - 400 percent zoom reflows without function loss
  statusSemantics:
    - status uses text or icon plus color
tests:
  unit:
    - filters cases by authority and role
  storybook:
    - default
    - empty
    - error
    - success
    - keyboard focus
```

## Red-Green-Refactor fuer UI

- Red: Story oder Test beschreibt den erwarteten Zustand und scheitert.
- Green: Komponente erfuellt den Zustand mit minimalem Code.
- Refactor: Layout, Tokens und Wiederverwendung verbessern.

## Pflicht-Failure-Paths

Neue Fachverfahren testen mindestens:

- doppelte Einreichung oder Callback.
- externer Dienst nicht erreichbar.
- Warnung blockiert nicht, Fehler blockiert.
- Loading, empty, error, ready und success pro Screen.
- offene Frist und ueberfaellige Frist.
- fehlende Nachweise.
- Rollenwechsel und nicht erlaubte Route.
- Restore oder Migration in leerer Umgebung, wenn Datenbank betroffen ist.

## Kommandos

```bash
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:domain-contracts
pnpm run check:storybook
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run test:e2e:postgres
pnpm run test:k8s:render
pnpm run evidence:build
```

Wenn neue Storybook-Abdeckung hinzukommt:

```bash
pnpm run storybook
pnpm run build:storybook
pnpm run typecheck:storybook
```

Mockdaten und MSW sind in `docs/reference/mock-data-msw.md` beschrieben.
