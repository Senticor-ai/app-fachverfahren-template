// procedure-from-status-machine — die REINE Ableitung einer `ProcedureVersion` (server-autoritative
// Fall-Zustandsmaschine) aus einer ANTRAGS-Zustandsmaschine (leistung.config.statusMachine).
//
// WARUM: Das Template bedient zwei Verfahrens-ARTEN. Die Antrags-Art (leistung.config) ist Client-
// Wahrheit und für den Server nicht importierbar (rootDir-Mauer: server/ vs. src/). Damit ein Antrag
// zur server-persistierten Akte werden kann, braucht der Server dieselbe Zustandsmaschine als
// `ProcedureVersion`. Diese reine Funktion leitet sie ab — verlustfrei und deterministisch, ohne den
// React-UI-Kit (fachverfahren-kit) in den Server-Build zu ziehen: sie nimmt eine STRUKTURELLE Quelle,
// nicht den `LeistungConfig`-Typ.
//
// Präzedenz: `bpmnToProcedureVersion` (workflow-bpmn-stub) leitet dieselbe Zielform aus BPMN ab. Beide
// speisen dieselben Gates (check:procedure-contract-Struktur). Ein Drift-Gate (check:antrag-procedure)
// verifiziert, dass die server-seitige Deklaration mit der Ableitung aus leistung.config übereinstimmt.
import type {
  CaseTransition,
  ProcedureVersion,
  VerwaltungsaktConfig,
} from "./domain-kernel.js";
import type { Bedingung } from "./rules.js";

/** Ein Zustand der Antrags-Maschine (nur die für die Ableitung nötigen Felder). */
export interface StatusMachineStateSource {
  key: string;
  /** Endzustand? Ein Übergang IN einen Endzustand schließt den Fall (closesCase). */
  terminal?: boolean;
}

/** Ein Übergang der Antrags-Maschine (nur die für die Ableitung nötigen Felder). */
export interface StatusMachineTransitionSource {
  from: string;
  to: string;
  /** Sprechendes Label — die Quelle der stabilen `action` (slugifiziert). */
  label: string;
  /** Vier-Augen-pflichtig? → requiresFourEyes. */
  vierAugen?: boolean;
  /** Erlässt dieser Übergang einen förmlichen Verwaltungsakt? → issuesVerwaltungsakt. */
  erlaesstBescheid?: boolean;
  /** Data-driven Guard (Bedingung über case.data) → CaseTransition.guard. */
  guard?: Bedingung;
}

/** Die strukturelle Quelle der Ableitung — bewusst NICHT der Kit-`LeistungConfig`-Typ (kein UI-Dep). */
export interface StatusMachineSource {
  procedureId: string;
  version: string;
  effectiveFrom: string;
  legalBasisIds: readonly string[];
  states: readonly StatusMachineStateSource[];
  transitions: readonly StatusMachineTransitionSource[];
  /** Die für JEDEN Übergang nötige Permission. Antrags-Übergänge sind Sachbearbeitungs-Entscheidungen. */
  requiredPermission: string;
  /** Verwaltungsakt-Fachlichkeit (Rechtsbehelf + Bekanntgabe) — vorhanden, wenn das Verfahren einen
   *  Bescheid erlässt. Wird 1:1 an ProcedureVersion.verwaltungsakt durchgereicht. */
  verwaltungsakt?: VerwaltungsaktConfig;
}

/** Deterministischer, ASCII-sicherer Slug eines Labels → stabile `action`. Umlaute werden transliteriert,
 *  alles Nicht-Alphanumerische zu „-", Ränder/Dopplungen bereinigt. Rein (kein Locale/Zufall). */
export function slugifyAction(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Leitet die `ProcedureVersion` ab. Wirft, wenn zwei Übergänge desselben Ausgangszustands auf dieselbe
 * `action` fielen — `transitionCase` löst per `find((from, action))` auf, ein Duplikat wäre mehrdeutig
 * (dieselbe Invariante, die check:procedure-contract prüft). Der Fehler zwingt zu eindeutigen Labels.
 */
export function statusMachineToProcedureVersion(
  src: StatusMachineSource,
): ProcedureVersion {
  const terminals = new Set(
    src.states.filter((s) => s.terminal).map((s) => s.key),
  );
  const gesehen = new Set<string>();
  const allowedTransitions: CaseTransition[] = src.transitions.map((t) => {
    const action = slugifyAction(t.label);
    const schluessel = `${t.from}::${action}`;
    if (gesehen.has(schluessel))
      throw new Error(
        `statusMachineToProcedureVersion: mehrdeutige (from, action) „${schluessel}" — Labels müssen je Ausgangszustand eindeutig sein`,
      );
    gesehen.add(schluessel);
    return {
      from: t.from,
      to: t.to,
      action,
      requiredPermission: src.requiredPermission,
      // Optionale Flags NUR setzen, wenn zutreffend (exactOptionalPropertyTypes; und damit fehlend==false
      // nicht zu einem Vertrags-Diff wird — konsistent zu toProcedureContractSnapshot).
      ...(t.vierAugen ? { requiresFourEyes: true } : {}),
      // Ein Übergang IN einen Endzustand schließt den Fall — data-driven, kein hart kodierter Zustandsname.
      ...(terminals.has(t.to) ? { closesCase: true } : {}),
      // Erlässt dieser Übergang einen Verwaltungsakt? → der Server friert beim Übergang den Bescheid ein.
      ...(t.erlaesstBescheid ? { issuesVerwaltungsakt: true } : {}),
      // Data-driven Guard (Bedingung über case.data) — der Server lässt den Übergang nur bei Erfüllung zu.
      ...(t.guard ? { guard: t.guard } : {}),
    };
  });
  return {
    procedureId: src.procedureId,
    version: src.version,
    effectiveFrom: src.effectiveFrom,
    legalBasisIds: [...src.legalBasisIds],
    allowedStates: src.states.map((s) => s.key),
    allowedTransitions,
    // Verwaltungsakt-Fachlichkeit durchreichen, wenn deklariert.
    ...(src.verwaltungsakt ? { verwaltungsakt: src.verwaltungsakt } : {}),
  };
}
