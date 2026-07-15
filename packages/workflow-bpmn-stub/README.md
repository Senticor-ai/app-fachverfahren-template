# @senticor/workflow-bpmn-stub

Deterministische, reine **BPMN-Kern-Subset → `ProcedureVersion`**-Ableitung — der dokumentierte
**Standalone-/OSS-Pfad OHNE chos** aus [ADR-0002](../../docs/adr/0002-bpmn-workflow-engine-als-capability.md)
(Bausteine 1 + 2). Kein Server, keine externe Engine, keine Domänen-Literale, keine chos-IP.

Die FIM-/KGSt-BPMN ist die **eine Wahrheit**: `bpmnToProcedureVersion` erzeugt daraus eine SDK-`ProcedureVersion`,
die die `ProcedureRegistry`-Naht (`createInMemoryProcedureRegistry`) füttert und `Case.state` **ausschließlich**
über den reinen Reducer `transitionCase` treibt. In Produktion sitzt chos hinter derselben `WorkflowPort`-Naht;
dieses Paket ist die austauschbare OSS-Referenz.

## API

```ts
import { bpmnToProcedureVersion } from "@senticor/workflow-bpmn-stub";
import {
  createInMemoryProcedureRegistry,
  transitionCase,
} from "@senticor/public-sector-sdk";

const version = bpmnToProcedureVersion(bpmnXml, {
  procedureId: "procedure.integrationsmanagement",
  version: "1.0.0",
  legalBasisIds: ["legal.example.sgbviii"], // aus der Verfahrenskonfiguration — NIE aus der BPMN geraten
  effectiveFrom: "2026-01-01T00:00:00.000Z", // optional, siehe unten
});

const registry = createInMemoryProcedureRegistry([version]);
```

`legalBasisIds` und `procedureId` stammen aus der Verfahrenskonfiguration (ProcedureVersion), nicht aus dem BPMN.
`effectiveFrom` ist optional; fehlt es, wird der Sentinel `1970-01-01T00:00:00.000Z` („kein unterer Gültigkeitsrand",
`DEFAULT_EFFECTIVE_FROM`) gesetzt — kein erfundenes Datum. Beim planmäßigen Ausrollen übergibt der Aufrufer den
echten Beginn.

## Ausführbares Subset (kein Overclaiming)

| BPMN-Element                                | Behandlung                                               |
| ------------------------------------------- | -------------------------------------------------------- |
| `<process>`                                 | Container (mehrere Prozesse werden konkateniert geparst) |
| `<startEvent>` / `<endEvent>`               | → Zustand (`allowedStates`)                              |
| `<task>` / `<userTask>` / `<serviceTask>`   | → Zustand (`allowedStates`)                              |
| `<exclusiveGateway>` / `<parallelGateway>`  | Routing, **kein** Zustand — wird flachgezogen            |
| `<sequenceFlow sourceRef targetRef [name]>` | → Transition (`allowedTransitions`)                      |

Namespace-Präfixe (`bpmn:`, `bpmn2:`, …) sind optional/toleriert.

### Ableitungsregeln

- **`allowedStates`** = Label jedes Task-/Event-Knotens in Dokumentreihenfolge. Label = `@name` (getrimmt),
  sonst `@id`. Gateways sind keine Zustände.
- **`allowedTransitions`** = pro Pfad Quell-Zustand → (0..n Gateways) → Ziel-Zustand eine Transition:
  - `from` / `to` = Label des Quell-/Ziel-Zustands (Gateways werden übersprungen)
  - `action` = `@name` des ersten benannten Flows auf dem Pfad, sonst `${from}->${to}`
  - `requiredPermission` = `"case.decision.prepare"` (Konstante)
  - `requiresFourEyes` = `true`, wenn ein Flow auf dem Pfad die Vier-Augen-Konvention erfüllt (sonst weggelassen)

### Vier-Augen-Konvention (zwei gleichwertige Auslöser)

1. Flow-`@name` beginnt (case-insensitiv) mit `entscheiden`; **oder**
2. der Flow trägt ein Extension-Attribut mit Local-Name `requiresFourEyes="true"` (Präfix egal, z. B.
   `senticor:requiresFourEyes`).

Die eigentliche Zwei-Akteure-Erzwingung passiert **server-seitig** (BFF/Governance) — hier wird nur das Flag
aus dem Modell abgeleitet.

## Bewusste Grenzen

- Gateway-**Semantik** wird nicht unterschieden: exclusive (XOR) und parallel (AND) werden identisch als
  Routing flachgezogen; `conditionExpression`/`defaultFlow` werden **nicht** ausgewertet.
- Keine Timer/Fristen, Boundary-/Intermediate-Events, Subprozesse, Pools/Lanes, Message-/Data-Flows.
- Minimaler Regex-Parser für das obige Subset: Attributwerte dürfen kein `>` enthalten; kein CDATA-Parsing.
- Sequenzflüsse, deren `sourceRef`/`targetRef` auf einen nicht geparsten Knoten zeigt, werden übersprungen.
- Fehlt ein `<process>` oder ein Zustands-Knoten, wirft die Funktion (fail-closed).
