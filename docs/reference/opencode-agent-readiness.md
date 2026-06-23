# OpenCode Agent Readiness

Dieses Repository ist als Startpunkt für Coding Agents gedacht. Die folgenden
Artefakte beantworten die nächsten Anforderungen des OpenCode-Teams.

## Abdeckung

| Anforderung                 | Status    | Artefakt                                    |
| --------------------------- | --------- | ------------------------------------------- |
| Vendor-neutraler Skill      | vorhanden | `.agents/skills/fachverfahren-app/SKILL.md` |
| Discovery-Manifest          | vorhanden | `agent.discovery.json`                      |
| App-Spezifikation           | vorhanden | `docs/examples/*/app.spec.yaml`             |
| Domain-Modul-Skeleton       | vorhanden | `modules/_template/`                        |
| Standalone Export           | vorhanden | `scripts/scaffold-standalone-app.mjs`       |
| Full-Repo-Scaffold          | vorhanden | `pnpm run scaffold:domain-app`              |
| Manifest- und Screen-Checks | vorhanden | `pnpm run check:domain-contracts`           |
| Neutrales Beispielverfahren | vorhanden | `modules/neutral-example/`                  |

## Agenten-Workflow

Vor Dateianpassungen:

1. Package-Script `agent:discover` ausführen.
2. Package-Script `agent:context` mit der App-Spezifikation ausführen.
3. Ausgewählte Skills, Policies und Capability-Dokumente lesen.
4. Package-Script `app:new` verwenden, wenn ein Modul aus einer Spezifikation
   erzeugt wird.

Danach:

1. `module.contract.yaml` prüfen oder erzeugen.
2. Screen Contracts unter `contracts/*.screen.yaml` schreiben.
3. UI-Stories unter `ui/*.stories.tsx` anlegen und Formular-Constraints aus
   `forms/*.form.schema.json` clientseitig sichtbar machen.
4. Permissions, Events, Form-Schema, Migrationen, Tests und Compliance-Profil
   ergänzen.
5. Checks aus `agent:context` und `module.contract.yaml` ausführen.

Für vollständige neue Repositories zuerst den Full-Repo-Scaffold nutzen:

```bash
pnpm run scaffold:domain-app -- --domain <domain> --target <target-dir>
```

Der Scaffold erzeugt `.template/`-Provenienz und kopiert die TypeScript-CLI für
spätere Updates.

Wichtig für Server-Slices: `apps/fachverfahren-template/tsconfig.server.json`
nimmt nur `server/` und `shared/` in den BFF-Build auf. Agenten sollen
fachliche Serverlogik nicht direkt aus `modules/` in den Template-Server
importieren, sondern gemeinsame DTOs über `shared/` oder Paketverträge führen
und die Domain-Anbindung explizit registrieren.

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
