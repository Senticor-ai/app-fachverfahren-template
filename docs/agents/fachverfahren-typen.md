# Fachverfahren-Typen & Skills für KI-Agenten

> **Für Agenten: Quellen & Pflicht-Lektüre.**
> Status: IST | PLAN — `IST` beschreibt das reale Scaffold, `PLAN` eine
> Zielarchitektur, die noch nicht existiert.
> Quellen: `packages/app-store-postgres/src/case-store.ts`,
> `.../task-store.ts`, `packages/app-bff-fastify/src/routes/cases.ts` +
> `tasks.ts`, `packages/public-sector-sdk/src/domain-kernel.ts`,
> `packages/workflow-bpmn-stub`,
> `packages/fachverfahren-kit/src/components/DossierAkte360.tsx`,
> `docs/architecture/fall-dossier-workflow-ohne-chos.md`,
> `docs/adr/0001`–`0003`.
> Pflicht-Lektüre vorher: `AGENTS.md`, danach das unten gewählte Skill.

Kürzester Wegweiser: Welcher Verfahrenstyp, welches Skill, welche Anker. Zuerst
den Typ wählen, dann NUR das passende Skill lesen — nicht beide.

## Zwei Verfahrenstypen — wähle EINEN

| Frage  | Antrag / Vorgang                                               | Fall / Dossier / Case-Management                                      |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| Kern   | Einmal-Antrag → StatusMachine → Bescheid                       | langlebiges Subjekt (Akte) mit Zielen, Schritten, Terminen, Vermerken |
| Naht   | `apps/fachverfahren/src/leistung.config.ts` (`LeistungConfig`) | server-autoritative Stores + BFF-API                                  |
| Träger | eine Config, aus der 3 Personas rendern                        | `app_cases` + `app_tasks`, API unter `/api/cases`                     |
| Skill  | `.agents/skills/fachverfahren-app/SKILL.md`                    | `.agents/skills/dossier-fallmanagement/SKILL.md`                      |

Beide Modi teilen SDK (`ProcedureVersion`/`transitionCase`), Audit und RBAC —
der Unterschied ist Datenmodell und API-Fläche.

## Antrag/Vorgang → Skill `fachverfahren-app`

Fülle GENAU die eine Naht `apps/fachverfahren/src/leistung.config.ts` und
erzeuge den Vertrags-Snapshot neu:

```bash
pnpm --filter @senticor/fachverfahren emit:contract
```

Vertrag und Vorgehen: `.agents/skills/fachverfahren-app/SKILL.md` (Front Door),
Naht-Typ `packages/fachverfahren-kit/src/types.ts`.

## Fall/Dossier/Case-Management → Skill `dossier-fallmanagement`

Front Door: `.agents/skills/dossier-fallmanagement/SKILL.md`. Zwei
Nebenpfade, wenn dein Verfahren sie braucht:

- Prozess aus BPMN ableiten → `.agents/skills/bpmn-prozess-workflow/SKILL.md`
- Vier-Augen / Governance auf Zustandswechseln →
  `.agents/skills/governance-vier-augen/SKILL.md`
- KI-Assistenz (assistiv, transparent, fail-closed) anbinden →
  `.agents/skills/ki-assistenz/SKILL.md`
- Eigenes Domänen-Backend (Store + BFF + Capability) auf dem akzeptierten Weg →
  `.agents/skills/domaenen-backend-modul/SKILL.md`

### Paket-Anker (IST, committet)

| Baustein                                                                   | Ort                                                                                                             |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Datenschicht `CaseStore`/`TaskStore` (Trias Postgres/InMemory/Unavailable) | `packages/app-store-postgres/src/case-store.ts`, `.../task-store.ts`, `.../migrations/20260714140000_app_tasks` |
| Fall-BFF-API                                                               | `packages/app-bff-fastify/src/routes/cases.ts` + `tasks.ts`                                                     |
| Verfahren als Daten (`ProcedureRegistry`/`transitionCase`)                 | `packages/public-sector-sdk/src/domain-kernel.ts`                                                               |
| BPMN → `ProcedureVersion` (Stub)                                           | `packages/workflow-bpmn-stub`                                                                                   |
| Generische Fallakte (nur präsentierend)                                    | `packages/fachverfahren-kit/src/components/DossierAkte360.tsx`                                                  |
| Beispiel (synthetisch)                                                     | `docs/examples/integrationsberatung/` (BPMN + `config.yaml`)                                                    |

Die BFF-Routen im Überblick: `GET/POST /api/cases`, `GET /api/cases/:id`,
`POST /api/cases/:id/transitions`, `GET/POST /api/cases/:id/tasks`,
`PATCH /api/tasks/:id`, `GET /api/cases/:id/progress`. Kontext
(`tenantId`/`authorityId`/`jurisdictionId`/`actorId`) kommt ausschließlich aus
der Session, nie vom Client.

### Noch offen / geplant (nicht behaupten)

- Eine App-Route, die `DossierAkte360` an die Fall-API bindet (z. B.
  `/amt/akte/:id`), ist noch nicht verdrahtet (PLAN, ADR-0001).
- Es gibt noch KEINE eigene `case-management`-Capability in
  `platform/capabilities.json` — die Naht liegt heute unter
  `workflow`/`records-management`/`audit` (PLAN, ADR-0001).

## Standalone (OSS) vs. chos — dieselbe Naht

`docs/architecture/fall-dossier-workflow-ohne-chos.md`: Der Template-Stub trägt
den vollständigen Standalone-Betrieb ohne chos (Postgres-Variante:
server-autoritativ, revisionssicher, mandanten-scoped, Optimistic-Locking). In
Produktion sitzt chos hinter DERSELBEN Naht
(`CaseStore`/`TaskStore`/`ProcedureRegistry` via Dependency-Injection über
`BffDeps`) — der Adapter lebt im Deployment, nicht im OSS-Template. Bewusste
Stub-Grenzen (keine laufende BPMN-Engine: Timer/Fristen, Boundary-Events,
Subprozesse, Gateway-Semantik) füllt der Provider hinter der Naht.
