# AGENTS.md

Kanonische Arbeitsanweisung für Coding Agents in diesem Repository.

## Zweck

Dieses Repository baut eine wiederverwendbare Public-Sector-App-Plattform für
Fachverfahren, Bürgerapps und interne Verwaltungsprozesse. Es ist nicht als
dauerhaft geforkte Einmalvorlage gedacht. Wiederverwendbare Logik gehört in
versionierte Pakete; konkrete Fachlogik gehört in Domain-Module.

## Architekturregel

Jede vertikale Fachfunktion folgt dieser Richtung:

```text
Domain module
  -> public-sector capability contracts
  -> jurisdiction/provider adapters
  -> managed infrastructure services
```

Domain-Code darf nicht direkt mit PostgreSQL, FIT-Connect, XBezahldienste,
NOOTS, Object Storage, RabbitMQ, OpenSearch oder Kubernetes sprechen. Nutze
Ports aus `@senticor/platform-contracts` und Profile aus den Provider-Packs.

## Sprache und Benennung

- User-facing Dokumentation und UI-Texte: Deutsch.
- Code, Typen, Variablen, Package-Namen, Env-Keys: Englisch.
- Keine Hundesteuer-Inhalte im Template-Runtime-Code. Hundesteuer ist nur ein
  externes Beispiel unter `docs/examples/hundesteuer/`.

## Runtime- und Toolchain-Vertrag

- Node.js `>=24 <25`.
- pnpm ist der einzige Paketmanager.
- Das Repository ist strict ESM: alle Workspaces deklarieren `"type": "module"`,
  TypeScript nutzt `NodeNext`, relative Imports enden in `.js`.
- Implementierungsquellen sind TypeScript-only. Unter `apps/`, `packages/`,
  `jurisdictions/` und `modules/` sind `.ts` und `.tsx` die erlaubten
  Quellformate. `.js`, `.jsx`, `.cjs` und `.mjs` sind dort nicht zulässig,
  außer generierten Assets wie dem MSW Worker.
- `pnpm run check:esm` muss für Plattformänderungen bestanden werden.
- `pnpm run check:typescript-policy` muss für App-, Package-, Jurisdiction- und
  Domain-Modul-Änderungen bestanden werden.

## CI und Container-Builds

OpenCode-/opencode.de-Runner laufen als unprivilegierte Kubernetes-Pods. Es
gibt keinen Docker-Socket und keine privilegierten Container; `docker:dind` ist
deshalb kein zulässiger Standard für Image-Builds. GitLab-CI-Beispiele und
Agenten-Skills verwenden Kaniko mit `.gitlab-ci.yml` als Referenz.

Im Dockerfile gilt:

- Build-Stage mit `USER root`, weil das opencode.de-Node-Image standardmäßig
  nicht als Root läuft und `pnpm` sonst bei `node_modules` scheitern kann.
- `ENV CI=true`, damit nichtinteraktive `pnpm`-Schritte wie `pnpm prune --prod`
  in Kaniko nicht abbrechen.
- Workspace-Pakete vor App und BFF bauen: `pnpm run build:packages`, danach
  `pnpm run build:app` und `pnpm run build:server`.

Bei pnpm-Filterbefehlen steht `--filter` vor `run`, damit Flags nicht an das
unterliegende Script weitergereicht werden:

```bash
pnpm --filter "./packages/**" run --if-present build
```

## Template-Lifecycle

Dieses Repository ist ein versioniertes Template, kein einmaliger Dateikopierer.
Neue vollständige Fachverfahren-Repositories werden über den TypeScript-CLI
erzeugt:

```bash
pnpm run scaffold:domain-app -- --domain beispiel --display-name Beispiel --target /tmp/app-beispiel --allow-existing-empty
```

Generierte Repositories enthalten `.template/answers.json`,
`.template/lock.json`, `.template/ownership.yaml` und `.template/README.md`.
Diese Dateien sind reproduzierbare Provenienz und dürfen keine Zeitstempel oder
lokalen Maschinenpfade enthalten.
Der Full-Repo-Scaffold verweigert eine nicht saubere Template-Quelle, sofern
kein Mensch `--allow-dirty` ausdrücklich akzeptiert. Für bereits existierende
leere Zielverzeichnisse `--allow-existing-empty` nutzen; `--force` bleibt für
bewusstes Ersetzen reserviert.

Alle Template-Lifecycle-Befehle laufen über `tooling/template/cli.ts`:

```bash
pnpm run template:status
pnpm run template:diff -- --to <version>
pnpm run template:update -- --to <version>
pnpm run template:doctor
pnpm run template:explain -- <path>
```

Template-Code wird testgetrieben und in TypeScript entwickelt. Vor Abschluss von
Template-Änderungen mindestens ausführen:

```bash
pnpm run test:template
pnpm run check:template-invariants
pnpm run check:scaffold
```

Runbook-Befehle dürfen keine Inline-Shell-Kommentare enthalten. Schreibe die
Erklärung vor den Codeblock, nicht hinter den Befehl.

## Domain-Module

Neue Fachverfahren werden unter `modules/<domain>/` modelliert:

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

Das Manifest beschreibt Routen, benötigte Capabilities, Rechte, Events,
Datenkategorien, Retention-Policies und Migrationen. Tooling und Agents sollen
vom Manifest aus scaffolden.

Vor UI-Implementierung muss ein Screen Contract existieren. Vorlage:
`docs/ux-ui/screen-contract.template.yaml`. Vorgehen und Teststrategie:
`docs/reference/test-driven-development.md`.

Für frühe UI-, Integrations- und E2E-Tests stehen fachneutrale MSW-Mocks für
Login, Logout, Sitzung und Benachrichtigungen bereit. Details:
`docs/reference/mock-data-msw.md`. Fachliche Mockdaten gehören in das jeweilige
Domain-Modul, nicht in die Basis-App.

## UI

`packages/public-sector-ui` ist der öffentliche UI-Vertrag. KERN-Muster und
verwaltungsspezifische Komponenten stehen vor ShadCN. ShadCN bleibt
Implementierungsdetail für Primitive.

Die wiederverwendbaren Fachverfahren-Bausteine liegen in
`packages/fachverfahren-kit/src/components/`; die shadcn/Radix/Tailwind-
Primitive liegen in `packages/fachverfahren-kit/src/ui/`. Coding Agents lesen
vor UI-Arbeit `docs/reference/fachverfahren-kit-components.md` und importieren
moeglichst ueber `@senticor/fachverfahren-kit`, statt Bausteine in
`modules/<domain>/` zu kopieren.

Der verbindliche UX/UI-Vertrag steht in
`docs/ux-ui/fachverfahren-ux-contract.md`. Generische Guidance wird dort in
Repository-Regeln übersetzt; Hundesteuer bleibt nur ein externes Beispiel.
Der aktuelle Abgleich zum Fachverfahren Design Manual steht in
`docs/ux-ui/fachverfahren-design-manual-audit.md`.
Der aktuelle Abgleich zur generischen UX-Methodik steht in
`docs/ux-ui/ux-methodik-public-sector-audit.md`; offene Abweichungen müssen als
RC-Gap sichtbar bleiben, nicht in der App versteckt werden.
Bei UI-, Storybook- oder Screen-Contract-Änderungen ist zusätzlich
`.agents/skills/ux-ui/SKILL.md` anzuwenden.

Design-Tokens haben zwei Ebenen: rohe HSL-Komponenten wie `--foreground` sind
nur Token-Quelle; Komponenten, Stories und generierter Code nutzen die
direkten `--color-*`-Aliasse wie `--color-text`, `--color-sidebar` und
`--color-status-warn`. Direkte Nutzung wie `color: var(--foreground)` ist
ungültig und wird durch `pnpm run check:css-tokens` blockiert.

Jede neue UI-Funktion braucht:

- Tastaturbedienbarkeit
- sinnvolle Semantik und Landmarks
- sichtbaren Fokus
- Fehlermeldungen mit Recovery-Pfad
- clientseitige Inline-Validierung für unterstützte Regeln aus
  `forms/*.form.schema.json`
- Storybook- und Testzustand für Default, Loading, Empty, Error und relevante
  Accessibility-Varianten

React-Komponenten dürfen nicht innerhalb von Render-Funktionen definiert
werden. Hilfskomponenten stehen auf Modulebene; lokale Render-Helfer werden als
Funktionsaufruf wie `{renderStep()}` verwendet, nicht als JSX-Komponente.

Designer nutzen Storybook als gemeinsame Review-Fläche:
`docs/reference/storybook.md`. Neue Exports aus `public-sector-ui` müssen in
Storybook sichtbar sein und `pnpm run check:storybook` bestehen.

## Backend, OpenAPI und Migrationen

Das BFF/Backend basiert auf Fastify und TypeScript. Route-Schemas sind die
OpenAPI-Quelle. OpenAPI JSON liegt unter `/api/openapi.json`; Swagger UI unter
`/api/v1/docs`.

Fastify validiert Request-Bodies vor dem Route-Handler. Tests für `401` müssen
einen schema-gültigen Body senden, sonst kommt zuerst `400`.

Datenbankmigrationen laufen über `@senticor/app-store-postgres` im
`migrator`-Workload. Web-Replicas führen keine Migrationen beim Start aus.
Fachverfahren legen eigene Migrationen in `modules/<domain>/migrations/` ab.
Plattformdaten für Benutzereinstellungen, RBAC und Posteingang/Ausgang liegen
in `@senticor/app-store-postgres`; produktive App-Datenendpunkte nutzen
PostgreSQL über `APP_PG_URL` oder `APP_PG_DIRECT_URL`.
Der erste vertikale App-Datenpfad liegt unter
`apps/fachverfahren-template/e2e` und prüft Login, Rollen,
Benutzereinstellungen sowie Posteingang/Ausgang.
Mit `APP_E2E_PG_URL` und optional `APP_E2E_PG_DIRECT_URL` prüft
`pnpm run test:e2e:postgres` denselben Pfad gegen PostgreSQL.

Agent-spezifische Kurzskills liegen kanonisch unter `.agents/skills/`. Für komplette
Fachverfahren- oder Bürgerportal-Slices ist
`.agents/skills/fachverfahren-app/SKILL.md` der Startpunkt.

Vendor-neutrale Agenten starten mit:

```bash
pnpm run agent:bootstrap -- --json
pnpm run agent:discover
pnpm run agent:context -- --task <app-spec> --paths <module-path>
```

`agent.discovery.json` ist die öffentliche Discovery-API. Default-JSON enthält
nur relative Pfade, sortierte Listen und keine Git- oder Maschinenprovenienz;
volatile Details gibt es nur mit `--provenance`.
`agent:context` liefert `nextCommands`, `validationProfiles` und
`writeBoundaries`; Agenten folgen dieser Reihenfolge, sofern der Nutzer keinen
engeren Scope vorgibt. `agent:verify` erzeugt oder validiert einen
`schemas/agent-run-report.schema.json`-konformen Abschlussbericht.

Jedes Domain-Modul braucht `module.contract.yaml`. Der Vertrag deklariert
Capabilities, öffentliche Exports, erlaubte Abhängigkeiten, Routen, Rollen,
Datenklassen, Retention, Events, Storage und erlaubte Domain-Pfade. Domain-
Begriffe dürfen in ihren App-Spezifikationen und erlaubten Modulpfaden
vorkommen, aber nicht in Plattformpaketen.

Plattformfähigkeiten stehen in `platform/capabilities.json` und den
Capability-Dokumenten unter `docs/capabilities/`. Fachmodule dürfen
Authentifizierung, Benachrichtigung, Zahlung, Workflow oder Audit nicht lokal
neu bauen, wenn sie eine Plattformfähigkeit konsumieren.

Gouvernierte Webquellen stehen in `sources/registry.yaml`; Agenten verwenden
`source:fetch` statt beliebiger Netzwerkzugriffe, wenn eine registrierte Quelle
betroffen ist.

Vor Abschluss neuer oder geänderter Domain-Module ausführen:

```bash
pnpm run check:domain-contracts
```

## Authorization und Audit

Rollen in der UI sind keine Autorisierung. Entscheidungen gehören serverseitig
in Policy-Checks mit Authority-, Jurisdiction-, Tenant-, Mandate- und
Case-Kontext. Fachliche Audit-Events sind append-only und getrennt von
technischen Logs und Security Events.

Eingebaute Rollen sind `citizen` und `caseworker`. Neue Rollen werden über die
RBAC-Registry in `@senticor/public-sector-sdk`, Migrationen und API-Tests
erweitert; keine verstreuten Rollenbedingungen im UI-Code.

## Verifikation

Vor Abschluss einer Änderung nach Möglichkeit ausführen:

```bash
pnpm run check:agent-smoke
pnpm run check:agent-domain
pnpm run check:agent-ui
pnpm run check:precommit
pnpm run check:push
pnpm run format:check
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:storybook
pnpm run check:css-tokens
pnpm run check:agent-discovery
pnpm run check:module-contracts
pnpm run check:module-boundaries
pnpm run check:capability-catalog
pnpm run check:source-registry
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run test:e2e:postgres
pnpm run test:k8s:render
pnpm run evidence:build
pnpm run test:template
pnpm run check:template-invariants
pnpm run check:scaffold
```

Wenn Abhängigkeiten nicht installiert sind, dokumentiere das klar im Ergebnis.
