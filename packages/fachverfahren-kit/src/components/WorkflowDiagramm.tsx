// fachverfahren-kit/components/WorkflowDiagramm — visualisiert eine `StatusMachine` als Ablaufdiagramm.
//
// Keine handgepflegte Zweitquelle: das Diagramm ist eine SICHT auf denselben Vertrag, den auch Arbeitsvorrat /
// EntscheidungPanel / StatusPill konsumieren. Die reine `statusMachineZuMermaid` (lib/status-mermaid) projiziert die
// Maschine in Mermaid-Quelltext; die BESTEHENDE `MermaidView` rendert ihn robust (parse-first, ELK→dagre-Fallback,
// sanitisiert, Vollbild-Zoom, barrierefreier Fehler-/Lade-Zustand). GENERISCH & vendor-neutral — Beschriftungen
// kommen aus der Config. Rein präsentierend: kein Netz, kein Domänen-Literal.
import { useMemo } from "react";

import type { StatusMachine } from "../types.js";
import {
  statusMachineZuMermaid,
  type StatusMermaidOptions,
} from "../lib/status-mermaid.js";
import { MermaidView } from "./MermaidView.js";

export interface WorkflowDiagrammProps {
  /** Die zu visualisierende Zustands-Maschine (aus `config.statusMachine`). */
  statusMachine: StatusMachine;
  /** Layout-Richtung des Diagramms. Default: „TB" (oben→unten). */
  richtung?: StatusMermaidOptions["richtung"];
  /** Rollen an die Kanten-Beschriftung hängen. Default: true. */
  zeigeRollen?: boolean;
  /** Vier-Augen-/Begründungs-Marker an die Kanten hängen. Default: true. */
  zeigeMarker?: boolean;
}

/**
 * Rendert die `StatusMachine` als Mermaid-`stateDiagram-v2`. Der Quelltext wird memoisiert, damit ein Neu-Rendern
 * des Elternelements (z. B. Live-Polls) das Diagramm nicht flackern lässt — `MermaidView` ist zusätzlich auf `code`
 * memoisiert.
 */
export function WorkflowDiagramm({
  statusMachine,
  richtung = "TB",
  zeigeRollen = true,
  zeigeMarker = true,
}: WorkflowDiagrammProps) {
  const code = useMemo(
    () =>
      statusMachineZuMermaid(statusMachine, {
        richtung,
        zeigeRollen,
        zeigeMarker,
      }),
    [statusMachine, richtung, zeigeRollen, zeigeMarker],
  );

  return (
    <MermaidView
      code={code}
      errorTitle="Ablaufdiagramm konnte nicht dargestellt werden"
      loadingLabel="Ablaufdiagramm wird dargestellt …"
    />
  );
}
