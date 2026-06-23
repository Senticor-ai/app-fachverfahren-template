# OpenCode Agent Readiness

Dieses Repository ist als Startpunkt fuer Coding Agents gedacht. Die folgenden
Artefakte beantworten die naechsten Anforderungen des OpenCode-Teams.

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
2. `domain.module.yaml` ausfuellen.
3. Screen Contracts unter `contracts/*.screen.yaml` schreiben.
4. UI-Stories unter `ui/*.stories.tsx` anlegen.
5. Permissions, Events, Form-Schema, Migrationen, Tests und Compliance-Profil
   ergaenzen.
6. `pnpm run check:domain-contracts` ausfuehren.
7. `pnpm run check:typescript-policy`, `pnpm run check:storybook`,
   `pnpm run typecheck` und `pnpm run test` ausfuehren.

## Standalone Export

```bash
pnpm run scaffold:standalone -- /tmp/fachverfahren-app
```

Der Export kopiert die duenne App-Vorlage, loest `catalog:`-Versionen aus
`pnpm-workspace.yaml` auf und ersetzt `workspace:*` durch die lokalen
Paketversionen. Das Ergebnis enthaelt einen
`standalone-export-report.json`-Nachweis.

Dieser Exportpfad ist fuer SDK- und Paketnutzer gedacht. Die aufgeloesten
`@senticor/*`-Pakete muessen fuer echte externe Nutzung veroeffentlicht oder in
der Zielumgebung verfuegbar sein.
