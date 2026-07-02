# OpenCode Agent Readiness

Dieses Repository ist als Startpunkt für Coding Agents gedacht. Die folgenden
Artefakte beantworten die nächsten Anforderungen des OpenCode-Teams.

## Abdeckung

| Anforderung                 | Status    | Artefakt                                         |
| --------------------------- | --------- | ------------------------------------------------ |
| Vendor-neutraler Skill      | vorhanden | `.agents/skills/fachverfahren-app/SKILL.md`      |
| Discovery-Manifest          | vorhanden | `agent.discovery.json`                           |
| App-Spezifikation           | vorhanden | `docs/examples/*/app.spec.yaml`                  |
| Komponenten-Katalog         | vorhanden | `docs/reference/fachverfahren-kit-components.md` |
| Standalone Export           | vorhanden | `scripts/scaffold-standalone-app.mjs`            |
| Full-Repo-Scaffold          | vorhanden | `pnpm run scaffold:domain-app`                   |
| Manifest- und Screen-Checks | vorhanden | `pnpm run check:domain-contracts`                |
| Agent-Bootstrap             | vorhanden | `pnpm run agent:bootstrap -- --json`             |
| Validierungsprofile         | vorhanden | `check:agent-smoke/domain/ui/release`            |
| Golden Generated App        | vorhanden | `pnpm run test:golden-generated-app`             |

## Agenten-Workflow

Vor Dateianpassungen:

1. Package-Script `agent:bootstrap -- --json` ausführen.
2. Package-Script `agent:discover -- --json` ausführen.
3. Package-Script `agent:context` mit der App-Spezifikation ausführen.
4. `context.nextCommands` als geordnete Ausführungshilfe lesen.
5. Ausgewählte Skills, Policies und Capability-Dokumente lesen.
6. Package-Script `app:new` verwenden, wenn ein Modul aus einer Spezifikation
   erzeugt wird.

Danach — kanonischer Weg für ein klickbares Fachverfahren (IST):

1. Die Austausch-Naht `apps/antragsservice/src/leistung.config.ts` nach dem
   Vertrag aus `AGENTS.md` füllen.
2. `pnpm --filter @senticor/antragsservice emit:contract` ausführen und den
   Snapshot mit committen.
3. `pnpm run typecheck`, `pnpm run test`, `pnpm run dev`.
4. Package-Script `agent:verify -- --task <app-spec> --json` für einen
   Report-Entwurf ausführen oder einen vorhandenen Report mit `--report <path>`
   validieren. Abschluss-Evidenz braucht echte `commandsExecuted`.

Alternativ — Generator-Pfad für Modul-Gerüste (PLAN für die App-Einbindung,
siehe `modules/README.md`): `module.contract.yaml`, Screen Contracts,
`ui/*.stories.tsx`, `forms/*.form.schema.json`, Permissions, Events,
Migrationen, Tests und Compliance-Profil über `app:new` erzeugen und mit
`check:domain-contracts`/`check:module-contracts` validieren.

Für vollständige neue Repositories zuerst den Full-Repo-Scaffold nutzen:

```bash
pnpm run scaffold:domain-app -- --domain <domain> --display-name <name> --target <target-dir> --allow-existing-empty
```

Der Scaffold erzeugt `.template/`-Provenienz und kopiert die TypeScript-CLI für
spätere Updates.
Ohne `--allow-dirty` verweigert der Scaffold eine nicht saubere Template-Quelle.
`--force` bleibt für bewusstes Ersetzen reserviert.

Wichtig für Server-Slices (PLAN): Es existiert noch kein Server. Die
Backend-Zielarchitektur (enger `tsconfig.server.json`-Schnitt, keine direkten
`modules/`-Imports in den Server, DTOs über `shared/` oder Paketverträge)
steht in `docs/reference/backend-fastify.md`.

Wichtig für CI-Slices: opencode.de-Runner sind unprivilegierte Kubernetes-Pods.
Es gibt keinen Docker-Socket und kein Docker-in-Docker. Image-Builds nutzen
Kaniko; Details stehen in `docs/reference/ci-image-builds.md`.

Bei pnpm-Filterbefehlen steht `--filter` vor `run`, zum Beispiel:

```bash
pnpm --filter "./packages/**" run --if-present build
```

Template-Lifecycle:

```bash
pnpm run template:status
pnpm run template:doctor
pnpm run template:diff -- --to <version>
pnpm run template:upgrade -- --from <version> --to <version> --dry-run
```

Validierungsprofile:

```bash
pnpm run check:agent-smoke
pnpm run check:agent-domain
pnpm run check:agent-ui
pnpm run check:agent-release
```

## Standalone Export

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

Der Export kopiert die dünne App-Vorlage, löst `catalog:`-Versionen aus
`pnpm-workspace.yaml` auf und ersetzt `workspace:*` durch die lokalen
Paketversionen. Das Ergebnis enthält einen
`standalone-export-report.json`-Nachweis.

Dieser Exportpfad ist für SDK- und Paketnutzer gedacht. Die aufgelösten
`@senticor/*`-Pakete müssen für echte externe Nutzung veröffentlicht oder in
der Zielumgebung verfügbar sein.
