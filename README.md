# Fachverfahren App Platform Template

[![CI](https://github.com/Senticor-ai/app-fachverfahren-template/actions/workflows/ci.yml/badge.svg)](https://github.com/Senticor-ai/app-fachverfahren-template/actions/workflows/ci.yml)
[![License: EUPL-1.2](https://img.shields.io/badge/license-EUPL--1.2-blue)](LICENSE)

**English summary:** This repository provides a reusable public-sector
application template for case-management portals and citizen services. It
combines a ready-to-run React app (three personas rendered from one typed
config), German/EU jurisdiction profiles, capability contracts, provider
adapters, conformance tooling and a template lifecycle so GovTech teams can
create maintainable domain applications instead of long-lived forks.

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

- `apps/fachverfahren`: die EINE dünne Kit-Kompositions-App (3 Personas); der governte Build überschreibt nur `src/leistung.config.ts`.
- `packages/platform-contracts`: Capability-Ports für Identität, Datenaustausch,
  Nachweisabruf, Zahlung, Postfach und weitere Verwaltungsfähigkeiten.
- `packages/public-sector-sdk`: administrativer Domain-Kernel,
  Domain-Module-Manifeste, Runtime-Konfiguration, Authorization und Audit.
- `packages/public-sector-ui`: KERN-orientierte UI-Fassade auf ShadCN-Primitiven.
- `packages/fachverfahren-kit`: wiederverwendbare Fachverfahren-Bausteine
  auf Tailwind/shadcn-Basis; der Katalog für Build-Agenten steht in
  `docs/reference/fachverfahren-kit-components.md`.
- `packages/provider-*`: lokale, Codesphere- und DVC-Providerprofile.
- `packages/conformance-kit`: Compliance-Profile und Evidence-Bundle-Planung.
- `packages/migration-kit`: Migrationsprofile für Legacy-Fachverfahren.
- `jurisdictions/*`: EU- und Deutschland-Packs ohne `country === "DE"`-Logik in
  der App.

## Stack

- Node.js `>=24 <25`, pnpm, strict ESM und TypeScript `NodeNext`.
- Frontend: React, Vite, Tailwind CSS und ShadCN-Primitive hinter dem
  `fachverfahren-kit` und der Public-Sector-UI-Fassade.
- Datenbank: PostgreSQL-Migrator und Plattformtabellen in
  `@senticor/app-store-postgres` (`pnpm run db:migrate`).
- Backend/BFF: server-autoritative Fastify-Domain-API unter
  `apps/fachverfahren/server/` (Policy-Gate, Optimistic Locking via If-Match,
  append-only Audit, Postgres-Store, Automations-Engine + KI-Assist-Endpunkte).
  Zielarchitektur und OpenAPI-Ausbau in `docs/reference/backend-fastify.md`.
- Design/TDD: Storybook, Screen Contracts, semantische Tokens.

## Erste Schritte

```bash
mise install
pnpm install
pnpm run check:esm
pnpm run check:typescript-policy
pnpm run check:storybook
pnpm run typecheck
pnpm run test
pnpm run dev
```

Die App läuft lokal als vollständige, klickbare 3-Personas-Oberfläche
(Bürger:in, Sachbearbeitung, Aufsicht). Ein konkretes Fachverfahren entsteht,
indem die EINE Austausch-Naht `apps/fachverfahren/src/leistung.config.ts`
mit Fachdaten gefüllt wird; danach den Vertrags-Snapshot aktualisieren:

```bash
pnpm --filter @senticor/fachverfahren emit:contract
```

Die verbindliche Arbeitsanweisung für Menschen und Coding Agents steht in
`AGENTS.md` (inklusive kanonischer Pfad-Karte und PLAN-vs-IST-Markierungen).

`pnpm install` richtet in Git-Checkouts Husky ein. Der Pre-Commit-Hook
regeneriert zuerst den Vertrags-Snapshot (`emit:contract`) und startet danach
`pnpm run check:precommit`; vor Pushes laeuft `pnpm run check:push`. Details
stehen in `docs/reference/precommit-hooks.md`.

Designer und Fachseite starten mit:

```bash
pnpm run storybook
```

Die UX/UI-Regeln stehen in `docs/ux-ui/fachverfahren-ux-contract.md`, die
TDD-Regeln in `docs/reference/test-driven-development.md` und die
Storybook-Nutzung in `docs/reference/storybook.md`. Der wiederverwendbare
Komponenten-Katalog für Coding Agents steht in
`docs/reference/fachverfahren-kit-components.md`. Die geplante Mock-Schicht
ist in `docs/reference/mock-data-msw.md` beschrieben (PLAN).

Im Kubernetes-Profil liest die Web-App `APP_PG_URL` aus dem Secret
`app-postgresql`, Migrationen nutzen `APP_PG_DIRECT_URL` im `migrator`-Job.

Für lokale Entwicklung mit echter Datenbank liegt ein Kubernetes-Manifest unter
`dev/postgres.yaml`. Es funktioniert mit Rancher Desktop und Docker Desktop,
wenn Kubernetes aktiviert ist. Migrationen laufen über:

```bash
pnpm run db:migrate
```

E2E-Suiten (`test:e2e`, `test:e2e:postgres`, `test:e2e:server`) prüfen die
Domain-API server-autoritativ (Vier-Augen, append-only Audit, Optimistic
Locking, Multi-Tenancy). Der PG-gebundene Teil läuft attended gegen ein echtes
Postgres (siehe `pnpm run db:migrate`).

Die Dokumentationsübersicht steht in `docs/README.md`. Coding Agents nutzen
`agent.discovery.json`, `docs/agents/bootstrap.md` und die repo-lokalen Skills
unter `.agents/skills`. Lifecycle und Standalone-Export beschreibt
`docs/reference/template-lifecycle.md`.

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
https://gitlab.opencode.de/govtech-deutschland/platform-instances/deutschland-platform/govtech-ai/govtech-ai-app-fachverfahren-template
```

Der Mirror-Workflow nutzt `GITLAB_MIRROR_TOKEN`; optional kann
`GITLAB_MIRROR_URL` das Ziel überschreiben. Ohne Token wird der Mirror-Schritt
mit Notice übersprungen, damit die eigentliche Validierungs-CI nicht wegen
fehlender Repository-Secrets rot wird.

## Verwendung als Template

Dieses Repository ist ein **versioniertes Template**, keine kopierbare
Vorlage. Neue Fachverfahren-Repositories entstehen ausschließlich über die
Scaffold-CLI:

```bash
pnpm run scaffold:domain-app -- --domain beispiel --target /tmp/app-beispiel
```

Die CLI schreibt die Domain-Identität um (Paketname, `apps/<domain>`,
Helm-Charts) und legt `.template/lock.json` als Provenienz an — die Basis für
spätere `template:update`-Migrationen und dafür, dass Template-eigene CI-Jobs
(z.B. `scaffold-health`) sich im Konsumenten selbst überspringen.

**Den Baum roh zu kopieren oder zu klonen ist als Konsumenten-Provisionierung
nicht unterstützt.** Eine Rohkopie behält die Vorlagen-Identität
(`senticor-app-fachverfahren-template`), erhält keine `.template/`-Provenienz
(und damit keinen Update-/Migrationspfad) und schleppt Template-eigene
CI-Jobs mit. Für bereits roh kopierte Bäume ist `template:adopt` der
Reparaturpfad.

Provenienz, Ownership, Updates, Migrationen und Fleet-Befehle stehen in
`docs/reference/template-lifecycle.md`.

App-Spezifikationen liegen unter `docs/examples/*/app.spec.yaml`. Der
Generator `pnpm run app:new` erzeugt daraus ein Modul-Gerüst unter
`modules/<domain>/`; die laufende App bindet solche Module derzeit nicht ein
(PLAN, siehe `modules/README.md`). Capability-IDs und verbotene
Reimplementierungen stehen in `platform/capabilities.json`.

## Projekt und Community

- Sicherheitsmeldungen: `SECURITY.md`
- Verhaltenskodex: `CODE_OF_CONDUCT.md`
- Beitragen: `CONTRIBUTING.md`
- Änderungen und Release-Hinweise: `CHANGELOG.md`
- Öffentliche Adopter und Evaluierungen: `ADOPTERS.md`

## Lizenz und Owner

Dieses Repository ist Open Source unter der **European Union Public Licence v. 1.2 (EUPL-1.2)** —
siehe [`LICENSE`](LICENSE). Copyright © 2024–2026 **Senticor GmbH** (Produkt: **Senticor AI**), die
das Projekt betreut. Beiträge werden unter derselben Lizenz (EUPL-1.2) eingebracht.

Mitgelieferte Open-Source-Komponenten und ihre Lizenzen sind in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) aufgeführt (Attribution nach EUPL-1.2 Art. 5).
Alle Produktions-Abhängigkeiten sind permissiv bzw. datei-/modulweise reziprok lizenziert; es gibt
kein starkes Copyleft und damit keinen Lizenzkonflikt mit der EUPL-1.2.

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

Der Vite-Dev-Server bindet lokal standardmäßig an `127.0.0.1:5173`. Für
Container- oder LAN-Zugriff kann der Host explizit geöffnet werden:

```bash
VITE_DEV_HOST=0.0.0.0 pnpm run dev
```
