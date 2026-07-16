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

| Frage  | Antrag / Vorgang                                               | Fall / Dossier / Case-Management                                                  |
| ------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Kern   | Einmal-Antrag → StatusMachine → Bescheid                       | langlebiges Subjekt (Akte) mit Zielen, Schritten, Terminen, Vermerken             |
| Naht   | `apps/fachverfahren/src/leistung.config.ts` (`LeistungConfig`) | `apps/fachverfahren/server/procedure.config.ts` (`dossierProcedure`) + Stores/BFF |
| Träger | eine Config, aus der 3 Personas rendern                        | `app_cases` + `app_tasks`, API unter `/api/cases`                                 |
| Skill  | `.agents/skills/fachverfahren-app/SKILL.md`                    | `.agents/skills/dossier-fallmanagement/SKILL.md`                                  |

Beide Nähte sind **EINE Datei, die der generierende Build überschreibt** — für ein
anderes Verfahren ändert sich nur diese eine Datei, sonst nichts an der App.

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

Fülle GENAU die eine Naht `apps/fachverfahren/server/procedure.config.ts`
(`dossierProcedure`) und erzeuge den Vertrags-Snapshot neu:

```bash
pnpm --filter @senticor/fachverfahren emit:procedure-contract
```

Das schreibt `apps/fachverfahren/procedure.contract.json` (mit-committen). Das Gate
`pnpm run check:procedure-contract` prüft beides: **Frische** (Naht geändert, aber
emit vergessen → rot) und **Struktur** (mind. eine Rechtsgrundlage; alle Übergänge
referenzieren deklarierte Zustände; eindeutige `(from, action)`-Paare; mind. ein
schließender Übergang; keine Sackgasse; kein verwaister Zustand). Es läuft in
`precommit:check` + `check:agent-domain` — exakt symmetrisch zum Antrag-Pfad.

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

| Baustein                                                                   | Ort                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Datenschicht `CaseStore`/`TaskStore` (Trias Postgres/InMemory/Unavailable) | `packages/app-store-postgres/src/case-store.ts`, `.../task-store.ts`, `.../migrations/20260714140000_app_tasks`                      |
| Fall-BFF-API                                                               | `packages/app-bff-fastify/src/routes/cases.ts` + `tasks.ts`                                                                          |
| Verfahren als Daten (`ProcedureRegistry`/`transitionCase`)                 | `packages/public-sector-sdk/src/domain-kernel.ts`                                                                                    |
| **Verfahren-Naht (überschreibbar)**                                        | `apps/fachverfahren/server/procedure.config.ts` (`dossierProcedure` + neutrales Demo)                                                |
| BPMN → `ProcedureVersion` (Stub, Authoring-Schritt)                        | `packages/workflow-bpmn-stub`                                                                                                        |
| Generische Fallakte (nur präsentierend)                                    | `packages/fachverfahren-kit/src/components/DossierAkte360.tsx`                                                                       |
| Referenz-Anbindung App (lebende Vorlage)                                   | `apps/fachverfahren/src/pages/amt-akte.tsx` + `amt-akten.tsx` + `app/case-port.ts` + `pages/case-akte-view.ts` + `case-aktionen.tsx` |
| Beispiel (synthetisch)                                                     | `docs/examples/integrationsberatung/integrationsmanagement.bpmn` + `integrationsmanagement.config.yaml`                              |

Die BFF-Routen im Überblick: `GET/POST /api/cases`, `GET /api/cases/:id`,
`POST /api/cases/:id/transitions`, `GET/POST /api/cases/:id/tasks`,
`PATCH /api/tasks/:id`, `GET /api/cases/:id/progress`,
`GET /api/cases/:id/audit` (Verlauf), `GET /api/cases/:id/allowed-actions`
(erlaubte Übergänge im aktuellen Zustand → Aktionsleiste). Kontext
(`tenantId`/`authorityId`/`jurisdictionId`/`actorId`) kommt ausschließlich aus
der Session, nie vom Client.

### IST — die Referenz-Anbindung existiert

- Die App-Routen `/amt/akten` + `/amt/akte/:id` (+ Nav-Reiter „Akten") binden
  `DossierAkte360` an die Fall-API (Schritte interaktiv abhaken → Fortschritt live,
  Aktionsleiste mit erlaubten Übergängen + Vier-Augen, Verlauf aus dem Audit).
- Für ein anderes Verfahren bleiben diese Bausteine generisch; nur
  `apps/fachverfahren/server/procedure.config.ts` wird überschrieben.

### Noch offen / geplant (nicht behaupten)

- Es gibt noch KEINE eigene `case-management`-Capability in
  `platform/capabilities.json` — die Naht liegt heute unter
  `workflow`/`records-management`/`audit` (ADR-0004, Rule of Three).
- Ein „Neue Akte anlegen"-Formular in der App fehlt (`createCase` existiert im Client).
- **IST**: `app.spec.yaml` trägt jetzt einen OPTIONALEN `procedure`-Block (Fall/Dossier-
  Zustandsmaschine als DATEN); `app:new` validiert ihn (mind. 1 Rechtsgrundlage, Übergänge
  referenzieren deklarierte Zustände, eindeutige `(from,action)`, mind. 1 schließender Übergang,
  keine Sackgasse/Waise). Antrag-nur-Apps lassen ihn weg. **PLAN**: der EMIT
  `spec.procedure` → `apps/fachverfahren/server/procedure.config.ts` ist noch NICHT verdrahtet
  (er überschriebe eine Datei außerhalb `modules/` — bewusst aufgeschoben) — heute schreibt man
  `procedure.config.ts` direkt (die Naht bleibt die Wahrheit).

## Standalone (OSS) vs. chos — dieselbe Naht

`docs/architecture/fall-dossier-workflow-ohne-chos.md`: Der Template-Stub trägt
den vollständigen Standalone-Betrieb ohne chos (Postgres-Variante:
server-autoritativ, revisionssicher, mandanten-scoped, Optimistic-Locking). In
Produktion sitzt chos hinter DERSELBEN Naht
(`CaseStore`/`TaskStore`/`ProcedureRegistry` via Dependency-Injection über
`BffDeps`) — der Adapter lebt im Deployment, nicht im OSS-Template. Bewusste
Stub-Grenzen (keine laufende BPMN-Engine: Timer/Fristen, Boundary-Events,
Subprozesse, Gateway-Semantik) füllt der Provider hinter der Naht.
