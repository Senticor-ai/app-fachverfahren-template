# OpenCode Agent Readiness

Dieses Repository ist als Startpunkt für Coding Agents gedacht. Die folgenden
Artefakte beantworten die nächsten Anforderungen des OpenCode-Teams.

## Abdeckung

| Anforderung                 | Status    | Artefakt                                    |
| --------------------------- | --------- | ------------------------------------------- |
| Template-lokaler Skill      | vorhanden | `.claude/skills/fachverfahren-app/SKILL.md` |
| Domain-Modul-Skeleton       | vorhanden | `modules/_template/`                        |
| Standalone Export           | vorhanden | `scripts/scaffold-standalone-app.mjs`       |
| Manifest- und Screen-Checks | vorhanden | `pnpm run check:domain-contracts`           |
| Neutrales Beispielverfahren | vorhanden | `modules/neutral-example/`                  |

## Agenten-Workflow

1. `modules/_template/` in ein neues `modules/<domain>/` kopieren.
2. `domain.module.yaml` ausfüllen.
3. Screen Contracts unter `contracts/*.screen.yaml` schreiben.
4. UI-Stories unter `ui/*.stories.tsx` anlegen und Formular-Constraints aus
   `forms/*.form.schema.json` clientseitig sichtbar machen.
5. Permissions, Events, Form-Schema, Migrationen, Tests und Compliance-Profil
   ergänzen.
6. `pnpm run check:domain-contracts` ausführen.
7. `pnpm run check:typescript-policy`, `pnpm run check:storybook`,
   `pnpm run typecheck` und `pnpm run test` ausführen.

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
