---
name: dossier-fallmanagement
description: Baue oder nutze ein Dossier-/Fall-/Akte-/Case-Management-Fachverfahren aus diesem Template — langlebige Subjekte mit Zielen, Schritten, Terminen und Vermerken statt Einmal-Antrag. Deckt die server-autoritative Datenschicht (CaseStore/TaskStore gegen app_cases/app_tasks), die Fall-BFF-API (/api/cases, /api/cases/:id/transitions, /api/cases/:id/tasks, /api/cases/:id/progress), Verfahren-als-Daten (ProcedureRegistry/transitionCase) und die generische Kit-Sicht DossierAkte360 ab. Trigger: Fall, Dossier, Akte, Case-Management, Fallverwaltung, Ziele/Schritte/Termine, langlebiges Subjekt, GET/POST /api/cases.
---

# Dossier-Fallmanagement

Die Front Door für „wie baue/nutze ich ein Dossier-/Fall-Management-Fachverfahren
aus diesem Template". Root-Policy und Pfad-Karte: `AGENTS.md`. Die Naht ist
bereits gebaut und committet (ADR-0001/0002/0003); dieses Skill beschreibt NUR,
was wirklich existiert, und markiert offene Punkte ehrlich als geplant.

## Wann dieses Skill (Dossier) — und wann NICHT (Antrag/Vorgang)

Nimm **Dossier/Fall**, wenn das Fachkonzept ein LANGLEBIGES Subjekt in den
Mittelpunkt stellt: eine Klient:innen-/Fall-/Objekt-Akte, die über viele
Bearbeitungsschritte fortlebt und **Ziele, geordnete Schritte/Checklisten,
Termine/Fristen und Vermerke** akkumuliert (interne Sachbearbeitung,
Case-Management, Betreuung/Beratung). Träger: `app_cases` + `app_tasks`,
API unter `/api/cases`.

Nimm den **Antrag-/Vorgang-Pfad** (Skill `fachverfahren-app`, Naht
`leistung.config`) für Einmal-Anträge (Antrag → StatusMachine → Bescheid),
Bürger-Journey, Register/Suche, Antragsformulare. Beide Modi teilen das SDK
(`ProcedureVersion`/`transitionCase`), Audit und RBAC — der Unterschied ist das
Datenmodell und die API-Fläche.

## Die Datenschicht — `CaseStore` + `TaskStore`

Zwei server-autoritative Stores, jeder als **Trias** Postgres (PROD-Standalone) /
InMemory (Tests/DEV) / Unavailable (fail-closed ohne DB), plus
`createXFromEnv`-Fabrik. Beide sind Mandanten-scoped
(`tenantId`/`authorityId`/`jurisdictionId`) und append-only im Audit.

### `CaseStore` — die Akte (`packages/app-store-postgres/src/case-store.ts`)

`AppCase` = Persistenzform der SDK-`Case`:
`caseId, tenantId, authorityId, jurisdictionId, procedureId, procedureVersion,
state, version, subjectIds[], openedAt, closedAt`. Der Store ist SDK-entkoppelt:
er persistiert Zeilen + erzwingt Optimistic-Locking; der reine `transitionCase`-
Reducer (Guards, Vier-Augen) lebt in der BFF-Schicht.

- Methoden: `insertCase`, `getCase`, `listCases(query)` (Filter
  `state`/`procedureId`/`limit`), `patchCaseState` (**ATOMAR**: Zustandswechsel +
  append-only Audit in EINER Transaktion, Optimistic-Locking), `appendAuditEvent`,
  `listAuditEvents` (aufsteigend nach `occurredAt`), optional `ping`.
- Fehler: `CaseNotFoundError`, `CaseVersionConflictError` (→ BFF 404 / 409).
- `AppAuditEvent` (gegen `app_audit_events`) ist fachlich + append-only;
  `legalBasisId` und `purpose` sind **Pflicht** — eine Rechtsgrundlage wird NIE
  erfunden (sie kommt aus der `ProcedureVersion`).
- `createCaseStoreFromEnv(env)`: `APP_PG_URL`/`APP_PG_DIRECT_URL` → Postgres,
  sonst `UnavailableCaseStore` (fail-closed, kein stiller In-Memory-Fallback).

> Hinweis (ehrlich): `AppCase` trägt **keine** frei-formige `data`-Nutzlast und
> **kein** `caseKind`. Die Akte hält nur ihre Stammfelder + `subjectIds`; alle
> fachlichen Sub-Elemente (Ziele/Schritte/Termine) leben als Aufgaben im
> `TaskStore`, freie Nutzlast in deren `data`.

### `TaskStore` — Ziele/Schritte/Termine (`.../task-store.ts`, `migrations/20260714140000_app_tasks`)

`AppTask` erweitert die SDK-`Task` um die Dossier-Träger:
`taskId, caseId, …, title, state (open|claimed|completed|cancelled), assignedTo,
dueAt, taskKind, parentTaskId, data, sortRank, version, createdAt, updatedAt`.
EINE polymorphe Tabelle `app_tasks` bildet die Hierarchie ab:

| Fachliches Element | `taskKind`          | Verknüpfung              |
| ------------------ | ------------------- | ------------------------ |
| Ziel               | `ziel`              | `caseId` → Akte          |
| Schritt/Checkliste | `checkliste-item`   | `parentTaskId` → Ziel    |
| Termin/Frist       | `termin`            | `caseId` → Akte, `dueAt` |
| generische Aufgabe | `aufgabe` (Default) | `caseId` → Akte          |

`taskKind` ist ein freier String — die Tabelle ist wertneutral; obige Werte sind
die vom BFF/Progress genutzte Konvention.

- Methoden: `insertTask`, `getTask`, `listTasks(query)` (Filter
  `caseId`/`taskKind`/`parentTaskId`/`assignedTo`/`limit`), `patchTask(patch)`,
  `aggregateChildFlag(...)`, optional `ping`.
- `patchTask`: nur gesetzte Felder ändern sich; `dataPatch` ist ein **flacher
  jsonb-`||`-Merge** in `data` (NICHT ersetzen); optionales `expectedVersion`
  erzwingt Optimistic-Locking (`TaskVersionConflictError` → 409).
- `aggregateChildFlag({parentTaskIds, taskKind, flagKey})`: **compute-on-read**
  Fortschritt — je Eltern-Aufgabe die Zahl der Kinder eines `taskKind` und wie
  viele davon `data->>flagKey === 'true'` haben. LIMIT-frei, **nie persistiert**.
- `createTaskStoreFromEnv(env)`: analog zu `CaseStore` (fail-closed ohne DB).

## Die Fall-BFF-API (`packages/app-bff-fastify/src/routes/cases.ts` + `tasks.ts`)

REST über die Naht. Kontext (`tenantId`/`authorityId`/`jurisdictionId`/`actorId`)
kommt **AUSSCHLIESSLICH aus der Session** (`sessionOf`), nie vom Client. Jede
Task-Route prüft zuerst über die Akte den Behörden-Scope (Fremd-Behörde → 404,
keine Existenz-Leaks). Store-Ausfall → 503 (`storeUnavailable`).

| Methode + Pfad                       | Recht                   | Kurz                                                                                                                                                                                                                                                             |
| ------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/cases`                     | `case.read`             | Fälle der Behörde listen (Filter `state`/`procedureId`/`limit`).                                                                                                                                                                                                 |
| `GET /api/cases/:id`                 | `case.read`             | Einen Fall lesen.                                                                                                                                                                                                                                                |
| `POST /api/cases`                    | `case.decision.prepare` | Akte anlegen. Server erzeugt `caseId`/`version=1`/`openedAt`; `state` muss in `procedure.allowedStates` sein; `legalBasisId` aus der `ProcedureVersion`; Audit `case.opened`.                                                                                    |
| `POST /api/cases/:id/transitions`    | `case.decision.prepare` | Zustandswechsel. Übergang aus `procedure.allowedTransitions` (Match `from`=aktueller Zustand & `action` aus dem Body — **Ziel NIE aus dem Body**), Vier-Augen serverseitig, `transitionCase`-Reducer, atomar `patchCaseState`+Audit; `409` bei Versionskonflikt. |
| `GET /api/cases/:id/tasks`           | `case.read`             | Aufgaben/Ziele/Schritte/Termine der Akte (Filter `taskKind`/`parentTaskId`/`limit`).                                                                                                                                                                             |
| `POST /api/cases/:id/tasks`          | `case.decision.prepare` | Aufgabe/Ziel/Schritt/Termin anlegen (`taskKind` default `aufgabe`, `parentTaskId`, `data`).                                                                                                                                                                      |
| `PATCH /api/tasks/:id`               | `case.decision.prepare` | Metadaten + `dataPatch`-Merge, Optimistic-Locking (`409`).                                                                                                                                                                                                       |
| `GET /api/cases/:id/progress`        | `case.read`             | Fortschritt je `ziel` — compute-on-read aus den `checkliste-item`-Kindern mit `data.erledigt`.                                                                                                                                                                   |
| `GET /api/cases/:id/audit`           | `case.read`             | Verlauf/Audit der Akte (append-only, chronologisch). Server-Topologie verborgen; treibt die Verlauf-Sektion.                                                                                                                                                     |
| `GET /api/cases/:id/allowed-actions` | `case.read`             | Die im AKTUELLEN Zustand erlaubten Übergänge (aus dem Verfahren gefiltert: `from`=state). Der Client bekommt nur die `action`-Kennung + `version` (Ziel/Rechtsgrundlage/Vier-Augen server-autoritativ) → treibt die Aktionsleiste/Vier-Augen-Sicht.              |

**Vier-Augen** bei `POST …/transitions`: trägt der Übergang `requiresFourEyes`,
darf der Akteur des jüngsten Audit-Eintrags ihn nicht selbst auslösen (→ 403).
Details/Governance: siehe [[governance-vier-augen]].

## Verfahren als DATEN — `ProcedureRegistry` / `transitionCase`

Der Prozess ist DATEN, kein Code (`packages/public-sector-sdk/src/domain-kernel.ts`).
Eine `ProcedureVersion` trägt `allowedStates`, `allowedTransitions`
(`{from, to, action, requiredPermission, requiresFourEyes?, closesCase?}`) und
`legalBasisIds`. Die `ProcedureRegistry.get(procedureId, version)` löst eine Akte
zu ihrer Version auf; `transitionCase(case, version, action, expectedVersion)` ist
der reine Reducer (Versionskonflikt, Verfahren-Mismatch, ungültiger Übergang; setzt
`to` + `version+1`; stempelt `closedAt` bei `closesCase`-Übergängen — data-driven,
kein hart kodierter Zielzustand — und entfernt es bei Wiederaufnahme).

- **`apps/fachverfahren/server/procedure.config.ts` ist DIE EINE Dossier-Naht** —
  das server-seitige Gegenstück zu `src/leistung.config.ts` (Antrag). Sie exportiert
  `dossierProcedure: ProcedureVersion` (+ ein optionales neutrales `dossierDemo` fürs
  Preview-Seed); `startRuntime` registriert genau dieses Verfahren. **Der generierende
  Build (chos-code/gtc-builder) ÜBERSCHREIBT GENAU DIESE DATEI** — dieselbe App,
  anderes Verfahren, ohne weitere Änderung. Der Template-Default ist ein neutrales
  „Musterverfahren" (kein echtes Fachverfahren).
- **Rechtsgrundlage NIE erfinden**: `legalBasisIds` stammen aus der
  Verfahrenskonfiguration, nie aus der BPMN, nie geraten.
- `buildPublicServer` (den die Unit-Tests nutzen) hat die Registry per Default
  **leer** (`createInMemoryProcedureRegistry([])`, fail-closed). Nur der Runtime-
  Entrypoint `startRuntime` füllt sie aus `procedure.config.ts`.
- Aus BPMN ableitbar über den Stub `bpmnToProcedureVersion` — Querverweis
  [[bpmn-prozess-workflow]]. Das ist ein **Authoring-/Build-Schritt** (die `.bpmn`
  wird NICHT in `dist-server` ausgeliefert): daraus die `ProcedureVersion` erzeugen
  und als `dossierProcedure` in `procedure.config.ts` schreiben.

## UI — die Kit-Komponente `DossierAkte360`

`packages/fachverfahren-kit/src/components/DossierAkte360.tsx`: die generische
360°-Fallakte, das Dossier-Gegenstück zu `VorgangDetail`. **Streng
präsentierend & domänen-neutral**: kein `fetch`, kein Store, keine Fach-Literale
— alles über Props; deutsche Default-Labels via `labels` vollständig
überschreibbar; barrierefrei (BITV 2.2 AA). Rendert als Tabs: **Stammdaten**
(`DescriptionList`), **Ziele** (Ziel-Karten mit Schritten + Fortschritt %),
**Termine/Fristen**, **Notizen/Vermerke**, **Verlauf** (`Timeline`).
Fortschritt: `fortschrittProzent` falls gesetzt, sonst aus erledigten Schritten.

**Die Referenz-Anbindung EXISTIERT** (nutze sie als lebende Vorlage, nicht neu erfinden):

- **App-Routen**: `/amt/akten` (Aktenliste) + `/amt/akte/:id` (360°-Sicht) sind
  verdrahtet (`apps/fachverfahren/src/pages/amt-akten.tsx` + `amt-akte.tsx`), plus
  ein Nav-Reiter „Akten". `amt-akte.tsx` lädt Fall+Tasks+Fortschritt+Verlauf+erlaubte
  Aktionen, hakt Schritte interaktiv ab (`onSchrittToggle` → `PATCH /api/tasks/:id` →
  Fortschritt live) und rendert `DossierAkte360`.
- **Client-Naht**: `apps/fachverfahren/src/app/case-port.ts` + `case-client.ts` (die
  Netz-Naht, analog `board-client`; lesend + schreibend inkl. `listAudit`/
  `listAllowedActions`/`transitionCase`), `case-akte-view.ts` (**reine** Abbildung
  API-Zeilen → `DossierAkte360`-Props: `toAkteProps` + `toVerlauf`),
  `pages/case-aktionen.tsx` (Aktionsleiste: erlaubte Übergänge als Buttons, Vier-Augen
  lesbar gemeldet).
- **Preview-Seed**: `apps/fachverfahren/server/dev/reference-seed.ts` ist der
  **runnable Blueprint** — der generische Motor, der Verfahren + Demo-Dossier aus
  `procedure.config.ts` in die Stores seedet (nur `APP_STORE_MODE=memory`, nie PROD).

> **Ehrlich offen**: Es gibt (noch) **keine** eigene `case-management`-Capability in
> `platform/capabilities.json` — die Naht liegt heute unter
> `workflow`/`records-management`/`audit` (ADR-0004, Rule of Three). Ein „Neue
> Akte anlegen"-Formular in der App fehlt noch (`createCase` existiert im Client).

## Stub vs. chos (eine Naht)

`docs/architecture/fall-dossier-workflow-ohne-chos.md`: Der Template-Stub trägt
den vollständigen **Standalone-/OSS-Betrieb ohne chos** (Postgres-Variante ist
server-autoritativ, revisionssicher, mandanten-scoped, Optimistic-Locking). In
Produktion sitzt chos hinter **derselben** Naht (`CaseStore`/`TaskStore`/
`ProcedureRegistry` als Dependency-Injection über `BffDeps`) — der Adapter lebt
im Deployment, NICHT im OSS-Template. Bewusste Stub-Grenzen: keine laufende
BPMN-Engine (Timer/Fristen-Orchestrierung, Boundary-Events, Subprozesse,
Gateway-Semantik XOR/AND) — das füllt der Provider hinter der Naht.

## Rezept — neues Dossier-Fachverfahren anlegen

1. **Verfahren als Daten in die Naht schreiben**: `dossierProcedure`
   (`ProcedureVersion` mit `allowedStates`, `allowedTransitions`, `legalBasisIds`,
   `closesCase?` am Abschluss) in **`apps/fachverfahren/server/procedure.config.ts`**
   — DIE EINE Dossier-Naht, die der generierende Build überschreibt (Analogon zu
   `leistung.config.ts`). Ableitbar aus BPMN via `bpmnToProcedureVersion`
   ([[bpmn-prozess-workflow]]) als Authoring-Schritt. Vollständiges reales Beispiel:
   `docs/examples/integrationsberatung/integrationsmanagement.{bpmn,config.yaml}`.
   Im governten `app.spec.yaml` kannst du das Verfahren zusätzlich als OPTIONALEN
   `procedure`-Block deklarieren (dieselbe Zustandsmaschine als DATEN); `app:new`
   **validiert** ihn (mind. 1 Rechtsgrundlage, Übergänge referenzieren deklarierte
   Zustände, eindeutige `(from,action)`, mind. 1 schließender Übergang, keine
   Sackgasse/Waise). Der Emit `spec.procedure` → `procedure.config.ts` ist noch nicht
   verdrahtet — die Naht bleibt vorerst die Wahrheit, die du direkt schreibst.
   1b. **Vertrag emittieren + committen** (PFLICHT, sonst ist das Gate rot):

   ```bash
   pnpm --filter @senticor/fachverfahren emit:procedure-contract   # → procedure.contract.json
   pnpm run check:procedure-contract                                # Frische + Struktur
   ```

   Das Gate prüft generisch (ohne Domänen-Literale): mind. eine Rechtsgrundlage
   (Geerdet-Prinzip), alle Übergänge referenzieren deklarierte Zustände, eindeutige
   `(from, action)`-Paare (`transitionCase` löst per `find()` auf — Duplikate wären
   mehrdeutig), mind. ein schließender Übergang (`closesCase`), keine Sackgasse
   (nur geschlossene Zustände dürfen ohne Ausgang sein), kein verwaister Zustand,
   und `dossierDemo.initialState` ∈ `allowedStates`. Läuft in `precommit:check` +
   `check:agent-domain`.

2. **Registry ist bereits verdrahtet**: `startRuntime` registriert `dossierProcedure`
   aus der Naht (`createInMemoryProcedureRegistry([dossierProcedure])`). Nichts weiter
   zu tun — die Naht IST der Eingriffspunkt. (Referenz-Motor + Preview-Seed:
   `apps/fachverfahren/server/dev/reference-seed.ts`.)
3. **Persistenz bereitstellen**: `APP_PG_URL` setzen und
   `pnpm --filter @senticor/app-store-postgres db:migrate` (legt `app_cases`,
   `app_tasks`, `app_audit_events` an); `createCaseStoreFromEnv`/
   `createTaskStoreFromEnv` liefern dann Postgres statt Unavailable.
4. **Akte anlegen**: `POST /api/cases` mit `procedureId`/`procedureVersion`/
   `state` (∈ `allowedStates`) — server-seitig `caseId`/`version=1`/Audit
   `case.opened`.
5. **Ziele/Schritte/Termine anlegen**: `POST /api/cases/:id/tasks` —
   `taskKind: "ziel"`, dann `checkliste-item` mit `parentTaskId` auf das Ziel und
   `data.erledigt`; `termin` mit `dueAt`.
6. **Fortschritt lesen**: `GET /api/cases/:id/progress` (compute-on-read je Ziel).
7. **Zustandswechsel steuern**: `POST /api/cases/:id/transitions` mit `action` +
   `expectedVersion`; `requiresFourEyes`-Übergänge erfordern zwei Personen
   ([[governance-vier-augen]]).
8. **UI ist bereits angebunden**: `/amt/akten` + `/amt/akte/:id` binden
   `DossierAkte360` an die Fall-API (Schritte abhakbar, Aktionsleiste, Verlauf) —
   nutze `pages/amt-akte.tsx` + `case-akte-view.ts` + `case-aktionen.tsx` als
   Vorlage. Für ein anderes Verfahren bleiben diese generisch; nur `procedure.config.ts`
   (Schritt 1) ändert sich.

## Minimalbeispiel (server-autoritativ, generisch)

```ts
// ProcedureRegistry aus einer ProcedureVersion (hier aus BPMN abgeleitet):
import { bpmnToProcedureVersion } from "@senticor/workflow-bpmn-stub";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";

const version = bpmnToProcedureVersion(bpmnXml, {
  procedureId: "<procedure-id>",
  version: "<version>",
  legalBasisIds: ["<belegte-norm>"], // aus der Konfiguration — NIE geraten
});
const procedureRegistry = createInMemoryProcedureRegistry([version]);

// Stores (fail-closed ohne APP_PG_URL):
import {
  createCaseStoreFromEnv,
  createTaskStoreFromEnv,
} from "@senticor/app-store-postgres";
const caseStore = createCaseStoreFromEnv(process.env);
const taskStore = createTaskStoreFromEnv(process.env);

// Ein Ziel als Aufgabe AN der Akte (Kontext in PROD aus der Session, nicht vom Client):
await taskStore.insertTask({
  taskId,
  caseId,
  tenantId,
  authorityId,
  jurisdictionId,
  title: "<Ziel-Titel>",
  state: "open",
  assignedTo: null,
  dueAt: null,
  taskKind: "ziel",
  parentTaskId: null,
  data: {/* frei-formige Nutzlast */},
  sortRank: "",
  version: 1,
  createdAt: now,
  updatedAt: now,
});

// Compute-on-read Fortschritt je Ziel (NIE persistieren):
const ziele = await taskStore.listTasks({ tenantId, caseId, taskKind: "ziel" });
const fortschritt = await taskStore.aggregateChildFlag({
  tenantId,
  parentTaskIds: ziele.map((z) => z.taskId),
  taskKind: "checkliste-item",
  flagKey: "erledigt",
});
```
