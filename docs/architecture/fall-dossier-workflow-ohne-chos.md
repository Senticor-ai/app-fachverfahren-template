# Fall/Dossier + Workflow ohne chos betreiben

Dieses Dokument beschreibt den **Standalone-/OSS-Pfad**, mit dem ein Konsument die
server-autoritative Fallverwaltung (Fall/Dossier, Ziele/Schritte/Termine) und die
Prozesssteuerung **ohne chos** betreibt — und die **eine Naht**, hinter der in Produktion
chos als Provider steckt. Es ergänzt die Architekturentscheidungen ADR-0001 (server-seitige
Fallverwaltung), [ADR-0002](../adr/0002-bpmn-workflow-engine-als-capability.md) und
[ADR-0003](../adr/0003-ziele-schritte-termine-als-typisierte-aufgaben.md) in `docs/adr/`.

Leitprinzip: **Ports statt Konstruktion.** Der Fall-/Prozess-Store ist eine Capability-Naht.
Das Template liefert eine eigenständige Referenzimplementierung (Stub), damit die App ohne
chos lauffähig ist; in Produktion sitzt chos hinter demselben Port. Stub und chos sind
austauschbar, ohne App oder `leistung.config` zu ändern. **chos-IP bleibt hinter der chos-API**
— das Template konsumiert nur das OSS-Port-Protokoll und bettet keine chos-Interna ein.

## Der Standalone-Pfad (ohne chos)

Vier Bausteine tragen den vollständigen OSS-Betrieb. Alle sind versioniert, getestet und
enthalten keine chos-IP:

| Baustein            | Paket / Datei                                             | Rolle                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CaseStore`         | `@senticor/app-store-postgres` (`src/case-store.ts`)      | Server-autoritative Fall-Datenschicht: persistiert die SDK-`Case`-Form gegen `app_cases`, schreibt append-only Audit-Ereignisse gegen `app_audit_events` in derselben Transaktion. |
| `TaskStore`         | `@senticor/app-store-postgres` (`src/task-store.ts`)      | Ziele/Schritte/Termine als typisierte Aufgaben (ADR-0003) gegen `app_tasks`.                                                                                                       |
| `ProcedureRegistry` | `@senticor/public-sector-sdk` (`src/domain-kernel.ts`)    | Verfahren als Daten: löst einen Fall zu seiner `ProcedureVersion` (Zustandsmaschine + Rechtsgrundlagen) auf. Reine Zustandswechsel laufen über den Reducer `transitionCase`.       |
| BPMN-Stub           | `@senticor/workflow-bpmn-stub` (`bpmnToProcedureVersion`) | Deterministische Ableitung `BPMN-Subset → ProcedureVersion`. Keine externe Engine, kein Server.                                                                                    |

Jeder Store folgt der etablierten Impl-Trias **Postgres / InMemory / Unavailable** samt
`createXFromEnv`-Fabrik (wie `AppStore`/`KanbanStore`):

- **Postgres** — der PROD-Standalone-Betrieb. Aktiviert über `APP_PG_URL` bzw.
  `APP_PG_DIRECT_URL`. Revisionssicher, mandanten-scoped, Optimistic-Locking.
- **InMemory** — Tests/DEV, identische Semantik.
- **Unavailable** — fail-closed ohne Datenbank (jede Operation wirft), damit kein stiller
  Datenverlust entsteht.

Der BFF (`@senticor/app-bff-fastify`) exponiert die Naht über REST-Routen (`routes/cases.ts`,
`routes/tasks.ts`): RBAC (`case.read` / `case.decision.prepare`), Kontext **nur** aus der
Session, `storeUnavailable` bei Store-Ausfall, fachliches Audit bei Schreibzugriffen und
Server-Erzwingung von `requiresFourEyes`. Zustandswechsel laufen ausschliesslich über den
reinen Reducer `transitionCase` (Versions-Konflikt + Vier-Augen).

### Minimalkonfiguration

```bash
# Standalone: die Template-Stores gegen eine eigene PostgreSQL-Instanz.
export APP_PG_URL="postgresql://app:app@localhost:5432/fachverfahren"
# Migrationen einspielen (app_cases, app_tasks, app_audit_events):
pnpm --filter @senticor/app-store-postgres db:migrate
```

Ohne `APP_PG_*` liefert `createCaseStoreFromEnv`/`createTaskStoreFromEnv` bewusst den
`Unavailable`-Store (fail-closed) — es gibt keinen stillen In-Memory-Fallback in Produktion.

Die `ProcedureRegistry` ist per Default **leer** (`createInMemoryProcedureRegistry([])`) —
ebenfalls fail-closed: ohne Verfahren kein Fall. Der Konsument/Generator füllt sie aus der
Verfahrenskonfiguration; aus BPMN speist der Stub sie:

```ts
import { bpmnToProcedureVersion } from "@senticor/workflow-bpmn-stub";
import { createInMemoryProcedureRegistry } from "@senticor/public-sector-sdk";

const version = bpmnToProcedureVersion(bpmnXml, {
  procedureId: "procedure.beispiel",
  version: "1.0.0",
  legalBasisIds: ["legal.example.sgbviii"], // aus der Verfahrenskonfiguration — NIE geraten
});
const procedureRegistry = createInMemoryProcedureRegistry([version]);
```

`legalBasisId`/`procedureId` stammen immer aus der `ProcedureVersion` (Verfahrenskonfiguration),
nie aus dem BPMN und nie erfunden.

## Die chos-Naht (Einhängepunkt in Produktion)

Der Vertrag ist **bereits vollständig** durch die Typen `CaseStore`, `TaskStore`,
`ProcedureRegistry` (und den Capability-Port `WorkflowPort` in
`@senticor/platform-contracts`) gegeben. Es gibt daher **keinen zusätzlichen Adapter-Code im
Template** — die Naht ist Dependency-Injection über `BffDeps`:

```ts
// packages/app-bff-fastify/src/deps.ts (Auszug)
export interface BffDeps {
  caseStore: CaseStore; // Template-Stub (Standalone); in PROD sitzt chos hinter der Naht.
  taskStore: TaskStore; // Template-Stub; in PROD chos hinter der Naht.
  procedureRegistry: ProcedureRegistry;
  // ...
}
```

Der Einhängepunkt ist die Store-Konstruktion in der App-Komposition
(`apps/fachverfahren/server/index.ts`): die `createXFromEnv`-Defaults werden durch eine
chos-gebundene Implementierung **ersetzt**, die dieselben Interfaces erfüllt.

```ts
// Standalone (heute, Default): Template-Stub gegen die eigene DB.
const bff = {
  caseStore: createCaseStoreFromEnv(env),
  taskStore: createTaskStoreFromEnv(env),
  procedureRegistry: createInMemoryProcedureRegistry([]),
  // ...
};

// Produktion mit chos (Skizze des Einhängepunkts — Adapter lebt im Deployment,
// NICHT im OSS-Template): ein chos-Adapter implementiert exakt CaseStore/TaskStore/
// ProcedureRegistry und spricht die chos-API. Kein App-/Config-Umbau nötig.
const bff = {
  caseStore: createChosCaseStore(chosClient), // erfüllt CaseStore
  taskStore: createChosTaskStore(chosClient), // erfüllt TaskStore
  procedureRegistry: createChosProcedureRegistry(chosClient), // erfüllt ProcedureRegistry
  // ...
};
```

Das ist dasselbe Adapter-Muster wie `AiAssistPort → chos` (siehe `AiAssistPort` in
`packages/platform-contracts/src/ports.ts`) und `WorkflowPort → chos` (siehe
`@senticor/workflow-bpmn-stub`): der Port ist die eine Wahrheit, der Provider (Stub oder chos)
ist austauschbar. Der chos-Adapter gehört ins **Deployment/den Provider-Pack**, nicht ins
OSS-Template — so bleibt chos-IP hinter der chos-API und das Template frei von Anbieter-Interna.

## Ehrlich: Stub vs. chos in Produktion

Der Template-Stub ist **kein Spielzeug**: die Postgres-Variante ist server-autoritativ,
revisionssicher (append-only Audit), mandanten-scoped und Optimistic-Locking-gesichert. Für ein
Verfahren mit einer PostgreSQL-Instanz ist er ein tragfähiger Produktionspfad. Bewusste
Grenzen, die in Produktion chos (oder ein gleichwertiger Provider) hinter derselben Naht füllt:

- **Prozess-Engine.** Der Stub treibt `Case.state` nur über den reinen Reducer `transitionCase`
  entlang `ProcedureVersion.allowedTransitions`. Es gibt **keine** laufende BPMN-Engine: keine
  Timer/Fristen-Orchestrierung, keine Boundary-/Intermediate-Events, keine Subprozesse,
  Pools/Lanes oder Message-Flows, keine Gateway-Semantik (XOR/AND werden gleich behandelt).
  Siehe die „Bewussten Grenzen" in `packages/workflow-bpmn-stub/README.md`.
- **Verfahrensübergreifende Orchestrierung** (langlaufende, wiederaufnehmbare Abläufe über
  mehrere Fälle/Systeme) leistet der Stub nicht — dafür ist der `WorkflowPort` vorgesehen.
- **Betriebsreife im grossen Massstab** (Hochverfügbarkeit, horizontale Skalierung des
  Prozess-Zustands, verteilte Sperren) ist Sache des Providers, nicht der Referenz-Impl.

Was der Stub bewusst **garantiert** und was auch mit chos unverändert gilt: fachliche
Zustandswechsel laufen ausschliesslich über `transitionCase`; jede Mutation schreibt append-only
Audit in derselben Transaktion; `requiresFourEyes` wird serverseitig erzwungen; Mandanten-Scope
kommt ausschliesslich aus der Session; `legalBasisId` stammt aus der `ProcedureVersion`. Diese
Invarianten liegen im Port und im BFF, nicht im Provider — deshalb ändert der Wechsel Stub → chos
das Verhalten der App nicht.
