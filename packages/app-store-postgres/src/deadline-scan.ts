// deadline-scan — zeitgetriebene FRISTEN-Trigger (Issue #58). Bisher hatten Fristen/Termine keinen Prozess-Ort:
// nichts erkannte fällige `dueAt` und stieß eine Folgeaktion an. Hier ist der Kern:
//   • REINE Entscheidung `findDueDeadlines(tasks, nowIso)` — injizierte Zeit → deterministisch + testbar.
//   • Idempotenter Tick `runDeadlineScan({taskStore, tenantId, nowIso})` — markiert fällige, offene Aufgaben
//     als ÜBERFÄLLIG (dataPatch + Optimistic-Locking). Der Marker verhindert Doppel-Trigger; ein zweiter Lauf
//     ohne neue Fälligkeiten markiert nichts.
// Der WORKER-Prozess (Scheduler/CronJob, der diesen Tick je Mandant fährt) ist die Deploy-Schicht darüber;
// dieser Kern ist der deterministische, testbare Motor. Mandanten-scoped überall.
import {
  TaskVersionConflictError,
  type AppTask,
  type TaskStore,
} from "./task-store.js";

/** Daten-Marker auf der Aufgabe, sobald ihre Frist überschritten ist — idempotent (verhindert Doppel-Trigger). */
export const DEADLINE_STATUS_KEY = "fristStatus";
export const DEADLINE_OVERDUE = "ueberfaellig";
export const DEADLINE_SINCE_KEY = "ueberfaelligSeit";

/** REINE Entscheidung: welche Aufgaben sind FÄLLIG (`dueAt <= now`), noch offen/claimed und noch NICHT als
 *  überfällig markiert? Injizierte Zeit statt `Date.now()` → deterministisch + unit-testbar. */
export function findDueDeadlines(
  tasks: readonly AppTask[],
  nowIso: string,
): AppTask[] {
  return tasks.filter(
    (task) =>
      task.dueAt !== null &&
      task.dueAt <= nowIso &&
      (task.state === "open" || task.state === "claimed") &&
      task.data[DEADLINE_STATUS_KEY] !== DEADLINE_OVERDUE,
  );
}

/** Idempotenter Scan-Tick für EINEN Mandanten: markiert alle fälligen Aufgaben als überfällig (dataPatch,
 *  Optimistic-Locking über die aktuelle Version). Gibt die NEU markierten Aufgaben zurück. Bei einem
 *  nebenläufigen Scanner gewinnt einer den Version-CAS; der andere überspringt die Aufgabe (Version-Konflikt)
 *  — das ist das Idempotenz-/Nebenläufigkeits-Sicherheitsnetz (Analogon zu `FOR UPDATE SKIP LOCKED`). */
export async function runDeadlineScan(input: {
  taskStore: TaskStore;
  tenantId: string;
  nowIso: string;
}): Promise<{ fired: AppTask[] }> {
  const all = await input.taskStore.listTasks({ tenantId: input.tenantId });
  const due = findDueDeadlines(all, input.nowIso);
  const fired: AppTask[] = [];
  for (const task of due) {
    try {
      const patched = await input.taskStore.patchTask({
        tenantId: input.tenantId,
        taskId: task.taskId,
        expectedVersion: task.version,
        dataPatch: {
          [DEADLINE_STATUS_KEY]: DEADLINE_OVERDUE,
          [DEADLINE_SINCE_KEY]: input.nowIso,
        },
      });
      fired.push(patched);
    } catch (error) {
      // Nebenläufiger Scanner hat die Aufgabe bereits verändert → überspringen (kein Doppel-Trigger).
      if (error instanceof TaskVersionConflictError) continue;
      throw error;
    }
  }
  return { fired };
}

/** Fährt den Tick über mehrere Mandanten (der Worker-Prozess liefert die Mandanten-Liste). Mandanten sind
 *  isoliert: ein Fehler bei einem bricht die anderen nicht ab (Bilanz je Mandant). */
export async function runDeadlineScanForTenants(input: {
  taskStore: TaskStore;
  tenantIds: readonly string[];
  nowIso: string;
}): Promise<{ tenantId: string; fired: number }[]> {
  const results: { tenantId: string; fired: number }[] = [];
  for (const tenantId of input.tenantIds) {
    const { fired } = await runDeadlineScan({
      taskStore: input.taskStore,
      tenantId,
      nowIso: input.nowIso,
    });
    results.push({ tenantId, fired: fired.length });
  }
  return results;
}
