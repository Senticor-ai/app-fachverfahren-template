// case-akte-view — die PURE Abbildung der Fall/Task-API-Daten (CaseSummary + CaseTask[] +
// Fortschritt) auf die props-getriebene `DossierAkte360`-Sicht. Bewusst OHNE React/`fetch`:
// die Netz-Naht liegt im case-client, das Rendering im Kit — hier steckt nur die (testbare)
// Transformation. Verfahrens-agnostisch: keine Fach-Literale, nur generische Dossier-Chrome.
import type {
  CaseSummary,
  CaseTask,
  CaseZielFortschritt,
} from "../case-client.js";
import type {
  DescriptionListItem,
  DossierAkte360Props,
  DossierMerkmal,
  DossierTermin,
  DossierZiel,
  DossierZielSchritt,
} from "@senticor/fachverfahren-kit";

const TASK_KIND_ZIEL = "ziel";
const TASK_KIND_SCHRITT = "checkliste-item";
const TASK_KIND_TERMIN = "termin";

/** ISO-Zeitstempel als lokalisiertes Datum; nicht parsebare Werte bleiben unverändert. */
export function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("de-DE", { dateStyle: "medium" });
}

/** Ein `Date` (maschinenlesbar + lokalisiert im Kit) bei parsebarem ISO, sonst der Rohstring. */
function asZeit(iso: string): string | Date {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed;
}

/** Stabile Reihenfolge über den (server-vergebenen) `sortRank`, Gleichstand über die taskId. */
function bySortRank(a: CaseTask, b: CaseTask): number {
  const rank = a.sortRank.localeCompare(b.sortRank);
  return rank !== 0 ? rank : a.taskId.localeCompare(b.taskId);
}

/** Ein Schritt gilt als erledigt, wenn `data.erledigt === true` — dieselbe Fahne, aus der der
 *  Server den Fortschritt aggregiert (kein zweiter, abweichender Wahrheitswert). */
function schrittErledigt(task: CaseTask): boolean {
  return task.data["erledigt"] === true;
}

/** Ziel-Tasks + ihre Checklisten-Schritte + der server-gerechnete Fortschritt → `DossierZiel[]`. */
function toZiele(
  tasks: readonly CaseTask[],
  progress: readonly CaseZielFortschritt[],
): DossierZiel[] {
  const percentByZiel = new Map(progress.map((p) => [p.taskId, p.percent]));
  const schritteByZiel = new Map<string, CaseTask[]>();
  for (const task of tasks) {
    if (task.taskKind !== TASK_KIND_SCHRITT || task.parentTaskId === null)
      continue;
    const bucket = schritteByZiel.get(task.parentTaskId) ?? [];
    bucket.push(task);
    schritteByZiel.set(task.parentTaskId, bucket);
  }

  return tasks
    .filter((task) => task.taskKind === TASK_KIND_ZIEL)
    .sort(bySortRank)
    .map((ziel): DossierZiel => {
      const schritte: DossierZielSchritt[] = (
        schritteByZiel.get(ziel.taskId) ?? []
      )
        .sort(bySortRank)
        .map((schritt) => ({
          id: schritt.taskId,
          label: schritt.title,
          ...(schrittErledigt(schritt) ? { erledigt: true } : {}),
        }));
      const percent = percentByZiel.get(ziel.taskId);
      return {
        id: ziel.taskId,
        titel: ziel.title,
        ...(ziel.dueAt !== null ? { frist: formatDate(ziel.dueAt) } : {}),
        ...(percent !== undefined ? { fortschrittProzent: percent } : {}),
        ...(schritte.length > 0 ? { schritte } : {}),
      };
    });
}

/** Termin-Tasks → `DossierTermin[]` (Fälligkeit lokalisiert). */
function toTermine(tasks: readonly CaseTask[]): DossierTermin[] {
  return tasks
    .filter((task) => task.taskKind === TASK_KIND_TERMIN)
    .sort(bySortRank)
    .map((task): DossierTermin => {
      const zuweisung = task.assignedTo;
      return {
        id: task.taskId,
        titel: task.title,
        ...(task.dueAt !== null ? { zeit: asZeit(task.dueAt) } : {}),
        ...(zuweisung !== null
          ? { beschreibung: `Zuständig: ${zuweisung}` }
          : {}),
      };
    });
}

/** Stammdaten-Zeilen aus der Fall-Zusammenfassung (leere Werte blendet die DescriptionList aus). */
function toStammdaten(caseSummary: CaseSummary): DescriptionListItem[] {
  return [
    { label: "Verfahren", value: caseSummary.procedureId },
    { label: "Verfahrensstand", value: caseSummary.procedureVersion },
    { label: "Zustand", value: caseSummary.state },
    { label: "Eröffnet am", value: formatDate(caseSummary.openedAt) },
    {
      label: "Geschlossen am",
      value:
        caseSummary.closedAt !== null ? formatDate(caseSummary.closedAt) : null,
    },
    {
      label: "Beteiligte",
      value:
        caseSummary.subjectIds.length > 0
          ? caseSummary.subjectIds.join(", ")
          : null,
    },
  ];
}

/**
 * Fall/Task-API-Daten → `DossierAkte360`-Props (reine Daten; kopfAktion/notizen/verlauf bleiben
 * dieser generischen Sicht bewusst leer — es gibt dafür keine Frontend-Naht in dieser Phase).
 */
export function toAkteProps(
  caseSummary: CaseSummary,
  tasks: readonly CaseTask[],
  progress: readonly CaseZielFortschritt[],
): DossierAkte360Props {
  const merkmale: DossierMerkmal[] = [
    { label: "Zustand", value: caseSummary.state, tone: "info" },
    { label: "Verfahren", value: caseSummary.procedureId },
  ];
  return {
    titel: caseSummary.subjectIds[0] ?? caseSummary.caseId,
    untertitel: caseSummary.caseId,
    merkmale,
    stammdaten: toStammdaten(caseSummary),
    ziele: toZiele(tasks, progress),
    termine: toTermine(tasks),
  };
}
