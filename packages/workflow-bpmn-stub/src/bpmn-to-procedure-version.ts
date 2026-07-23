// bpmnToProcedureVersion — leitet eine SDK-`ProcedureVersion` aus einem BPMN-2.0-KERN-SUBSET ab (ADR-0002,
// Baustein 1+2: „BPMN als EINE Wahrheit" + „Template-Stub-Engine / Standalone-OSS-Pfad OHNE chos"). Reine,
// deterministische Funktion: KEIN Server, KEINE externe Engine, KEINE Domänen-Literale. Die abgeleitete
// `ProcedureVersion` füttert die `ProcedureRegistry`-Naht (`createInMemoryProcedureRegistry`) und treibt
// `Case.state` AUSSCHLIESSLICH über den reinen Reducer `transitionCase` — es entsteht kein zweites, konkurrierendes
// Prozessmodell.
//
// ── AUSFÜHRBARES SUBSET (kein Overclaiming — das ist NICHT volle BPMN-2.0-/Camunda-Parität) ──────────────
//   * `<process>`                     — Container; mehrere Prozesse werden konkateniert geparst.
//   * `<startEvent>` / `<endEvent>`   — werden zu Zuständen (`allowedStates`).
//   * `<task>` / `<userTask>` / `<serviceTask>` — werden zu Zuständen (`allowedStates`).
//   * `<exclusiveGateway>` / `<parallelGateway>` — ROUTING, KEIN Zustand; werden „flachgezogen".
//   * `<sequenceFlow sourceRef targetRef [name]>` — werden zu `allowedTransitions`.
//   Namespace-Präfixe (`bpmn:`, `bpmn2:`, …) sind optional/toleriert.
//
// ── ABLEITUNGSREGELN ─────────────────────────────────────────────────────────────────────────────────────
//   allowedStates       = Label jedes Task-/Event-Knotens in Dokumentreihenfolge; Label = @name (getrimmt),
//                         sonst @id. Gateways sind KEINE Zustände.
//   allowedTransitions  = pro Pfad Quell-Zustand → (0..n Gateways) → Ziel-Zustand EINE Transition:
//                         from   = Label des Quell-Zustands
//                         to     = Label des Ziel-Zustands
//                         action = @name des ersten benannten Flows auf dem Pfad, sonst `${from}->${to}`
//                         requiredPermission = "case.decision.prepare" (Konstante)
//                         requiresFourEyes   = true, wenn IRGENDEIN Flow auf dem Pfad die Vier-Augen-Konvention
//                                              erfüllt (siehe unten); sonst weggelassen.
//                         closesCase         = true, wenn der Übergang den Fall schliesst (siehe Konvention
//                                              unten); der Reducer `transitionCase` stempelt dann `closedAt`.
//
// ── VIER-AUGEN-KONVENTION (dokumentiert, zwei gleichwertige Auslöser) ────────────────────────────────────
//   (a) Flow-@name beginnt (case-insensitiv) mit „entscheiden"; ODER
//   (b) der Flow trägt ein Extension-Attribut mit Local-Name `requiresFourEyes="true"` (Präfix egal, z. B.
//       `senticor:requiresFourEyes`).
//   Die eigentliche Zwei-Akteure-Erzwingung passiert server-seitig (BFF/Governance) — hier wird NUR das Flag
//   aus dem Modell abgeleitet.
//
// ── N-AUGEN-KONVENTION (Verallgemeinerung von Vier-Augen) ────────────────────────────────────────────────
//   Ein Flow mit Extension-Attribut Local-Name `requiredApprovals="N"` (N≥2, Präfix egal, z. B.
//   `senticor:requiredApprovals`) verlangt N DISTINKTE Freigebende → `CaseTransition.requiredApprovals`. Das
//   ist die Verallgemeinerung von Vier-Augen (= requiredApprovals 2). ENGINE-NEUTRAL: ein anderer Workflow-
//   Adapter (Camunda/n8n) mappt sein Modell ebenso auf dieses Feld — die Governance-Spezifikation ist damit
//   austauschbar über die Engine, aber grafisch im BPMN konfigurierbar. Die Zahl-Erzwingung bleibt server-seitig.
//
// ── CLOSES-CASE-KONVENTION (dokumentiert, zwei gleichwertige Auslöser) ───────────────────────────────────
//   (a) der ZIEL-Knoten des Übergangs ist ein `<endEvent>` (die BPMN-Semantik des Endereignisses IST
//       „der Fall wird geschlossen"); ODER
//   (b) ein Flow auf dem Pfad trägt ein Extension-Attribut mit Local-Name `closesCase="true"` (Präfix egal,
//       z. B. `senticor:closesCase`).
//   (b) trägt den WIEDERAUFNEHMBAREN Fall (Case-Management-Kernmuster): ein reopenbarer Abschluss-Zustand hat
//   ausgehende Flüsse (z. B. „wiederaufnehmen") und darf deshalb KEIN `<endEvent>` sein — ein Endereignis hat
//   definitionsgemäß keine ausgehenden Flüsse. Das Modell sagt den Abschluss dann explizit an.
//
// ── BEWUSSTE GRENZEN (fail-honest) ───────────────────────────────────────────────────────────────────────
//   * Gateway-SEMANTIK wird NICHT unterschieden: exclusive (XOR) und parallel (AND) werden identisch als
//     Routing flachgezogen; `conditionExpression`/`defaultFlow` werden NICHT ausgewertet.
//   * KEINE Timer/Fristen, Boundary-/Intermediate-Events, Subprozesse, Pools/Lanes, Message-/Data-Flows.
//   * Der Regex-Parser deckt das obige Subset ab: Attributwerte dürfen kein `>` enthalten; kein CDATA-Parsing.
//   * `sequenceFlow`s, deren `sourceRef`/`targetRef` auf einen NICHT geparsten Knoten zeigt, werden übersprungen.

import type {
  CaseTransition,
  ProcedureVersion,
} from "@senticor/public-sector-sdk";

/** Optionen für die Ableitung. Die drei Kern-Felder sind Pflicht; `effectiveFrom` ist additiv (siehe Default). */
export interface BpmnToProcedureVersionOptions {
  /** Fachliche Prozess-Kennung (aus der Verfahrenskonfiguration — NICHT aus der BPMN geraten). */
  procedureId: string;
  /** Versions-Kennung dieser `ProcedureVersion`. */
  version: string;
  /** Rechtsgrundlagen — stammen aus der Verfahrenskonfiguration und werden NIE aus der BPMN erfunden. */
  legalBasisIds: string[];
  /**
   * Optionaler Gültigkeitsbeginn der Version. Wird bewusst NICHT aus der BPMN geraten. Fehlt er, wird der
   * dokumentierte Sentinel {@link DEFAULT_EFFECTIVE_FROM} („schon immer gültig / kein unterer Rand") gesetzt;
   * beim planmäßigen Ausrollen einer Version überschreibt der Aufrufer ihn mit dem echten Datum.
   */
  effectiveFrom?: string;
}

/** Sentinel für `effectiveFrom`, wenn der Aufrufer keinen echten Gültigkeitsbeginn übergibt (kein erfundenes Datum). */
export const DEFAULT_EFFECTIVE_FROM = "1970-01-01T00:00:00.000Z";

/** Konstante Berechtigung für abgeleitete Übergänge (feinere RBAC bleibt der Governance-/BFF-Schicht überlassen). */
const REQUIRED_PERMISSION = "case.decision.prepare";

type FlowNodeType = "event" | "task" | "gateway";

interface FlowNode {
  id: string;
  name?: string;
  type: FlowNodeType;
  /** `<endEvent>`: das Erreichen dieses Knotens SCHLIESST den Fall (→ `CaseTransition.closesCase`). */
  isEnd: boolean;
}

interface SequenceFlow {
  sourceRef: string;
  targetRef: string;
  name?: string;
  requiresFourEyesAttr: boolean;
  closesCaseAttr: boolean;
  /** N-AUGEN: `senticor:requiredApprovals="3"` → 3 distinkte Freigebende (Verallgemeinerung von Vier-Augen). */
  requiredApprovalsAttr?: number;
}

/** BPMN-Element-Tag (ohne Namespace-Präfix) → Rolle im abgeleiteten Zustandsmodell. */
const NODE_TAGS: Record<string, FlowNodeType> = {
  startEvent: "event",
  endEvent: "event",
  userTask: "task",
  serviceTask: "task",
  task: "task",
  exclusiveGateway: "gateway",
  parallelGateway: "gateway",
};

// Längere Tags zuerst, damit die Alternation nie einen kürzeren Präfix bevorzugt.
const NODE_TAG_ALTERNATION = Object.keys(NODE_TAGS)
  .sort((a, b) => b.length - a.length)
  .join("|");

const NODE_RE = new RegExp(
  `<(?:[\\w.-]+:)?(${NODE_TAG_ALTERNATION})\\b([^>]*?)/?>`,
  "g",
);
const FLOW_RE = /<(?:[\w.-]+:)?sequenceFlow\b([^>]*?)\/?>/g;
const PROCESS_RE =
  /<(?:[\w.-]+:)?process\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?process>/g;
const ATTR_RE = /([\w.:-]+)\s*=\s*"([^"]*)"|([\w.:-]+)\s*=\s*'([^']*)'/g;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR_RE.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      attrs[match[1]] = match[2] ?? "";
    } else if (match[3] !== undefined) {
      attrs[match[3]] = match[4] ?? "";
    }
  }
  return attrs;
}

/** Local-Name eines (evtl. präfixierten) Attributnamens: `senticor:requiresFourEyes` → `requiresFourEyes`. */
function localName(key: string): string {
  const colon = key.lastIndexOf(":");
  return colon === -1 ? key : key.slice(colon + 1);
}

function optionalName(attrs: Record<string, string>): string | undefined {
  const raw = attrs["name"];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return decodeXml(raw);
}

function stateLabel(node: FlowNode): string {
  return node.name ?? node.id;
}

function isFourEyesFlow(flow: SequenceFlow): boolean {
  if (flow.requiresFourEyesAttr) {
    return true;
  }
  return (
    flow.name !== undefined &&
    flow.name.trim().toLowerCase().startsWith("entscheiden")
  );
}

/**
 * Leitet aus einem BPMN-2.0-Kern-Subset (siehe Modul-Kommentar) eine SDK-`ProcedureVersion` ab. Rein und
 * deterministisch. Wirft, wenn das XML kein `<process>` mit mindestens einem Zustands-Knoten enthält (fail-closed).
 */
export function bpmnToProcedureVersion(
  xml: string,
  opts: BpmnToProcedureVersionOptions,
): ProcedureVersion {
  const processBodies: string[] = [];
  PROCESS_RE.lastIndex = 0;
  let processMatch: RegExpExecArray | null;
  while ((processMatch = PROCESS_RE.exec(xml)) !== null) {
    processBodies.push(processMatch[1] ?? "");
  }
  if (processBodies.length === 0) {
    throw new Error(
      "bpmnToProcedureVersion: kein <process>-Element im BPMN gefunden",
    );
  }
  const body = processBodies.join("\n");

  // 1) Flow-Knoten in Dokumentreihenfolge (erste Definition je id gewinnt).
  const nodes: FlowNode[] = [];
  const nodeById = new Map<string, FlowNode>();
  NODE_RE.lastIndex = 0;
  let nodeMatch: RegExpExecArray | null;
  while ((nodeMatch = NODE_RE.exec(body)) !== null) {
    const tag = nodeMatch[1];
    const attrs = parseAttrs(nodeMatch[2] ?? "");
    const id = attrs["id"];
    if (tag === undefined || id === undefined || id === "") {
      continue;
    }
    if (nodeById.has(id)) {
      continue;
    }
    const type = NODE_TAGS[tag];
    if (type === undefined) {
      continue;
    }
    const name = optionalName(attrs);
    const node: FlowNode = {
      id,
      type,
      isEnd: tag === "endEvent",
      ...(name !== undefined ? { name } : {}),
    };
    nodes.push(node);
    nodeById.set(id, node);
  }

  const stateNodes = nodes.filter((node) => node.type !== "gateway");
  if (stateNodes.length === 0) {
    throw new Error(
      "bpmnToProcedureVersion: keine Task-/Event-Knoten im <process> gefunden",
    );
  }

  const allowedStates: string[] = [];
  const seenStates = new Set<string>();
  for (const node of stateNodes) {
    const label = stateLabel(node);
    if (!seenStates.has(label)) {
      seenStates.add(label);
      allowedStates.push(label);
    }
  }

  // 2) Sequenzflüsse + Adjazenz nach Quelle.
  const flowsBySource = new Map<string, SequenceFlow[]>();
  FLOW_RE.lastIndex = 0;
  let flowMatch: RegExpExecArray | null;
  while ((flowMatch = FLOW_RE.exec(body)) !== null) {
    const attrs = parseAttrs(flowMatch[1] ?? "");
    const sourceRef = attrs["sourceRef"];
    const targetRef = attrs["targetRef"];
    if (
      sourceRef === undefined ||
      sourceRef === "" ||
      targetRef === undefined ||
      targetRef === ""
    ) {
      continue;
    }
    const name = optionalName(attrs);
    const requiresFourEyesAttr = Object.entries(attrs).some(
      ([key, value]) =>
        localName(key) === "requiresFourEyes" && value === "true",
    );
    const closesCaseAttr = Object.entries(attrs).some(
      ([key, value]) => localName(key) === "closesCase" && value === "true",
    );
    // N-AUGEN: `senticor:requiredApprovals="N"` (Präfix egal) → N distinkte Freigebende. Nur eine ganze Zahl ≥ 2.
    const requiredApprovalsRaw = Object.entries(attrs).find(
      ([key]) => localName(key) === "requiredApprovals",
    )?.[1];
    const parsedApprovals =
      requiredApprovalsRaw !== undefined
        ? Number.parseInt(requiredApprovalsRaw, 10)
        : Number.NaN;
    const requiredApprovalsAttr =
      Number.isInteger(parsedApprovals) && parsedApprovals >= 2
        ? parsedApprovals
        : undefined;
    const flow: SequenceFlow = {
      sourceRef,
      targetRef,
      requiresFourEyesAttr,
      closesCaseAttr,
      ...(requiredApprovalsAttr !== undefined ? { requiredApprovalsAttr } : {}),
      ...(name !== undefined ? { name } : {}),
    };
    const bucket = flowsBySource.get(sourceRef);
    if (bucket === undefined) {
      flowsBySource.set(sourceRef, [flow]);
    } else {
      bucket.push(flow);
    }
  }

  // 3) Transitionen: von jedem Zustands-Knoten die ausgehenden Flüsse verfolgen, Gateways flachziehen,
  //    beim ersten erreichten Zustands-Knoten eine Transition emittieren.
  const transitions = new Map<string, CaseTransition>();

  const emit = (
    fromLabel: string,
    target: FlowNode,
    path: SequenceFlow[],
  ): void => {
    const toLabel = stateLabel(target);
    const namedFlow = path.find((flow) => flow.name !== undefined);
    const action = namedFlow?.name ?? `${fromLabel}->${toLabel}`;
    const requiresFourEyes = path.some(isFourEyesFlow);
    // N-AUGEN: die hoechste requiredApprovals-Angabe auf dem Pfad (0 = keine) — die Verallgemeinerung von Vier-Augen.
    const requiredApprovals = Math.max(
      0,
      ...path.map((flow) => flow.requiredApprovalsAttr ?? 0),
    );
    // Schließt dieser Übergang den Fall? ZWEI gleichwertige Auslöser (siehe Modul-Kommentar): das Ziel ist ein
    // endEvent ODER ein Flow auf dem Pfad trägt closesCase="true". Letzteres trägt den WIEDERAUFNEHMBAREN Fall:
    // ein reopenbarer Abschluss-Zustand hat ausgehende Flüsse und darf daher kein endEvent sein (ein
    // Endereignis hat definitionsgemäß keine ausgehenden Flüsse) — das Modell sagt es dann explizit an.
    const closesCase = target.isEnd || path.some((flow) => flow.closesCaseAttr);
    const key = `${fromLabel} ${toLabel} ${action}`;
    const existing = transitions.get(key);
    if (existing !== undefined) {
      // Zusammenlaufende Pfade mit gleicher Aktion: Vier-Augen ist die ODER-Verknüpfung.
      const merged: CaseTransition = { ...existing };
      if (requiresFourEyes) merged.requiresFourEyes = true;
      if (requiredApprovals >= 2) {
        merged.requiredApprovals = Math.max(
          merged.requiredApprovals ?? 0,
          requiredApprovals,
        );
      }
      if (closesCase) merged.closesCase = true;
      transitions.set(key, merged);
      return;
    }
    transitions.set(key, {
      from: fromLabel,
      to: toLabel,
      action,
      requiredPermission: REQUIRED_PERMISSION,
      ...(requiresFourEyes ? { requiresFourEyes: true } : {}),
      ...(requiredApprovals >= 2 ? { requiredApprovals } : {}),
      ...(closesCase ? { closesCase: true } : {}),
    });
  };

  const walk = (
    fromLabel: string,
    current: FlowNode,
    path: SequenceFlow[],
    visited: Set<SequenceFlow>,
  ): void => {
    const outgoing = flowsBySource.get(current.id);
    if (outgoing === undefined) {
      return;
    }
    for (const flow of outgoing) {
      if (visited.has(flow)) {
        continue; // Zyklus-Schutz bei Gateway→Gateway-Schleifen.
      }
      const target = nodeById.get(flow.targetRef);
      if (target === undefined) {
        continue; // Ziel gehört nicht zum geparsten Subset.
      }
      const nextPath = [...path, flow];
      if (target.type === "gateway") {
        const nextVisited = new Set(visited);
        nextVisited.add(flow);
        walk(fromLabel, target, nextPath, nextVisited);
      } else {
        emit(fromLabel, target, nextPath);
      }
    }
  };

  for (const node of stateNodes) {
    walk(stateLabel(node), node, [], new Set<SequenceFlow>());
  }

  return {
    procedureId: opts.procedureId,
    version: opts.version,
    effectiveFrom: opts.effectiveFrom ?? DEFAULT_EFFECTIVE_FROM,
    legalBasisIds: [...opts.legalBasisIds],
    allowedStates,
    allowedTransitions: [...transitions.values()],
  };
}
