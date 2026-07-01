# Fachverfahren App Platform Template

[![CI pipeline](https://gitlab.opencode.de/govtech-deutschland/platform-instances/deutschland-platform/senticor/senticor-app-fachverfahren-template/badges/main/pipeline.svg)](https://gitlab.opencode.de/govtech-deutschland/platform-instances/deutschland-platform/senticor/senticor-app-fachverfahren-template/-/pipelines)
[![License: EUPL-1.2](https://img.shields.io/badge/license-EUPL--1.2-blue)](LICENSE)

**English summary:** This repository provides a reusable public-sector
application template for case-management portals and citizen services. It
combines a React/Fastify starter app, German/EU jurisdiction profiles,
capability contracts, provider adapters, conformance tooling and a template
lifecycle so GovTech teams can create maintainable domain applications instead
of long-lived forks.

Dieses Repository ist der Startpunkt für wiederverwendbare
Fachverfahren- und Bürgerapp-Stacks auf Kubernetes. Es ist bewusst nicht nur
eine kopierbare App-Vorlage: Der wiederverwendbare Teil lebt in versionierten
Paketen, Provider-Packs, Jurisdiction-Packs und einem Conformance-Kit. Die
generierte Fachanwendung soll hauptsächlich Fachlogik enthalten.

![Sachbearbeitungsansicht mit Sidebar, Vorgangstabelle und Status-Chips](docs/assets/fachverfahren-template-sachbearbeitung.png)

## Zielbild

Die Architektur trennt vier Ebenen:

```text
Domain module
  -> public-sector capability contracts
  -> jurisdiction/provider adapters
  -> managed infrastructure services
```

Damit bleibt ein Fachverfahren portabel zwischen Plattformen, Ländern,
Kommunen und späteren SDK-Versionen. Codesphere ist ein Provider-Pack, Germany
ist ein Jurisdiction-Pack, und die D-Stack-Basisdienste werden als stabile
Capability-Ports modelliert.

## Deliverables

- `apps/fachverfahren-template`: dünne React/BFF-Vorlage für eine konkrete App.
- `packages/platform-contracts`: Capability-Ports für Identität, Datenaustausch,
  Nachweisabruf, Zahlung, Postfach und weitere Verwaltungsfähigkeiten.
- `packages/public-sector-sdk`: administrativer Domain-Kernel,
  Domain-Module-Manifeste, Runtime-Konfiguration, Authorization und Audit.
- `packages/public-sector-ui`: KERN-orientierte UI-Fassade auf ShadCN-Primitiven.
- `packages/fachverfahren-kit`: wiederverwendbare Fachverfahren-Bausteine
  auf Tailwind/shadcn-Basis; der Katalog fuer Build-Agenten steht in
  `docs/reference/fachverfahren-kit-components.md`.
- `packages/provider-*`: lokale, Codesphere- und DVC-Providerprofile.
- `packages/conformance-kit`: Compliance-Profile und Evidence-Bundle-Planung.
- `packages/migration-kit`: Migrationsprofile für Legacy-Fachverfahren.
- `jurisdictions/*`: EU- und Deutschland-Packs ohne `country === "DE"`-Logik in
  der App.

## Stack

- Node.js `>=24 <25`, pnpm, strict ESM und TypeScript `NodeNext`.
- Frontend: React, Vite, Tailwind CSS und ShadCN-Primitive hinter der
  Public-Sector-UI-Fassade.
- Backend: Fastify mit OpenAPI JSON unter `/api/openapi.json` und Swagger UI
  unter `/api/v1/docs`.
- Datenbank: PostgreSQL-Migrationen über `@senticor/app-store-postgres` im
  `migrator`-Workload.
- Mocking: MSW für Browser-, Integrations- und E2E-Tests mit fachneutralen
  Login-/Logout- und Benachrichtigungsdaten.
- Design/TDD: Storybook, Screen Contracts, semantische Tokens und
  testgetriebene Domain-Module.

## Erste Schritte

```bash
mise install
pnpm install
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:storybook
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run dev
```

Die App läuft lokal als dünne Beispieloberfläche. Konkrete Fachverfahren
werden als Domain-Module unter `modules/<domain>/` ergänzt und über ein
`domain.module.yaml` beschrieben.

`pnpm install` richtet in Git-Checkouts Husky ein. Der Pre-Commit-Hook startet
`pnpm run check:precommit`; vor Pushes laeuft `pnpm run check:push`. Details
stehen in `docs/reference/precommit-hooks.md`.

Designer und Fachseite starten mit:

```bash
pnpm run storybook
```

Die UX/UI-Regeln stehen in `docs/ux-ui/fachverfahren-ux-contract.md`, die
TDD-Regeln in `docs/reference/test-driven-development.md` und die
Storybook-Nutzung in `docs/reference/storybook.md`. Der wiederverwendbare
Komponenten-Katalog fuer Coding Agents steht in
`docs/reference/fachverfahren-kit-components.md`. Mockdaten und MSW sind in
`docs/reference/mock-data-msw.md` beschrieben.

Der erste E2E-Pfad prüft Anmeldung, Rollenwechsel, Benutzereinstellungen,
Posteingang/Ausgang und RBAC für Bürgerinnen/Bürger und Sachbearbeitung. Für
den echten PostgreSQL-Servicepfad:

```bash
APP_E2E_PG_URL=postgres://app:app@localhost:5432/app \
APP_E2E_PG_DIRECT_URL=postgres://app:app@localhost:5432/app \
pnpm run test:e2e:postgres
```

Im Kubernetes-Profil liest die Web-App `APP_PG_URL` aus dem Secret
`app-postgresql`, Migrationen nutzen `APP_PG_DIRECT_URL` im `migrator`-Job.

Für lokale Entwicklung mit echter Datenbank liegt ein Kubernetes-Manifest unter
`dev/postgres.yaml`. Es funktioniert mit Rancher Desktop und Docker Desktop,
wenn Kubernetes aktiviert ist.

PostgreSQL starten und lokal auf Port `5432` weiterleiten:

```bash
pnpm run dev:postgres
```

BFF, Vite und Port-Forwarding gemeinsam starten:

```bash
pnpm run dev:all
```

`dev:all` nutzt `concurrently`, setzt die lokalen Datenbank-URLs für den BFF
und leitet Vite-API-Aufrufe an `http://127.0.0.1:8080` weiter.

Coding Agents nutzen `agent.discovery.json`, `docs/agents/bootstrap.md` und die
repo-lokalen Skills unter `.agents/skills`. Die Agent-Readiness und der
Standalone-Export sind in `docs/reference/opencode-agent-readiness.md`
beschrieben.

Vendor-neutrale Agenten starten mit Package-Script `agent:discover`, wählen
danach mit `agent:context` den task-spezifischen Kontext und erzeugen neue
Module aus App-Spezifikationen mit `app:new`.

GitLab-/opencode.de-Image-Builds nutzen Kaniko statt Docker-in-Docker, weil die
Runner als unprivilegierte Kubernetes-Pods laufen. Der Dockerfile-Vertrag,
Kaniko-Job und die pnpm-Filterreihenfolge sind in
`docs/reference/ci-image-builds.md` beschrieben.

GitHub `main` ist die kanonische Quelle. Nach erfolgreicher GitHub-CI wird der
validierte Commit automatisch nach GitLab/openCode gespiegelt:

```text
https://gitlab.opencode.de/govtech-deutschland/platform-instances/deutschland-platform/senticor/senticor-app-fachverfahren-template
```

Der Mirror-Workflow nutzt `GITLAB_MIRROR_TOKEN`; optional kann
`GITLAB_MIRROR_URL` das Ziel ueberschreiben.

Vollständige neue App-Repositories werden über den Template-Lifecycle erzeugt:

```bash
pnpm run scaffold:domain-app -- --domain beispiel --target /tmp/app-beispiel
```

Provenienz, Ownership, Updates, Migrationen und Fleet-Befehle stehen in
`docs/reference/template-lifecycle.md`.

App-Spezifikationen liegen unter `docs/examples/*/app.spec.yaml`. Sie erzeugen
Domain-Module mit `module.contract.yaml`; Capability-IDs und verbotene
Reimplementierungen stehen in `platform/capabilities.json`.

## Projekt und Community

- Sicherheitsmeldungen: `SECURITY.md`
- Verhaltenskodex: `CODE_OF_CONDUCT.md`
- Änderungen und Release-Hinweise: `CHANGELOG.md`
- Öffentliche Adopter und Evaluierungen: `ADOPTERS.md`

## Wichtige Regeln

- Dokumentation ist deutsch; Code, Typen, Variablen und Paketnamen sind Englisch.
- Fachlogik nutzt Ports aus `platform-contracts`, nie direkt Provider-SDKs.
- Browser-Konfiguration ist öffentlich und schema-versioniert.
- Geheimnisse, interne Upstreams und Service-Bindings bleiben serverseitig.
- Barrierefreiheit, Authorization, Audit, Mandate, Retention und Evidence sind
  Plattformfähigkeiten, keine späteren Add-ons.

## Troubleshooting

Wenn `pnpm run dev` wegen eines fehlenden Binaries wie `vite` abbricht, fehlen
die lokalen Workspace-Abhängigkeiten. In diesem Fall im Repository-Root erneut
installieren:

```bash
pnpm install
pnpm run dev
```

Das passiert auch, wenn zuvor production-only installiert wurde.
Der App-Dev-Start nutzt `scripts/run-vite-dev.mjs`, damit Vite sowohl aus dem
App-Workspace als auch aus dem Repository-Root aufgelöst werden kann.

Der Vite-Dev-Server bindet lokal standardmäßig an `127.0.0.1:5173`. Für
Container- oder LAN-Zugriff kann der Host explizit geöffnet werden:

```bash
VITE_DEV_HOST=0.0.0.0 pnpm run dev
```
