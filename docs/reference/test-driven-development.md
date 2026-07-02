# Test Driven Development

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST für Vitest-Tests, Storybook, Screen Contracts,
> Web-Delivery-/Fastify-Runtime-Tests und Kubernetes-/Evidence-Checks; PLAN für
> fachliche Backend-API-, MSW- und E2E-Ebenen (die Scripts
> `test:e2e`/`test:e2e:postgres` existieren noch nicht).
> Quellen: `package.json`-Scripts, `vitest.config.ts`, `AGENTS.md`.
> Pflicht-Lektüre vorher: `AGENTS.md`.

Dieses Repository soll Fachverfahren testgetrieben ermöglichen. TDD heißt hier
nicht nur Unit-Tests, sondern ein prüfbarer Vertrag aus Domain-Regeln,
Capabilities, API, UI, Accessibility und Evidence.

## Ablauf

1. Screen Contract oder Capability Contract schreiben.
2. Fehlenden Test schreiben.
3. Minimal implementieren.
4. Refaktorieren, ohne den Vertrag zu verändern.
5. Storybook-State oder Evidence aktualisieren.

## Testpyramide

- Domain-Kernel: reine Unit-Tests für Zustände, Fristen, Versionen,
  Retention-Regeln und Berechtigungsentscheidungen.
- Naht-Berechnung: die `berechne`-Funktion der `LeistungConfig` ist rein und
  deterministisch und wird gegen die Beispielwerte des Fachkonzepts getestet.
- Platform Contracts: Contract-Tests für Ports und Adapter.
- Fastify-Runtime: `inject`-Tests für Delivery-Header, Health, Runtime-Config,
  interne Endpunkte und Shutdown-Semantik.
- Fachliche Backend-API (PLAN): Fastify `inject`-Tests für Routen,
  OpenAPI-Schemas, Fehlerpfade und Autorisierung.
- E2E (PLAN): eine vertikale Strecke aus Login, Rollen,
  Benutzereinstellungen, Posteingang/Ausgang und RBAC; die Scripts
  `test:e2e`/`test:e2e:postgres` existieren noch nicht.
- Mocking (PLAN): MSW-Handler, siehe `docs/reference/mock-data-msw.md`.
- Datenbank: Migrationstests, Checksum-Drift, Rollback- und Restore-Szenarien
  (`packages/app-store-postgres`, `packages/migration-kit`).
- UI: Component-Tests und Storybook-Stories für alle Screen States.
- Formulare: Feld-Validierung kommt aus `antrag.steps` der `LeistungConfig`
  (`required`, `pattern`); Storybook- und Komponentenzustände prüfen die
  Inline-Fehler. Schemas unter `forms/*.form.schema.json` gehören zum
  (PLAN-)Modul-Pfad.
- Kubernetes/Evidence: Render-, Policy- und Evidence-Bundle-Checks.

## Domain-Modul-Struktur (PLAN)

Gilt für Module aus dem Generator-Pfad (`app:new`, siehe
`modules/README.md`); im Scaffold existiert keine Instanz.

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

Tests gehören in das Domain-Modul, wenn sie Fachlogik prüfen. Tests gehören in
Plattformpakete, wenn sie wiederverwendbare Vertrage prüfen.

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

## Red-Green-Refactor für UI

- Red: Story oder Test beschreibt den erwarteten Zustand und scheitert.
- Green: Komponente erfüllt den Zustand mit minimalem Code.
- Refactor: Layout, Tokens und Wiederverwendung verbessern.

## Pflicht-Failure-Paths

Neue Fachverfahren testen mindestens:

- doppelte Einreichung oder Callback.
- externer Dienst nicht erreichbar.
- Warnung blockiert nicht, Fehler blockiert.
- Schema-Regeln wie Pflichtfeld und `pattern` erzeugen vor dem Absenden
  verständliche Inline-Fehler.
- Loading, empty, error, ready und success pro Screen.
- offene Frist und überfällige Frist.
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
pnpm run test:k8s:render
pnpm run evidence:build
```

Wenn neue Storybook-Abdeckung hinzukommt:

```bash
pnpm run storybook
pnpm run build:storybook
pnpm run typecheck:storybook
```

Die geplante Mock-Schicht ist in `docs/reference/mock-data-msw.md`
beschrieben (PLAN).
