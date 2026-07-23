// check:bpmn-example — macht das committete Beispiel-Verfahren zu einem AUSFÜHRBAREN, drift-gesicherten Input
// (ADR-0002: „die BPMN ist die EINE Wahrheit"). Ohne dieses Gate sind docs/examples/integrationsberatung/
// integrationsmanagement.bpmn + .config.yaml totes Dokument — nichts prüft, dass die BPMN tatsächlich die in der
// config.yaml dokumentierte Zustandsmaschine ergibt.
//
// Das Gate leitet mit der ECHTEN Funktion `bpmnToProcedureVersion` aus der committeten BPMN eine ProcedureVersion
// ab und vergleicht sie gegen die in der config.yaml dokumentierte `stateMachine`. Ändert jemand die BPMN, aber
// nicht die config.yaml (oder umgekehrt), driften die beiden — und dieses Gate wird rot. So bleibt das Beispiel
// der verlässliche Blueprint, dem ein Agent für sein eigenes Verfahren folgt (BPMN → ProcedureVersion → Naht).
//
// Läuft ohne Bundler via `node --experimental-strip-types` — direkt auf die .ts-Quelle des Stubs (wie die anderen
// Contract-Gates). `bpmnToProcedureVersion` importiert aus dem SDK NUR Typen → sauber strip-bar.
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { bpmnToProcedureVersion } from "../packages/workflow-bpmn-stub/src/bpmn-to-procedure-version.ts";

const DIR = new URL("../docs/examples/integrationsberatung/", import.meta.url);

interface DocTransition {
  from: string;
  to: string;
  action: string;
  requiresFourEyes?: boolean;
  closesCase?: boolean;
}
interface DocConfig {
  procedure?: {
    procedureId?: string;
    version?: string;
    legalBasisIds?: string[];
  };
  stateMachine?: {
    initial?: string;
    allowedStates?: string[];
    allowedTransitions?: DocTransition[];
  };
}

const fehler: string[] = [];
const fail = (m: string) => fehler.push(m);

const bpmnXml = readFileSync(
  new URL("integrationsmanagement.bpmn", DIR),
  "utf8",
);
const config = parseYaml(
  readFileSync(new URL("integrationsmanagement.config.yaml", DIR), "utf8"),
) as DocConfig;

// fail-closed: die config.yaml muss die verglichenen Felder überhaupt tragen.
const procedureId = config.procedure?.procedureId;
const version = config.procedure?.version;
const legalBasisIds = config.procedure?.legalBasisIds;
const sm = config.stateMachine;
if (procedureId === undefined || version === undefined)
  fail("config.yaml: procedure.procedureId/version fehlt.");
if (!Array.isArray(legalBasisIds) || legalBasisIds.length < 1)
  fail("config.yaml: procedure.legalBasisIds fehlt/leer.");
if (
  !sm ||
  !Array.isArray(sm.allowedStates) ||
  !Array.isArray(sm.allowedTransitions)
)
  fail("config.yaml: stateMachine.allowedStates/allowedTransitions fehlt.");

if (fehler.length === 0 && procedureId && version && legalBasisIds && sm) {
  // Aus der committeten BPMN ableiten — die Rechtsgrundlagen/Version kommen aus der config.yaml (NIE aus der BPMN).
  const derived = bpmnToProcedureVersion(bpmnXml, {
    procedureId,
    version,
    legalBasisIds,
  });

  // Kanonischer Übergangs-Schlüssel (requiredPermission wird bewusst ausgelassen — die config.yaml führt es nicht;
  // es ist die Stub-Konstante). Vier-Augen + Abschluss sind Teil der fachlichen Wahrheit und werden verglichen.
  const key = (t: DocTransition): string =>
    `${t.from} --${t.action}--> ${t.to} [vierAugen=${t.requiresFourEyes === true} schliesst=${t.closesCase === true}]`;

  // 1) allowedStates (mengengleich — Reihenfolge ist in der config.yaml handgepflegt und muss nicht der
  //    Dokumentreihenfolge der BPMN folgen).
  const derivedStates = [...derived.allowedStates].sort();
  const docStates = [...(sm.allowedStates ?? [])].sort();
  if (JSON.stringify(derivedStates) !== JSON.stringify(docStates))
    fail(
      `allowedStates driften — BPMN=[${derived.allowedStates.join(", ")}] ≠ config.yaml=[${(sm.allowedStates ?? []).join(", ")}].`,
    );

  // 2) allowedTransitions (mengengleich, inkl. requiresFourEyes + closesCase).
  const derivedT = new Set(derived.allowedTransitions.map(key));
  const docT = new Set((sm.allowedTransitions ?? []).map(key));
  for (const k of derivedT)
    if (!docT.has(k))
      fail(`Übergang in der BPMN, aber NICHT in config.yaml: ${k}`);
  for (const k of docT)
    if (!derivedT.has(k))
      fail(
        `Übergang in config.yaml, aber NICHT (so) aus der BPMN ableitbar: ${k}`,
      );

  // 3) Der Startzustand (erster abgeleiteter Zustand = das <startEvent>) muss stateMachine.initial sein.
  if (sm.initial !== undefined && derived.allowedStates[0] !== sm.initial)
    fail(
      `stateMachine.initial ("${sm.initial}") ≠ Start-Zustand der BPMN ("${derived.allowedStates[0]}").`,
    );

  if (fehler.length === 0) {
    const schliessende = derived.allowedTransitions.filter(
      (t) => t.closesCase === true,
    ).length;
    console.log(
      `bpmn-example ok — ${procedureId}@${version}: BPMN ⇔ config.yaml deckungsgleich (${derived.allowedStates.length} Zustände · ${derived.allowedTransitions.length} Übergänge · ${schliessende} schließend).`,
    );
  }
}

if (fehler.length > 0) {
  console.error("bpmn-example-Verstöße (BPMN ⇔ config.yaml driften):");
  for (const f of fehler) console.error(`- ${f}`);
  process.exitCode = 1;
}
