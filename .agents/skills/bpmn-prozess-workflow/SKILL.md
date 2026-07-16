---
name: bpmn-prozess-workflow
description: Leite aus einem BPMN-2.0-Kern-Subset (FIM/KGSt-Prozessmodell) eine SDK-ProcedureVersion ab und treibe damit Fall-Zustandswechsel — nutze diesen Skill bei "BPMN nutzen", "Prozess/Workflow aus BPMN", "ProcedureVersion aus BPMN ableiten", "requiresFourEyes/Vier-Augen im Prozess", "Fall-Übergang/transition", "Standalone-Workflow ohne chos".
---

# BPMN-Prozess-Workflow

Der Autorenpfad, um den PROZESS eines Fachverfahrens aus einem
**BPMN-2.0-Kern-Subset** auszuführen. Die BPMN (aus **FIM** — Föderales
Informationsmanagement — oder **KGSt**, je Kommune angepasst) ist die EINE
Wahrheit: eine reine Funktion leitet daraus eine SDK-`ProcedureVersion` ab, und
die Fälle wechseln ihren Zustand AUSSCHLIESSLICH über den reinen Reducer
`transitionCase` hinter der BFF-Naht. Kein zweites, konkurrierendes
Prozessmodell. Root-Policy und Pfad-Karte stehen in `AGENTS.md`; die Fall-/
Dossier-Seite vertieft [[dossier-fallmanagement]].

## Wann

- Ein Verfahren bringt eine **FIM/KGSt-BPMN** mit und du brauchst daraus die
  Zustände + erlaubten Übergänge als Daten (`ProcedureVersion`).
- Du willst einen **Fall-Zustandswechsel** auslösen (`POST
/api/cases/:id/transitions`) und musst wissen, wie Aktion, Berechtigung und
  Vier-Augen aus der BPMN entstehen.
- Du willst den **Standalone-/OSS-Pfad OHNE chos** betreiben (Template-Stub).

## Die eine Funktion

`bpmnToProcedureVersion(xml, opts)` aus
`packages/workflow-bpmn-stub/src/bpmn-to-procedure-version.ts` (re-exportiert in
`index.ts`). Rein, deterministisch, KEIN Server, KEINE externe Engine, KEINE
Domänen-Literale.

```ts
import { bpmnToProcedureVersion } from "@senticor/workflow-bpmn-stub";
import {
  createInMemoryProcedureRegistry,
  transitionCase,
} from "@senticor/public-sector-sdk";

const version = bpmnToProcedureVersion(bpmnXml, {
  procedureId: "procedure.beispiel", // aus der Verfahrenskonfiguration, NICHT aus der BPMN geraten
  version: "1.0.0",
  legalBasisIds: ["legal.example.sgbviii"], // Rechtsgrundlagen kommen aus der Config, NIE aus der BPMN
  effectiveFrom: "2026-01-01T00:00:00.000Z", // optional (siehe unten)
});

const registry = createInMemoryProcedureRegistry([version]);
```

`opts` = `BpmnToProcedureVersionOptions`: `procedureId`, `version`,
`legalBasisIds` sind PFLICHT; `effectiveFrom?` ist additiv. Fehlt
`effectiveFrom`, setzt die Funktion den Sentinel `DEFAULT_EFFECTIVE_FROM`
(`1970-01-01T00:00:00.000Z`, "kein unterer Gültigkeitsrand") — kein erfundenes
Datum. `procedureId`/`legalBasisIds` werden NIE aus der BPMN geraten.

Rückgabe = SDK-`ProcedureVersion`
(`public-sector-sdk/src/domain-kernel.ts`): `allowedStates: string[]` +
`allowedTransitions: CaseTransition[]` (`from`/`to`/`action`/
`requiredPermission`/`requiresFourEyes?`).

## Was das ausführbare Subset KANN (und was NICHT)

Unterstützt (Namespace-Präfixe `bpmn:`/`bpmn2:`/… toleriert):

| BPMN-Element                                | Behandlung                              |
| ------------------------------------------- | --------------------------------------- |
| `<process>`                                 | Container (mehrere werden konkateniert) |
| `<startEvent>` / `<endEvent>`               | → Zustand (`allowedStates`)             |
| `<task>` / `<userTask>` / `<serviceTask>`   | → Zustand (`allowedStates`)             |
| `<exclusiveGateway>` / `<parallelGateway>`  | Routing, KEIN Zustand — flachgezogen    |
| `<sequenceFlow sourceRef targetRef [name]>` | → Transition (`allowedTransitions`)     |

Ableitungsregeln:

- `allowedStates` = Label jedes Task-/Event-Knotens in Dokumentreihenfolge.
  Label = `@name` (getrimmt), sonst `@id`. Gateways sind KEINE Zustände.
- `allowedTransitions` = pro Pfad Quell-Zustand → (0..n Gateways) →
  Ziel-Zustand EINE Transition: `from`/`to` = Zustands-Label,
  `action` = `@name` des ersten benannten Flows auf dem Pfad, sonst
  `${from}->${to}`; `requiredPermission` = Konstante `"case.decision.prepare"`;
  `requiresFourEyes: true`, wenn ein Flow auf dem Pfad die Vier-Augen-Konvention
  erfüllt (sonst weggelassen); `closesCase: true`, wenn der Übergang den Fall
  schließt (closesCase-Konvention, siehe unten; sonst weggelassen).

Bewusste Grenzen (fail-honest — das ist NICHT volle BPMN-2.0-/Camunda-Parität):

- Gateway-**Semantik** wird nicht unterschieden: exclusive (XOR) und parallel
  (AND) werden identisch als Routing flachgezogen; `conditionExpression`/
  `defaultFlow` werden NICHT ausgewertet.
- KEINE Timer/Fristen, Boundary-/Intermediate-Events, Subprozesse, Pools/Lanes,
  Message-/Data-Flows.
- Minimaler **Regex-Parser**: Attributwerte dürfen kein `>` enthalten; kein
  CDATA-Parsing.
- Ein `sequenceFlow`, dessen `sourceRef`/`targetRef` auf einen nicht geparsten
  Knoten zeigt, wird übersprungen.
- Fehlt ein `<process>` oder ein Zustands-Knoten, WIRFT die Funktion
  (fail-closed).

## Vier-Augen-Konvention

Ein Flow löst `requiresFourEyes` aus, wenn EINER von zwei gleichwertigen
Auslösern greift:

1. Flow-`@name` beginnt (case-insensitiv) mit `entscheiden` — z. B.
   `name="entscheiden Bewilligung"`; ODER
2. der Flow trägt ein Extension-Attribut mit Local-Name
   `requiresFourEyes="true"` (Präfix egal, z. B. `senticor:requiresFourEyes`).

Hier wird NUR das Flag aus dem Modell abgeleitet. Die eigentliche
Zwei-Akteure-Erzwingung passiert **server-seitig**: `POST
/api/cases/:id/transitions` (`app-bff-fastify/src/routes/cases.ts`) lehnt einen
`requiresFourEyes`-Übergang mit `403` ab, wenn der Akteur des jüngsten
Audit-Eintrags derselbe ist wie der aktuelle (Vorbereiter darf nicht selbst
freigeben).

## closesCase-Konvention (Abschluss des Falls)

Ein Übergang löst `closesCase` aus, wenn EINER von zwei gleichwertigen Auslösern
greift:

1. der **Ziel-Knoten ist ein `<endEvent>`** — die BPMN-Semantik des Endereignisses
   IST „der Fall wird geschlossen"; ODER
2. ein Flow auf dem Pfad trägt ein Extension-Attribut mit Local-Name
   `closesCase="true"` (Präfix egal, z. B. `senticor:closesCase`).

**Auslöser 2 trägt den wiederaufnehmbaren Fall** — das Case-Management-Kernmuster:
ein reopenbarer Abschluss-Zustand hat einen ausgehenden Fluss (z. B.
`wiederaufnehmen`) und darf deshalb **kein `<endEvent>`** sein (ein Endereignis hat
definitionsgemäß keine ausgehenden Flüsse). Modelliere ihn als `userTask` und sage
den Abschluss explizit an. Vorlage:
`docs/examples/integrationsberatung/integrationsmanagement.bpmn`.

Wirkung: der reine Reducer `transitionCase` stempelt bei `closesCase`-Übergängen
`closedAt` und **entfernt es bei nicht-schließenden Übergängen wieder** (die
Wiederaufnahme räumt die Schließzeit ab). `closesCase` ist data-driven — es gibt
KEINEN hart kodierten Endzustand-Namen. Das Gate `check:procedure-contract`
verlangt **mindestens einen** schließenden Übergang je Verfahren.

## Die Kette: BPMN → Fall-Zustandswechsel

```text
FIM/KGSt-BPMN (XML, EINE Wahrheit)
  → bpmnToProcedureVersion(xml, opts)         // reine Ableitung (workflow-bpmn-stub)
  → ProcedureVersion { allowedStates, allowedTransitions }
  → createInMemoryProcedureRegistry([version]) // ProcedureRegistry-Naht (domain-kernel.ts)
  → BFF loest zur Akte ihre ProcedureVersion auf (deps.procedureRegistry.get)
  → transitionCase(case, version, action, expectedVersion) // reiner Reducer: Versions-Konflikt + Guard
  → POST /api/cases/:id/transitions                          // RBAC + Vier-Augen + Optimistic-Locking + Audit
```

`transitionCase` (`domain-kernel.ts`) sucht die Transition mit
`from === case.state && action === action`, prüft `expectedVersion` (Konflikt →
Fehler `case version conflict` → `409`) und liefert den neuen `Case` mit
`version + 1`. Der Zielzustand wird NIE aus dem Request-Body gelesen, sondern aus
der `ProcedureVersion` gerechnet.

## Stub (Template) vs. chos-Engine (PROD)

Laut ADR-0002 sitzt der **`WorkflowPort`** (`startWorkflow`/`signalWorkflow`,
`platform-contracts/src/ports.ts`) als Contract-Naht dazwischen; in Produktion
pluggt die **chos-Workflow-Engine** dahinter (Adapter-Muster wie
`AiAssistPort → chos`), ohne App/Config zu ändern. chos-IP bleibt hinter der
chos-API.

Ehrlich zum Ist-Stand: das Template liefert die **reine Ableitung**
(`bpmnToProcedureVersion`) + den **reinen Reducer** (`transitionCase`) + die
**BFF-Übergangsroute**. Eine token-ausführende Runtime (Prozess-Instanzen,
automatisches Weiterschalten hinter `WorkflowPort.startWorkflow`) ist NOCH NICHT
implementiert — `WorkflowPort` existiert als Contract, ohne Engine (ADR-0002).
Übergänge werden heute explizit via `POST /api/cases/:id/transitions`
angestoßen. Ebenfalls noch offen/geplant: eine eigene `case-management`-
Capability (ADR-0004 klärt, ob `workflow`+`records`+`audit` reichen) und der
a11y-BPMN-Editor als Kit-Komponente.

## Minimalbeispiel

Winzige synthetische BPMN (keine echten Personen/PII), inkl. Gateway-Flachziehen
und einem Vier-Augen-Übergang via Namenskonvention:

```ts
const bpmnXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="beispiel" isExecutable="true">
    <bpmn:startEvent id="start" name="Eingegangen" />
    <bpmn:userTask id="pruefung" name="In Pruefung" />
    <bpmn:exclusiveGateway id="gw" name="Ergebnis?" />
    <bpmn:endEvent id="bewilligt" name="Bewilligt" />
    <bpmn:endEvent id="abgelehnt" name="Abgelehnt" />

    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="pruefung" />
    <bpmn:sequenceFlow id="f2" sourceRef="pruefung" targetRef="gw" />
    <bpmn:sequenceFlow id="f3" name="entscheiden Bewilligung" sourceRef="gw" targetRef="bewilligt" />
    <bpmn:sequenceFlow id="f4" name="Ablehnen" sourceRef="gw" targetRef="abgelehnt" />
  </bpmn:process>
</bpmn:definitions>`;

const version = bpmnToProcedureVersion(bpmnXml, {
  procedureId: "procedure.beispiel",
  version: "1.0.0",
  legalBasisIds: ["legal.example.sgbviii"],
});

// version.allowedStates  → ["Eingegangen", "In Pruefung", "Bewilligt", "Abgelehnt"]
//   ("Ergebnis?" ist ein Gateway → bewusst KEIN Zustand)
// version.allowedTransitions →
//   { from: "Eingegangen", to: "In Pruefung", action: "Eingegangen->In Pruefung", requiredPermission: "case.decision.prepare" }
//   { from: "In Pruefung",  to: "Bewilligt",   action: "entscheiden Bewilligung",  requiredPermission: "case.decision.prepare", requiresFourEyes: true }
//   { from: "In Pruefung",  to: "Abgelehnt",   action: "Ablehnen",                 requiredPermission: "case.decision.prepare" }
```

Danach die `version` in eine `createInMemoryProcedureRegistry([version])` geben,
die der BFF als `deps.procedureRegistry` bekommt — der Übergang
`"entscheiden Bewilligung"` verlangt dann server-seitig zwei verschiedene
Akteure.

## Referenzen

- `packages/workflow-bpmn-stub/` — Funktion, README, Tests
  (`bpmn-to-procedure-version.test.ts` mit einer FIM-artigen Beispiel-BPMN).
- `packages/public-sector-sdk/src/domain-kernel.ts` — `ProcedureVersion`,
  `CaseTransition`, `transitionCase`, `ProcedureRegistry`.
- `packages/app-bff-fastify/src/routes/cases.ts` — `POST
/api/cases/:id/transitions` (RBAC + Vier-Augen + Optimistic-Locking + Audit).
- `docs/adr/0002-bpmn-workflow-engine-als-capability.md` — Entscheidung
  (Stub + chos als Provider, ausführbares Subset, `WorkflowPort`).
- `docs/examples/integrationsberatung/integrationsmanagement.bpmn` —
  vollständiges synthetisches Beispiel.
