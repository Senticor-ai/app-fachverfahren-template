// lib/benachrichtigungen — die REINE Ableitung von In-App-Benachrichtigungen aus den Workspace-Daten (Aufgaben).
//
// Collaboration-Baustein: statt eines separaten Benachrichtigungs-Backends leitet diese deterministische Funktion die
// relevanten Meldungen aus dem vorhandenen Aufgaben-Bestand ab — „Ihnen zugewiesen" + Fristwarnungen. `now` wird
// INJIZIERT (kein `Date.now()` → testbar, keine Hydration-Diskrepanz). Kein Netz, kein Domänen-Literal. Die App reicht
// das Ergebnis an das generische `NotificationCenter`. In PROD kann dieselbe Naht später eine server-Push-Quelle
// speisen (der Rückgabetyp bleibt gleich).
import type { Aufgabe } from "../types.js";
import type { Benachrichtigung } from "../components/NotificationCenter.js";

export interface WorkspaceBenachrichtigungOpts {
  /** Der (gefilterte) Aufgabenbestand über alle Verfahren. */
  aufgaben: Aufgabe[];
  /** Die angemeldete Sachbearbeiter-Kennung (für „mir zugewiesen"). */
  aktuellerAkteur: string;
  /** „Jetzt" als ISO — injiziert (deterministisch/testbar). */
  nowIso: string;
  /** Vorwarnzeit für Fristen in Stunden (Default 48). */
  fristWarnStunden?: number;
}

const RANG: Record<string, number> = { block: 0, warn: 1, info: 2, ok: 3 };

/**
 * Leitet die In-App-Benachrichtigungen ab: je Aufgabe eine Fristmeldung (überschritten = `block`, bald fällig =
 * `warn`) und — falls mir zugewiesen — eine `info`-Zuweisungsmeldung. Sortiert nach Schweregrad, dann Frist (früheste
 * zuerst). Rein/deterministisch.
 */
export function leiteWorkspaceBenachrichtigungen(
  opts: WorkspaceBenachrichtigungOpts,
): Benachrichtigung[] {
  const now = new Date(opts.nowIso).getTime();
  const warnMs = (opts.fristWarnStunden ?? 48) * 3_600_000;
  const out: Benachrichtigung[] = [];

  for (const a of opts.aufgaben) {
    if (a.faelligIso) {
      const f = new Date(a.faelligIso).getTime();
      if (!Number.isNaN(f) && !Number.isNaN(now)) {
        if (f < now) {
          out.push({
            id: `frist-ueber:${a.id}`,
            titel: `Frist überschritten: ${a.titel}`,
            typ: "block",
            zeitIso: a.faelligIso,
          });
        } else if (f - now <= warnMs) {
          out.push({
            id: `frist-bald:${a.id}`,
            titel: `Frist bald fällig: ${a.titel}`,
            typ: "warn",
            zeitIso: a.faelligIso,
          });
        }
      }
    }
    if (a.zugewiesenAn === opts.aktuellerAkteur) {
      out.push({
        id: `zuweisung:${a.id}`,
        titel: `Ihnen zugewiesen: ${a.titel}`,
        typ: "info",
        ...(a.faelligIso ? { zeitIso: a.faelligIso } : {}),
      });
    }
  }

  return out.sort((x, y) => {
    const r = (RANG[x.typ ?? "info"] ?? 9) - (RANG[y.typ ?? "info"] ?? 9);
    if (r !== 0) return r;
    return (x.zeitIso ?? "").localeCompare(y.zeitIso ?? "");
  });
}
