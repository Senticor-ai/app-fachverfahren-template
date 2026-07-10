// fachverfahren-kit/lib/automation-run — die AUSFÜHRENDE Hälfte des Regeln/Hooks-Frameworks (DEV-Spiegel).
//
// `evalAutomationen` (rein) liefert die Effekt-ABSICHTEN; dieser Applier wendet sie über den `WorkspacePort` an —
// mit den SICHERHEITS-Invarianten, die die Kritik verlangt:
//  • Ein `status-uebergang`-Effekt auf eine VIER-AUGEN-Transition wird NIE autonom ausgeführt → er wird BLOCKIERT
//    (in PROD entsteht stattdessen eine menschliche Review-Aufgabe). KI/Automation ist nie eines der zwei Augen.
//  • Metadaten-Effekte (Priorität/Zuweisung/Label) tragen kein Gate und werden direkt angewendet.
//  • Jeder Effekt wird als SERVICE-Akteur ausgeführt (nachvollziehbar, getrennt von menschlichen Akteuren).
// In PROD läuft dieselbe Effektliste server-autoritativ durch dieselbe Policy-Kette + Outbox/Idempotenz.
import type { AutomationAktion, Aufgabe, WorkspacePort } from "../types.js";
import { findeUebergang } from "./status-machine.js";

export type EffektStatus =
  | "angewendet"
  | "blockiert"
  | "fehler"
  | "nicht-unterstuetzt";

export interface AutomationEffektErgebnis {
  aktion: AutomationAktion;
  status: EffektStatus;
  detail?: string;
}

export interface AutomationRunOptions {
  /** Pseudonyme Kennung des ausführenden SERVICE (z. B. „automation.service") — nie ein menschlicher Akteur. */
  akteur: string;
  /** Rolle, unter der fachliche Übergänge versucht werden (Default „sachbearbeitung"). */
  rolle?: string;
}

/**
 * Wendet eine Effektliste (aus `evalAutomationen`) auf EINE Aufgabe über den `WorkspacePort` an und liefert ein
 * Protokoll je Effekt. Sicherheits-kritisch: Vier-Augen-Übergänge werden blockiert, nicht ausgeführt. Rein
 * bezüglich der Entscheidung „was ist erlaubt" (die Mutationen laufen über den Port).
 */
export function wendeAutomationEffekteAn<T = Record<string, unknown>>(
  port: WorkspacePort<T>,
  aufgabe: Aufgabe,
  effekte: AutomationAktion[],
  opts: AutomationRunOptions,
): AutomationEffektErgebnis[] {
  const rolle = opts.rolle ?? "sachbearbeitung";
  const ergebnisse: AutomationEffektErgebnis[] = [];

  for (const aktion of effekte) {
    ergebnisse.push(wendeEffektAn(port, aufgabe, aktion, opts.akteur, rolle));
  }
  return ergebnisse;
}

function wendeEffektAn<T>(
  port: WorkspacePort<T>,
  aufgabe: Aufgabe,
  aktion: AutomationAktion,
  akteur: string,
  rolle: string,
): AutomationEffektErgebnis {
  try {
    switch (aktion.art) {
      case "setze-prioritaet":
        port.setPrioritaet(aufgabe.id, aktion.wert, akteur);
        return { aktion, status: "angewendet" };

      case "zuweisen": {
        if (typeof aktion.an !== "string") {
          // {rolle}-Zuweisung braucht eine Zuständigkeits-Auflösung (RBAC) — in PROD server-seitig, im DEV nicht.
          return {
            aktion,
            status: "nicht-unterstuetzt",
            detail:
              "Rollen-basierte Zuweisung erfordert Zuständigkeits-Auflösung (PROD).",
          };
        }
        port.assign(aufgabe.id, aktion.an, akteur);
        return { aktion, status: "angewendet" };
      }

      case "label-hinzufuegen":
        port.addLabel(aufgabe.id, aktion.label, akteur);
        return { aktion, status: "angewendet" };

      case "status-uebergang":
        return wendeUebergangAn(port, aufgabe, aktion, akteur, rolle);

      // Rein anzeigende/vorschlagende Effekte — kein Zustandswechsel; in PROD an einen Kanal/Assistenten gebunden.
      case "benachrichtigen":
      case "ki-vorschlag":
      case "audit":
        return {
          aktion,
          status: "angewendet",
          detail: "vorgemerkt (kein Zustandswechsel)",
        };

      // Zustandsändernde Effekte ohne DEV-Port-Unterstützung.
      case "setze-feld":
      case "aufgabe-erstellen":
        return {
          aktion,
          status: "nicht-unterstuetzt",
          detail:
            "im DEV-Store nicht unterstützt (server-autoritativ in PROD).",
        };

      default:
        return { aktion, status: "nicht-unterstuetzt" };
    }
  } catch (error) {
    return {
      aktion,
      status: "fehler",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function wendeUebergangAn<T>(
  port: WorkspacePort<T>,
  aufgabe: Aufgabe,
  aktion: Extract<AutomationAktion, { art: "status-uebergang" }>,
  akteur: string,
  rolle: string,
): AutomationEffektErgebnis {
  const config = port.configFor(aufgabe.procedureId);
  const vorgang = aufgabe.vorgangId
    ? port.portFor(aufgabe.procedureId)?.get(aufgabe.vorgangId)
    : undefined;
  const von = vorgang?.status;
  const transition =
    von !== undefined
      ? findeUebergang(config?.statusMachine, von, aktion.nach)
      : undefined;
  if (!transition)
    return {
      aktion,
      status: "fehler",
      detail: `kein erlaubter Übergang von „${von ?? "?"}" nach „${aktion.nach}"`,
    };
  // SICHERHEIT: Vier-Augen darf NIE von der Automation autonom ausgelöst werden — nur eine menschliche Vorlage.
  if (transition.vierAugen)
    return {
      aktion,
      status: "blockiert",
      detail: `„${transition.label}" ist vier-augen-pflichtig — Automation legt vor, ein Mensch entscheidet.`,
    };
  port.taskUebergang(aufgabe.id, aktion.nach, rolle, aktion.detail, akteur);
  return { aktion, status: "angewendet" };
}
