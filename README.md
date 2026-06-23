# Fachverfahren App Platform Template

Dieses Repository ist der Startpunkt fuer wiederverwendbare
Fachverfahren- und Buergerapp-Stacks auf Kubernetes. Es ist bewusst nicht nur
eine kopierbare App-Vorlage: Der wiederverwendbare Teil lebt in versionierten
Paketen, Provider-Packs, Jurisdiction-Packs und einem Conformance-Kit. Die
generierte Fachanwendung soll hauptsaechlich Fachlogik enthalten.

## Zielbild

Die Architektur trennt vier Ebenen:

```text
Domain module
  -> public-sector capability contracts
  -> jurisdiction/provider adapters
  -> managed infrastructure services
```

Damit bleibt ein Fachverfahren portabel zwischen Plattformen, Laendern,
Kommunen und spaeteren SDK-Versionen. Codesphere ist ein Provider-Pack, Germany
ist ein Jurisdiction-Pack, und die D-Stack-Basisdienste werden als stabile
Capability-Ports modelliert.

## Deliverables

- `apps/fachverfahren-template`: duenne React/BFF-Vorlage fuer eine konkrete App.
- `packages/platform-contracts`: Capability-Ports fuer Identitaet, Datenaustausch,
  Nachweisabruf, Zahlung, Postfach und weitere Verwaltungsfaehigkeiten.
- `packages/public-sector-sdk`: administrativer Domain-Kernel,
  Domain-Module-Manifeste, Runtime-Konfiguration, Authorization und Audit.
- `packages/public-sector-ui`: KERN-orientierte UI-Fassade auf ShadCN-Primitiven.
- `packages/provider-*`: lokale, Codesphere- und DVC-Providerprofile.
- `packages/conformance-kit`: Compliance-Profile und Evidence-Bundle-Planung.
- `packages/migration-kit`: Migrationsprofile fuer Legacy-Fachverfahren.
- `jurisdictions/*`: EU- und Deutschland-Packs ohne `country === "DE"`-Logik in
  der App.

## Stack

- Node.js `>=24 <25`, pnpm, strict ESM und TypeScript `NodeNext`.
- Frontend: React, Vite, Tailwind CSS und ShadCN-Primitive hinter der
  Public-Sector-UI-Fassade.
- Backend: Fastify mit OpenAPI JSON unter `/api/openapi.json` und Swagger UI
  unter `/api/v1/docs`.
- Datenbank: PostgreSQL-Migrationen ueber `@senticor/app-store-postgres` im
  `migrator`-Workload.
- Mocking: MSW fuer Browser-, Integrations- und E2E-Tests mit fachneutralen
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

Die App laeuft lokal als duenne Beispieloberflaeche. Konkrete Fachverfahren
werden als Domain-Module unter `modules/<domain>/` ergaenzt und ueber ein
`domain.module.yaml` beschrieben.

`pnpm install` richtet in Git-Checkouts Husky ein. Der Pre-Commit-Hook startet
`pnpm run precommit:check`; Details stehen in
`docs/reference/precommit-hooks.md`.

Designer und Fachseite starten mit:

```bash
pnpm run storybook
```

Die UX/UI-Regeln stehen in `docs/ux-ui/fachverfahren-ux-contract.md`, die
TDD-Regeln in `docs/reference/test-driven-development.md` und die
Storybook-Nutzung in `docs/reference/storybook.md`. Mockdaten und MSW sind in
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

OpenCode-Agenten nutzen den repo-lokalen Skill
`.claude/skills/fachverfahren-app/SKILL.md`. Die Agent-Readiness und der
Standalone-Export sind in `docs/reference/opencode-agent-readiness.md`
beschrieben.

## Wichtige Regeln

- Dokumentation ist deutsch; Code, Typen, Variablen und Paketnamen sind Englisch.
- Fachlogik nutzt Ports aus `platform-contracts`, nie direkt Provider-SDKs.
- Browser-Konfiguration ist oeffentlich und schema-versioniert.
- Geheimnisse, interne Upstreams und Service-Bindings bleiben serverseitig.
- Barrierefreiheit, Authorization, Audit, Mandate, Retention und Evidence sind
  Plattformfaehigkeiten, keine spaeteren Add-ons.

## Troubleshooting

Wenn `pnpm run dev` wegen eines fehlenden Binaries wie `vite` abbricht, fehlen
die lokalen Workspace-Abhaengigkeiten. In diesem Fall im Repository-Root erneut
installieren:

```bash
pnpm install
pnpm run dev
```

Das passiert auch, wenn zuvor production-only installiert wurde.
Der App-Dev-Start nutzt `scripts/run-vite-dev.mjs`, damit Vite sowohl aus dem
App-Workspace als auch aus dem Repository-Root aufgeloest werden kann.

Der Vite-Dev-Server bindet lokal standardmaessig an `127.0.0.1:5173`. Fuer
Container- oder LAN-Zugriff kann der Host explizit geoeffnet werden:

```bash
VITE_DEV_HOST=0.0.0.0 pnpm run dev
```
