// procedure-contract — projiziert eine `ProcedureVersion` in einen JSON-SAFE, feld-stabilen Vertrags-Snapshot
// (`procedure.contract.json`), den ein externes (governtes) Build-Gate deterministisch prüfen kann, OHNE die
// .ts-Naht zu importieren. Das Dossier-Gegenstück zu `fachverfahren-kit/contract-snapshot` (Antrag-Pfad).
//
// Eine `ProcedureVersion` ist bereits REINE DATEN (keine Funktions-Escape-Hatches wie `berechne`) — die Projektion
// fixiert daher nur die Feld-Ordnung und normalisiert die optionalen Flags zu expliziten Booleans, damit der
// Snapshot byte-stabil ist (ein fehlendes vs. `false`-Flag darf keinen Vertrags-Diff erzeugen).
import type { ProcedureVersion } from "./domain-kernel.js";

export interface ProcedureContractTransition {
  from: string;
  to: string;
  action: string;
  requiredPermission: string;
  requiresFourEyes: boolean;
  closesCase: boolean;
}

export interface ProcedureContractSnapshot {
  procedureId: string;
  version: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legalBasisIds: string[];
  allowedStates: string[];
  allowedTransitions: ProcedureContractTransition[];
}

/** Projiziert das Verfahren (Zustandsmaschine + Rechtsgrundlagen) in den committbaren Vertrags-Snapshot. */
export function toProcedureContractSnapshot(
  procedure: ProcedureVersion,
): ProcedureContractSnapshot {
  return {
    procedureId: procedure.procedureId,
    version: procedure.version,
    effectiveFrom: procedure.effectiveFrom,
    ...(procedure.effectiveTo !== undefined
      ? { effectiveTo: procedure.effectiveTo }
      : {}),
    legalBasisIds: [...procedure.legalBasisIds],
    allowedStates: [...procedure.allowedStates],
    allowedTransitions: procedure.allowedTransitions.map((transition) => ({
      from: transition.from,
      to: transition.to,
      action: transition.action,
      requiredPermission: transition.requiredPermission,
      requiresFourEyes: transition.requiresFourEyes === true,
      closesCase: transition.closesCase === true,
    })),
  };
}
