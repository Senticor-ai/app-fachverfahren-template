// fachverfahren-kit/lib/automation — der REINE Auswerter des dynamischen Regeln/Hooks-Frameworks.
//
// EIN deklaratives Schema (`AutomationRule` in ../types), ZWEI Auswerter: diese reine Funktion (Client-DEV +
// Server-`simulate`/Trockenlauf) und — später — die server-autoritative Automations-Engine, die dieselben
// Effekt-ABSICHTEN durch die Policy-Kette (RBAC + Vier-Augen + append-only Audit) ausführt. Hier entstehen NUR
// die Absichten (wie `interpretTarif` nur die `Berechnung` liefert): kein Effekt, keine Mutation, kein Netz, kein
// `Date.now`/Random/DOM — deterministisch und testbar.
//
// Die Bedingungs-Auswertung nutzt 1:1 `evalBedingung` (interpreter.ts). Damit generische Regeln auch die
// NICHT-Antragsfelder (Status/Priorität/Zuweisung/Fälligkeit) prüfen können, projiziert `bauKontext` sie als
// `$`-präfixierte Schlüssel neben die Antragsdaten — `evalBedingung`/`getPath` behandeln `"$status"` als normalen
// Feldpfad, der Interpreter bleibt UNVERÄNDERT.
import type {
  Aufgabe,
  AutomationAktion,
  AutomationRule,
  AutomationTrigger,
  Vorgang,
} from "../types.js";
import { evalBedingung } from "./interpreter.js";
import type { Antragsdaten } from "./antrag-felder.js";

/** Der Kontext einer Auswertung: die Task/Aufgabe (Metadaten) + optional der fachliche Vorgang (Antragsdaten/Status). */
export interface AutomationKontext<T = Record<string, unknown>> {
  aufgabe: Aufgabe;
  vorgang?: Vorgang<T>;
}

/** Baut die Auswertungs-DATEN: Antragsdaten des Vorgangs + `$`-projizierte Task-/Vorgangs-Metadaten. Rein. */
export function bauKontext<T = Record<string, unknown>>(
  aufgabe: Aufgabe,
  vorgang?: Vorgang<T>,
): Antragsdaten {
  return {
    ...((vorgang?.antragsdaten as Antragsdaten | undefined) ?? {}),
    $status: vorgang?.status,
    $prioritaet: aufgabe.prioritaet,
    $labels: aufgabe.labels ?? [],
    $zugewiesenAn: aufgabe.zugewiesenAn,
    $faelligIso: aufgabe.faelligIso,
    $procedureId: aufgabe.procedureId,
  };
}

/** Passt der Regel-Trigger auf das eingetretene Ereignis? Gleiche `art` ist notwendig; parametrisierte Trigger
 *  matchen zusätzlich ihre gesetzten Filter (fehlt ein Filter an der Regel, ist er unbeschränkt). Rein. */
export function triggerPasst(
  regel: AutomationTrigger,
  ereignis: AutomationTrigger,
): boolean {
  if (regel.art !== ereignis.art) return false;
  switch (regel.art) {
    case "beim-uebergang": {
      const e = ereignis as Extract<
        AutomationTrigger,
        { art: "beim-uebergang" }
      >;
      if (regel.von !== undefined && regel.von !== e.von) return false;
      if (regel.nach !== undefined && regel.nach !== e.nach) return false;
      return true;
    }
    case "frist-erreicht": {
      const e = ereignis as Extract<
        AutomationTrigger,
        { art: "frist-erreicht" }
      >;
      return regel.fristTyp === e.fristTyp;
    }
    case "nachweis-eingegangen": {
      const e = ereignis as Extract<
        AutomationTrigger,
        { art: "nachweis-eingegangen" }
      >;
      return (
        regel.nachweisId === undefined || regel.nachweisId === e.nachweisId
      );
    }
    case "feld-geaendert": {
      const e = ereignis as Extract<
        AutomationTrigger,
        { art: "feld-geaendert" }
      >;
      return regel.feld === e.feld;
    }
    case "manuell": {
      const e = ereignis as Extract<AutomationTrigger, { art: "manuell" }>;
      return regel.label === e.label;
    }
    case "beim-eingang":
    case "zuweisung-geaendert":
      return true;
    default:
      return false;
  }
}

/** Die AKTIONS-Arten, die den ZUSTAND ändern (fachlich oder Task-Metadaten) — sie unterliegen der fail-closed-Regel. */
const MUTIERENDE_AKTIONEN: ReadonlySet<AutomationAktion["art"]> = new Set([
  "setze-feld",
  "setze-prioritaet",
  "zuweisen",
  "label-hinzufuegen",
  "status-uebergang",
  "aufgabe-erstellen",
]);

/** Ändert diese Aktions-Art den Zustand? (Gegenstück: rein anzeigend/vorschlagend — benachrichtigen/ki-vorschlag/audit). */
export function istMutierendeAktion(art: AutomationAktion["art"]): boolean {
  return MUTIERENDE_AKTIONEN.has(art);
}

/** Enthält die Regel mindestens eine zustandsändernde Aktion? */
export function regelIstMutierend(regel: AutomationRule): boolean {
  return regel.dann.some((a) => istMutierendeAktion(a.art));
}

/** Ein Konfigurationsproblem einer Automations-Regel (für die Anzeige/den Trockenlauf vor Aktivierung). */
export interface AutomationProblem {
  regelId: string;
  art: "mutierend-ohne-wenn";
  meldung: string;
}

/** Prüft die Regeln STATISCH (ohne Ereignis/Kontext): eine zustandsändernde Regel OHNE `wenn` ist fail-closed
 *  ungültig — `evalBedingung` ist fail-open (fehlende Bedingung ⇒ immer erfüllt), sodass eine vergessene `wenn`
 *  sonst zur unbeabsichtigten Dauer-Automation würde. Diese Regeln werden von `evalAutomationen` NICHT ausgeführt.
 *  Rein — für ein Gate/`simulate`, das den Kurator warnt, bevor er aktiviert. */
export function pruefeAutomationen(
  regeln: AutomationRule[],
): AutomationProblem[] {
  const out: AutomationProblem[] = [];
  for (const regel of regeln) {
    if (regelIstMutierend(regel) && regel.wenn === undefined) {
      out.push({
        regelId: regel.id,
        art: "mutierend-ohne-wenn",
        meldung: `Regel „${regel.id}" hat zustandsändernde Aktionen, aber keine Bedingung — fail-closed: wird nicht ausgeführt.`,
      });
    }
  }
  return out;
}

/**
 * Wertet die Regeln gegen ein eingetretenes Ereignis + einen Kontext aus und liefert die anzuwendende Effekt-Liste
 * (die ABSICHTEN — kein Effekt, keine Mutation). Filtert: aktiv → Trigger passt → fail-closed (mutierend braucht
 * `wenn`) → Bedingung erfüllt. Rein/deterministisch.
 */
export function evalAutomationen<T = Record<string, unknown>>(
  regeln: AutomationRule[],
  ereignis: AutomationTrigger,
  kontext: AutomationKontext<T>,
): AutomationAktion[] {
  const daten = bauKontext(kontext.aufgabe, kontext.vorgang);
  const out: AutomationAktion[] = [];
  for (const regel of regeln) {
    if (regel.aktiv === false) continue;
    if (!triggerPasst(regel.trigger, ereignis)) continue;
    // FAIL-CLOSED: mutierende Regel ohne Bedingung wird NIE gefeuert (siehe `pruefeAutomationen`).
    if (regelIstMutierend(regel) && regel.wenn === undefined) continue;
    if (!evalBedingung(regel.wenn, daten)) continue;
    out.push(...regel.dann);
  }
  return out;
}
