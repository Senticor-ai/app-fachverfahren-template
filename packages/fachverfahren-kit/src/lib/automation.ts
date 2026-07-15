import type {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
} from "../types.js";
import { evalBedingung } from "./interpreter.js";

export interface AutomationContext {
  daten: Record<string, unknown>;
  metadaten?: {
    status?: string;
    prioritaet?: string;
    labels?: string[];
    zugewiesenAn?: string;
    faelligIso?: string;
    procedureId?: string;
  };
}

export interface AutomationIntention {
  regelId: string;
  aktionen: AutomationAction[];
}

export interface AutomationValidationIssue {
  regelId: string;
  code: "duplicate-id" | "empty-actions" | "unguarded-mutation";
  message: string;
}

const MUTATING_ACTIONS = new Set<AutomationAction["art"]>([
  "setze-feld",
  "setze-prioritaet",
  "zuweisen",
  "label-hinzufuegen",
  "status-uebergang",
  "aufgabe-erstellen",
]);

/** Prüft strukturelle Sicherheitsgrenzen, ohne eine Laufzeit oder Seiteneffekte vorzutäuschen. */
export function pruefeAutomationsregeln(
  regeln: readonly AutomationRule[],
): AutomationValidationIssue[] {
  const issues: AutomationValidationIssue[] = [];
  const ids = new Set<string>();

  for (const regel of regeln) {
    if (ids.has(regel.id)) {
      issues.push({
        regelId: regel.id,
        code: "duplicate-id",
        message: `Die Regel-ID "${regel.id}" ist nicht eindeutig.`,
      });
    }
    ids.add(regel.id);

    if (regel.dann.length === 0) {
      issues.push({
        regelId: regel.id,
        code: "empty-actions",
        message: "Die Regel enthält keine Aktions-Intention.",
      });
    }

    if (
      !regel.wenn &&
      regel.dann.some((aktion) => MUTATING_ACTIONS.has(aktion.art))
    ) {
      issues.push({
        regelId: regel.id,
        code: "unguarded-mutation",
        message:
          "Zustandsändernde Aktions-Intentionen benötigen eine explizite wenn-Bedingung.",
      });
    }
  }

  return issues;
}

/** Vergleicht einen konkreten Laufzeit-Auslöser mit dem deklarativen Filter einer Regel. */
export function automationTriggerPasst(
  erwartet: AutomationTrigger,
  eingetreten: AutomationTrigger,
): boolean {
  if (erwartet.art !== eingetreten.art) return false;

  switch (erwartet.art) {
    case "beim-eingang":
      return true;
    case "beim-uebergang":
      return (
        eingetreten.art === "beim-uebergang" &&
        (!erwartet.von || erwartet.von === eingetreten.von) &&
        (!erwartet.nach || erwartet.nach === eingetreten.nach)
      );
    case "frist-erreicht":
      return (
        eingetreten.art === "frist-erreicht" &&
        erwartet.fristTyp === eingetreten.fristTyp
      );
    case "nachweis-eingegangen":
      return (
        eingetreten.art === "nachweis-eingegangen" &&
        (!erwartet.nachweisId || erwartet.nachweisId === eingetreten.nachweisId)
      );
    case "feld-geaendert":
      return (
        eingetreten.art === "feld-geaendert" &&
        erwartet.feld === eingetreten.feld
      );
    case "manuell":
      return (
        eingetreten.art === "manuell" && erwartet.label === eingetreten.label
      );
  }
}

/**
 * Wertet gültige Regeln rein aus und gibt nur Aktions-Intentionen zurück.
 * Der Aufrufer bleibt für Autorisierung, Persistenz, Audit und idempotente Ausführung verantwortlich.
 */
export function evalAutomationsregeln(
  regeln: readonly AutomationRule[],
  trigger: AutomationTrigger,
  kontext: AutomationContext,
): AutomationIntention[] {
  const ungueltigeIds = new Set(
    pruefeAutomationsregeln(regeln).map((issue) => issue.regelId),
  );
  const daten = {
    ...kontext.daten,
    $meta: kontext.metadaten ?? {},
  };

  return regeln.flatMap((regel) => {
    if (
      regel.aktiv === false ||
      ungueltigeIds.has(regel.id) ||
      !automationTriggerPasst(regel.trigger, trigger) ||
      !evalBedingung(regel.wenn, daten)
    ) {
      return [];
    }

    return [{ regelId: regel.id, aktionen: [...regel.dann] }];
  });
}
