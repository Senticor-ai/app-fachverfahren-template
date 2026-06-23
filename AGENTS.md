# AGENTS.md

Kanonische Arbeitsanweisung fuer Coding Agents in diesem Repository.

## Zweck

Dieses Repository baut eine wiederverwendbare Public-Sector-App-Plattform fuer
Fachverfahren, Buergerapps und interne Verwaltungsprozesse. Es ist nicht als
dauerhaft geforkte Einmalvorlage gedacht. Wiederverwendbare Logik gehoert in
versionierte Pakete; konkrete Fachlogik gehoert in Domain-Module.

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
  externes Beispielprompt unter `docs/examples/hundesteuer/`.

## Runtime- und Toolchain-Vertrag

- Node.js `>=24 <25`.
- pnpm ist der einzige Paketmanager.
- Das Repository ist strict ESM: alle Workspaces deklarieren `"type": "module"`,
  TypeScript nutzt `NodeNext`, relative Imports enden in `.js`.
- Implementierungsquellen sind TypeScript-only. Unter `apps/`, `packages/`,
  `jurisdictions/` und `modules/` sind `.ts` und `.tsx` die erlaubten
  Quellformate. `.js`, `.jsx`, `.cjs` und `.mjs` sind dort nicht zulässig,
  außer generierten Assets wie dem MSW Worker.
- `pnpm run check:esm` muss fuer Plattformaenderungen bestanden werden.
- `pnpm run check:typescript-policy` muss für App-, Package-, Jurisdiction- und
  Domain-Modul-Änderungen bestanden werden.

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

Das Manifest beschreibt Routen, benoetigte Capabilities, Rechte, Events,
Datenkategorien, Retention-Policies und Migrationen. Tooling und Agents sollen
vom Manifest aus scaffolden.

Vor UI-Implementierung muss ein Screen Contract existieren. Vorlage:
`docs/ux-ui/screen-contract.template.yaml`. Vorgehen und Teststrategie:
`docs/reference/test-driven-development.md`.

Fuer fruehe UI-, Integrations- und E2E-Tests stehen fachneutrale MSW-Mocks fuer
Login, Logout, Sitzung und Benachrichtigungen bereit. Details:
`docs/reference/mock-data-msw.md`. Fachliche Mockdaten gehoeren in das jeweilige
Domain-Modul, nicht in die Basis-App.

## UI

`packages/public-sector-ui` ist der oeffentliche UI-Vertrag. KERN-Muster und
verwaltungsspezifische Komponenten stehen vor ShadCN. ShadCN bleibt
Implementierungsdetail fuer Primitive.

Der verbindliche UX/UI-Vertrag steht in
`docs/ux-ui/fachverfahren-ux-contract.md`. Generische Guidance wird dort in
Repository-Regeln uebersetzt; Hundesteuer bleibt nur ein externes Beispiel.
Der aktuelle Abgleich zum Fachverfahren Design Manual steht in
`docs/ux-ui/fachverfahren-design-manual-audit.md`.
Der aktuelle Abgleich zur generischen UX-Methodik steht in
`docs/ux-ui/ux-methodik-public-sector-audit.md`; offene Abweichungen muessen als
RC-Gap sichtbar bleiben, nicht in der App versteckt werden.
Bei UI-, Storybook- oder Screen-Contract-Aenderungen ist zusaetzlich
`.claude/skills/ux-ui/SKILL.md` anzuwenden.

Jede neue UI-Funktion braucht:

- Tastaturbedienbarkeit
- sinnvolle Semantik und Landmarks
- sichtbaren Fokus
- Fehlermeldungen mit Recovery-Pfad
- Storybook- und Testzustand fuer Default, Loading, Empty, Error und relevante
  Accessibility-Varianten

Designer nutzen Storybook als gemeinsame Review-Flaeche:
`docs/reference/storybook.md`. Neue Exports aus `public-sector-ui` muessen in
Storybook sichtbar sein und `pnpm run check:storybook` bestehen.

## Backend, OpenAPI und Migrationen

Das BFF/Backend basiert auf Fastify und TypeScript. Route-Schemas sind die
OpenAPI-Quelle. OpenAPI JSON liegt unter `/api/openapi.json`; Swagger UI unter
`/api/v1/docs`.

Datenbankmigrationen laufen ueber `@senticor/app-store-postgres` im
`migrator`-Workload. Web-Replicas fuehren keine Migrationen beim Start aus.
Fachverfahren legen eigene Migrationen in `modules/<domain>/migrations/` ab.
Plattformdaten fuer Benutzereinstellungen, RBAC und Posteingang/Ausgang liegen
in `@senticor/app-store-postgres`; produktive App-Datenendpunkte nutzen
PostgreSQL ueber `APP_PG_URL` oder `APP_PG_DIRECT_URL`.
Der erste vertikale App-Datenpfad liegt unter
`apps/fachverfahren-template/e2e` und prueft Login, Rollen,
Benutzereinstellungen sowie Posteingang/Ausgang.
Mit `APP_E2E_PG_URL` und optional `APP_E2E_PG_DIRECT_URL` prueft
`pnpm run test:e2e:postgres` denselben Pfad gegen PostgreSQL.

Agent-spezifische Kurzskills liegen unter `.claude/skills/`. Fuer komplette
Fachverfahren- oder Buergerportal-Slices ist
`.claude/skills/fachverfahren-app/SKILL.md` der Startpunkt.

Vor Abschluss neuer oder geaenderter Domain-Module ausfuehren:

```bash
pnpm run check:domain-contracts
```

## Authorization und Audit

Rollen in der UI sind keine Autorisierung. Entscheidungen gehoeren serverseitig
in Policy-Checks mit Authority-, Jurisdiction-, Tenant-, Mandate- und
Case-Kontext. Fachliche Audit-Events sind append-only und getrennt von
technischen Logs und Security Events.

Eingebaute Rollen sind `citizen` und `caseworker`. Neue Rollen werden ueber die
RBAC-Registry in `@senticor/public-sector-sdk`, Migrationen und API-Tests
erweitert; keine verstreuten Rollenbedingungen im UI-Code.

## Verifikation

Vor Abschluss einer Aenderung nach Moeglichkeit ausfuehren:

```bash
pnpm run precommit:check
pnpm run format:check
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:storybook
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run test:e2e:postgres
pnpm run test:k8s:render
pnpm run evidence:build
```

Wenn Abhaengigkeiten nicht installiert sind, dokumentiere das klar im Ergebnis.
