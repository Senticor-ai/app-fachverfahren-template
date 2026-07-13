// process-ir — die Prozess-Definition als DATEN (IR). EINE Wahrheit; BPMN-XML ist (spaeter) nur Import/Export, der
// grafische Editor nur ein Frontend gegen dieses IR. Bewusst BPMN-INSPIRIERT (Activiti als Ideengeber), aber ein
// eigenes, minimal gehaltenes, typisiertes Modell — kein BPMN-Vollstandard.
//
// V1-Subset (diskriminierte Union): start | ende | userTask | serviceTask | exclusiveGateway. Weitere BPMN-Elemente
// sind bewusst TYPISIERT (nicht ignoriert), damit der Graph-Validator sie FAIL-CLOSED ablehnt (harter Reject beim
// Deploy) statt sie still zu droppen — die Strenge liegt im Graph-Gate (process-graph), nicht im Evaluator.
import type { Bedingung } from "../types.js";

/** Alle im IR typisierten Knotentypen — auch die (noch) nicht ausfuehrbaren, damit sie explizit abgelehnt werden. */
export type ProzessKnotenTyp =
  | "start"
  | "ende"
  | "userTask"
  | "serviceTask"
  | "exclusiveGateway"
  // Noch NICHT unterstuetzt (spaetere Roadmap-Phasen) — typisiert fuer fail-closed Reject:
  | "parallelGateway"
  | "timerEvent"
  | "messageEvent"
  | "signalEvent"
  | "boundaryEvent"
  | "subprozess";

interface KnotenBasis {
  id: string;
  label?: string;
}

export interface StartKnoten extends KnotenBasis {
  typ: "start";
}
export interface EndeKnoten extends KnotenBasis {
  typ: "ende";
}
/** Menschlicher Schritt: parkt einen Token und erzeugt eine Aufgabe; bei Abschluss loest er `catalogAction` aus
 *  (eine Status-Transition der Verfahrens-StatusMachine — server-autoritativ durch die Governance-Kette). */
export interface UserTaskKnoten extends KnotenBasis {
  typ: "userTask";
  /** Zustaendige Rollen (candidate roles) — Teilmenge der Rollen der gemappten Transition. */
  rollen: string[];
  /** Ziel-Status der ausgeloesten StatusMachine-Transition (Katalog-Aktion). */
  catalogAction: string;
  /** MUSS bijektiv zur `vierAugen`-Angabe der gemappten Transition sein (Graph-Gate [H4]). */
  vierAugen?: boolean;
}
/** Maschineller Schritt: loest `catalogAction` durch die Governance-Kette (PROCESS_SERVICE_ACTOR) aus. Eine
 *  Vier-Augen-Transition wird als Service-Task HART geblockt (KI/Maschine ist nie eines der zwei Augen). */
export interface ServiceTaskKnoten extends KnotenBasis {
  typ: "serviceTask";
  catalogAction: string;
  vierAugen?: boolean;
}
/** Exklusives Gateway (XOR): genau EIN ausgehender Zweig feuert — der erste erfuellte Guard, sonst der Default-Flow. */
export interface ExclusiveGatewayKnoten extends KnotenBasis {
  typ: "exclusiveGateway";
}
/** Platzhalter fuer (noch) nicht ausfuehrbare BPMN-Elemente — vom Validator fail-closed abgelehnt. */
export interface NichtUnterstuetzterKnoten extends KnotenBasis {
  typ:
    | "parallelGateway"
    | "timerEvent"
    | "messageEvent"
    | "signalEvent"
    | "boundaryEvent"
    | "subprozess";
}

export type ProzessKnoten =
  | StartKnoten
  | EndeKnoten
  | UserTaskKnoten
  | ServiceTaskKnoten
  | ExclusiveGatewayKnoten
  | NichtUnterstuetzterKnoten;

/** Gerichtete Kante (SequenceFlow). `guard`/`default` sind nur an Kanten aus einem ExclusiveGateway sinnvoll. */
export interface ProzessKante {
  id: string;
  von: string;
  nach: string;
  /** Waechter — nur an Nicht-Default-Zweigen eines ExclusiveGateway (dort PFLICHT, Graph-Gate [G2]). */
  guard?: Bedingung;
  /** Markiert den Default-Flow eines ExclusiveGateway (genau EINER je Gateway). */
  default?: boolean;
}

/** Die Prozess-Definition als DATEN. Immer im Kontext EINES Verfahrens (procedure_id NOT NULL in V1) — die
 *  zustandsaendernden Schritte laufen durch die vorhandene case-gebundene Gate-Funktion. */
export interface ProzessDefinition {
  id: string;
  version: number;
  label?: string;
  knoten: ProzessKnoten[];
  kanten: ProzessKante[];
}
