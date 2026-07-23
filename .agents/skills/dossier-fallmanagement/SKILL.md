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

Zwei server-autoritative Stores, jeder als austauschbarer **Port** mit
identischer Semantik: Postgres (**OSS-Default-Standalone**) / InMemory (Tests/DEV) /
Unavailable (fail-closed ohne DB) — und für `CaseStore`/`TaskStore`/`WissenStore`
zusätzlich der **chos-Graph-Adapter** (Ziel-PROD-Backing „grundsätzlich chos für alle
Datenspeicherungen", `packages/app-store-postgres/src/chos-case-store.ts` /
`chos-task-store.ts` / `chos-wissen-store.ts`, gewählt via `APP_STORE_MODE=chos` +
`CHOS_API_URL`). Alle hinter EXAKT derselben Schnittstelle — Route/UI ändern sich NICHT.
Beide sind Mandanten-scoped (`tenantId`/`authorityId`/`jurisdictionId`) und append-only im Audit.

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
- `createCaseStoreFromEnv(env)`: `APP_STORE_MODE=memory` → InMemory;
  `APP_STORE_MODE=chos` (+ `CHOS_API_URL`) → `ChosCaseStore` (fail-closed ohne URL);
  sonst `APP_PG_URL`/`APP_PG_DIRECT_URL` → Postgres (Default), sonst
  `UnavailableCaseStore` (fail-closed, kein stiller In-Memory-Fallback).
- **chos-Adapter** (`ChosCaseStore`, `packages/app-store-postgres/src/chos-case-store.ts`):
  Fall-Dokumente als versionierte chos-Entities, Audit als append-only Ereignis-Stream
  (Key = `caseId`); `patchCaseState` läuft ATOMAR als eine chos-`entity-lifecycle`-
  Mutation (Zustand + Audit unteilbar). Er spricht NUR gegen die OSS-eigene Naht
  `ChosClient` (`chos-client.ts`) — kein Hart-Bezug auf die privaten chos-Pakete;
  der `InMemoryChosClient` macht den Adapter OHNE laufendes chos testbar (er durchläuft
  denselben Store-Vertrag wie InMemory/Postgres). Der `HttpChosClient` ist die dünne
  Draht-Kante (Endpunkt-Vertrag bei der Integration gegen ein laufendes chos zu fixieren).

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
| `GET /api/cases/:id/vermerke`        | `case.read`             | Aktenvermerke (append-only, Mensch + KI) chronologisch; effektiver Prüfstatus wird aus den Prüf-Ereignissen abgeleitet.                                                                                                                                          |
| `POST /api/cases/:id/vermerke`       | `case.note.write`       | Menschlichen Aktenvermerk schreiben — unveränderlich im Fall-Audit (`case.note.added`, `quelle=mensch`).                                                                                                                                                         |
| `POST /api/cases/:id/vermerke/ki`    | `case.note.write`       | KI-Aktenvermerk-ENTWURF via `AiAssistPort` (`quelle=ki`, `ki-vorschlag`, `reviewStatus=offen`; high-risk→422, kein Modell→503, NIE fingiert).                                                                                                                     |
| `POST /api/cases/:id/vermerke/:vermerkId/review` | `case.note.write` | KI-Entwurf prüfen: `bestaetigt`/`verworfen` (append-only `case.note.reviewed`; einmalig→409, Mensch-Vermerk→422).                                                                                                                           |
| `GET /api/cases/:id/vermerke/export` | `case.read`             | Kontext-Bundle der Akte für die agentische Weiterverarbeitung (nur public, Text injektions-neutralisiert) — die Brücke, die chos-code in Skills + Kontext übersetzt.                                                                                             |

**Vier-Augen** bei `POST …/transitions`: trägt der Übergang `requiresFourEyes`,
darf der Akteur des jüngsten Audit-Eintrags ihn nicht selbst auslösen (→ 403).
Details/Governance: siehe [[governance-vier-augen]].

## Aktenvermerk — Mensch + KI, append-only (HCAI)

Ein **Aktenvermerk** ist der UNVERÄNDERLICHE, attribuierbare Fall-Vermerk im
append-only Fall-Audit (`app_audit_events`, DB-Trigger) — anders als die
EDITIERBARE Arbeits-Notiz (`taskKind:"notiz"` im `TaskStore`, `PATCH`-bar). Eine
Korrektur ist ein NEUER Vermerk. Verfasst von Mensch ODER KI:

- **Mensch**: `POST …/vermerke` → `case.note.added`, Autor server-autoritativ aus
  der Session.
- **KI**: `POST …/vermerke/ki` ruft den austauschbaren `AiAssistPort`
  ([[ki-assistenz]]) und hält den ENTWURF fest (`quelle=ki`, `modelId`,
  `marking:"ki-vorschlag"`, `reviewStatus:"offen"`) — prüfpflichtig, die
  rechtsnahe Bewertung bleibt beim Menschen (EU-AI-Act/HCAI). Das ist die EINE
  Verbindung AiAssist→Fall im Template.
- **Prüfung (HITL)**: `POST …/vermerke/:vermerkId/review` (`bestaetigt`/`verworfen`)
  ist selbst append-only (`case.note.reviewed`); der effektive `reviewStatus`
  wird beim Lesen daraus ABGELEITET (der Entwurf selbst bleibt unverändert).

RBAC: eigene Permission `case.note.write` (getrennt von `case.decision.prepare` —
vermerken ist nicht entscheiden). UI-Vorlage: `pages/vermerk-aktionen.tsx` (Liste
+ Schreib-/Prüf-Aktionen) unter `/amt/akte/:id`; im Verlauf sind offene
KI-Entwürfe als Ton `warn` markiert (`case-akte-view.ts`).

## Wiki-Mesh — die Akte als Blackboard, die Brücke zu KI-Agenten

Der Aktenvermerk ist zugleich das **Fall-Wiki** und die KOORDINATIONS-Ebene des
Agentic Composable Mesh: der geteilte Arbeitsraum, in dem Mensch UND Agent als
gleichrangige Peers dokumentieren — für beide les- und nutzbar. Über die Grundform
hinaus:

- **Typisierte Zellen** (`kind`): notiz/hypothese/teilergebnis/frage/befund/
  entscheidung/reflexion/**metadatum**/**evidenz** (+ verfahrens-Ebene `wissen`/
  `faehigkeit`). Jede Zelle trägt eine Peer-Kennung `urheber` (`human:<rolle>`
  ODER Modell/Agent), `sichtbarkeit` (public/private), `bezugVermerkId` (Threading)
  und **`metadaten`** — der strukturierte, agenten-konsumierbare Teil (Norm,
  Konfidenz, Tags, Nachweis-IDs). Ein KI-Eintrag trägt die AI-Provenienz
  (Konfidenz/Quellen/Rationale) automatisch als Metadaten.
- **Agentische Teilnahme**: `POST …/vermerke/ki` LIEST vor dem Vorschlag die
  bisherigen public-Zellen (der Blackboard-Stand) als Kontext — der Agent trägt zur
  laufenden Akte bei, statt kontextfrei zu raten.
- **Prompt-Injektions-Guardrail** (`scanInjection`, `@senticor/public-sector-sdk`):
  eine Zelle mit Injektions-Muster wird beim Agenten-Konsum NEUTRALISIERT (nicht
  kaperbar) und für Prüfer als `verdacht` markiert.
- **Kontext-Export** (die Brücke): `GET …/vermerke/export` liefert das
  neutralisierte, strukturierte Bundle, das chos-code in Skills + Kontext übersetzt.

**Zwei Ebenen (Zwei-Ebenen-Symmetrie):** neben dem Fall-Wiki gibt es das
**Verfahrens-Wiki** — generelles Wissen + Fähigkeiten EINES Verfahrens, dieselbe
Zellform, verfahrens-scoped im `WissenStore` (`app-store-postgres`, append-only,
behörden-scoped). Der `WissenStore` ist derselbe austauschbare Port: InMemory /
Postgres (Default) / **chos-Graph** (`ChosWissenStore`, `chos-wissen-store.ts` —
die von Anfang an benannte PROD-Ziel-Backing, Wissens-Einträge als append-only
chos-Ereignisse pro Verfahren, `APP_STORE_MODE=chos`). Routen
`GET|POST /api/verfahren/:procedureId/:version/wissen` (+ `/ki`, `/export`,
`/:eintragId/review`); UI `pages/amt-verfahren-wiki.tsx`, erreichbar aus der Akte.

- **KI-Wissen ist prüfpflichtig** (dieselbe HITL-Naht wie im Fall, weil sein
  Blast-Radius ALLE künftigen Fälle des Verfahrens ist): ein KI-Eintrag startet
  `reviewStatus:"offen"`; `POST …/wissen/:eintragId/review` (`bestaetigt`/`verworfen`)
  ist selbst append-only (`wissen.reviewed`-Marker), der Status wird beim Lesen
  ABGELEITET (einmalig→409, Mensch-Wissen→422, unbekannt→404).
- **Fail-safe Export**: `GET …/wissen/export` schließt `verworfen`-Wissen AUS (kein
  Fortpflanzen verworfenen Wissens in Agent-Skills) und liefert `reviewStatus` mit,
  damit der Konsument `bestaetigt` als autoritativ, `offen` als vorläufig gewichtet.
- **Neutralisierung als eine Wahrheit**: jeder Pfad, der frei-formigen Zell-/Wiki-Text
  an ein Sprachmodell weiterreicht, nutzt `neutralisiereInjektion`/`INJEKTION_PLATZHALTER`
  (`@senticor/public-sector-sdk`) — kein dupliziertes Guardrail.

## Agenten-CLI + Golden Fixture — das Mesh DIREKT steuern + selbst testen (ohne Build)

Ein KI-Agent muss das Mesh **direkt** fahren können (nicht nur über die Browser-UX) und die
Vorlage muss sich **ohne finalen Build** selbst testen lassen. Beides speist EINE Wahrheit:

- **Golden Fixture** (`apps/fachverfahren/server/dev/golden-fixture.ts`): deterministische,
  verfahrens-NEUTRALE Mesh-Seed-Daten — self-contained (Demo-Fall aus derselben `procedure.config`-
  Naht wie der reference-seed, byte-identisch) + 2 Mensch-Vermerke + 1 KI-Entwurf (offen) +
  1 Ziel mit 2 Checklisten-Schritten (einer offen) + 1 Termin + 1 Mensch-Wissen + 1 KI-Wissen (offen).
  `seedGoldenMesh({caseStore, wissenStore, taskStore?})` ist idempotent.
  Sie speist DREI Verbraucher: den Selbsttest, die Agenten-CLI und (im memory-Modus) den DEV-Server.
- **Mesh-Harness** (`dev/mesh-harness.ts`): `buildSeededMeshApp()` bootet `appBff` IN-PROCESS gegen
  In-Memory-Stores + Golden Seed + feste Caseworker-Sitzung → `app.inject(...)` fährt die ECHTEN
  Routen (RBAC · Review · Fail-safe · Guardrail bleiben eine Wahrheit; nichts reimplementiert).
- **Selbsttest** (`dev/golden-fixture.test.ts`): fährt den vollen Fluss (lesen · prüfen · exportieren)
  ohne Server/Netz/Build — die Zusage „ohne finalen Build selbst testen".
- **Agenten-CLI** (`dev/mesh-cli.ts`, Package-Script `mesh`): JSON-Ausgabe, Kommandos
  `procedures · cases · case create|show|export|tasks|actions|progress|transition|dump ·
  task list|add|notiz|done|reopen|state · vermerk list|add|ki|review · wissen list|export|add|ki|review`.
  `task done|reopen <taskId>` hakt einen Checklisten-Schritt ab (data.erledigt); `task notiz` legt eine
  Arbeits-Notiz an (Autor server-seitig). **`smoke [procedureId]`** ist die LAUFZEIT-Selbstverifikation:
  BFS findet den kürzesten `closesCase`-Pfad, legt einen Fall im Initialzustand an und fährt ihn über die
  echten Übergangs-Routen bis zum Abschluss (je Schritt ein anderer Akteur → Vier-Augen passiert) — beweist,
  dass ein (neu geschriebenes) Verfahren fahrbar ist, mehr als der strukturelle `check:procedure-contract`.
  `case dump <caseId>` liefert
  den KOMPLETTEN Entscheidungs-Kontext (Fall+Übergänge+Fortschritt+Blackboard+Aufgaben+Verfahrens-
  Wissen) in EINEM JSON — der konkrete „Mesh→Kontext"-Bundle für einen Agenten. `case transition` treibt
  die Fall-Zustandsmaschine (Vier-Augen serverseitig erzwungen → 403 bei Selbstfreigabe; die
  Optimistic-Locking-Version zieht die CLI selbst, wenn `--expected-version` fehlt). Die globale
  Option `--as <actorId>` setzt den Akteur EINES Kommandos → ein Batch kann den POSITIVEN
  Zwei-Personen-Vier-Augen-Abschluss fahren (A bereitet vor, B gibt frei → abgeschlossen). NUR
  DEV-Harness (Header-Override); PROD authentifiziert echte Sitzungen, nie per Header.
  Zwei Modi: **Einzel** (`node dist-server/dev/mesh-cli.js vermerk review <case> <id> --entscheidung bestaetigt`)
  und **Batch/STATEFUL** (`script --file plan.json`, `plan.json` = `string[][]`, EIN App-Boot →
  `add` danach in `list` sichtbar). Der Batch-Modus ist der agentische Steuer-Pfad: ein Agent schreibt
  einen JSON-Plan, erhält ein JSON-Transkript. Baue vorher `pnpm --filter @senticor/fachverfahren build:server`.
- **Warum server-seitig (`apps/*/server/dev/`):** der einzige Kompositions-Nachbar, der Stores UND BFF
  vereint (wie `buildPublicServer`/`reference-seed`). Template-owned → jeder generierte Consumer erbt
  CLI + Fixture. Der `wissenStore` wird jetzt durch `buildPublicServer` geThreadet (folgt `APP_STORE_MODE`).

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
