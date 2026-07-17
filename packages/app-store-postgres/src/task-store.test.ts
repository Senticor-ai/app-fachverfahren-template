import { beforeAll, describe, expect, it } from "vitest";
import {
  type AppCase,
  type CaseStore,
  InMemoryCaseStore,
  PostgresCaseStore,
} from "./case-store.js";
import {
  type AppTask,
  type TaskStore,
  InMemoryTaskStore,
  PostgresTaskStore,
  TaskNotFoundError,
  TaskVersionConflictError,
} from "./task-store.js";

const uid = () => globalThis.crypto.randomUUID();

function macheCase(over: Partial<AppCase> = {}): AppCase {
  return {
    caseId: `case-${uid()}`,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    procedureId: "integrationsberatung",
    procedureVersion: "1",
    state: "aktiv",
    version: 1,
    subjectIds: [],
    openedAt: "2026-06-01T00:00:00.000Z",
    closedAt: null,
    data: {},
    ownerActorId: null,
    ...over,
  };
}

function macheTask(caseId: string, over: Partial<AppTask> = {}): AppTask {
  return {
    taskId: `task-${uid()}`,
    caseId,
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    title: "Aufgabe",
    state: "open",
    assignedTo: null,
    dueAt: null,
    taskKind: "aufgabe",
    parentTaskId: null,
    data: {},
    sortRank: "m",
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const pgUrl = process.env["APP_PG_DIRECT_URL"] ?? process.env["APP_PG_URL"];
const impls: {
  name: string;
  makeTask: () => TaskStore;
  makeCase: () => CaseStore;
  enabled: boolean;
}[] = [
  {
    name: "InMemory",
    makeTask: () => new InMemoryTaskStore(),
    makeCase: () => new InMemoryCaseStore(),
    enabled: true,
  },
  {
    name: "Postgres",
    makeTask: () => new PostgresTaskStore(pgUrl!),
    makeCase: () => new PostgresCaseStore(pgUrl!),
    enabled: Boolean(pgUrl),
  },
];

for (const impl of impls) {
  describe.skipIf(!impl.enabled)(`TaskStore contract — ${impl.name}`, () => {
    let tasks: TaskStore;
    let cases: CaseStore;
    beforeAll(() => {
      tasks = impl.makeTask();
      cases = impl.makeCase();
    });

    // Legt eine Akte an (FK-Voraussetzung für app_tasks in Postgres) und gibt die caseId zurück.
    async function neueAkte(over: Partial<AppCase> = {}): Promise<string> {
      const c = macheCase(over);
      await cases.insertCase(c);
      return c.caseId;
    }

    it("legt eine Aufgabe an und liest sie zurück (mandanten-scoped)", async () => {
      const caseId = await neueAkte();
      const t = macheTask(caseId, { title: "Sprachkurs anmelden" });
      await tasks.insertTask(t);
      const gelesen = await tasks.getTask({ tenantId: "t1", taskId: t.taskId });
      expect(gelesen?.title).toBe("Sprachkurs anmelden");
      expect(gelesen?.caseId).toBe(caseId);
      expect(
        await tasks.getTask({ tenantId: "fremd", taskId: t.taskId }),
      ).toBeUndefined();
    });

    it("listTasks filtert nach caseId/taskKind/parent; sort_rank ASC", async () => {
      const caseId = await neueAkte();
      const ziel = macheTask(caseId, {
        taskKind: "ziel",
        title: "Wohnen",
        sortRank: "a",
      });
      await tasks.insertTask(ziel);
      await tasks.insertTask(
        macheTask(caseId, {
          taskKind: "ziel",
          title: "Sprache",
          sortRank: "b",
        }),
      );
      await tasks.insertTask(
        macheTask(caseId, {
          taskKind: "checkliste-item",
          parentTaskId: ziel.taskId,
          title: "WBS beantragen",
          sortRank: "a",
        }),
      );
      const ziele = await tasks.listTasks({
        tenantId: "t1",
        caseId,
        taskKind: "ziel",
      });
      expect(ziele.map((t) => t.title)).toEqual(["Wohnen", "Sprache"]);
      const schritte = await tasks.listTasks({
        tenantId: "t1",
        caseId,
        parentTaskId: ziel.taskId,
      });
      expect(schritte.map((t) => t.title)).toEqual(["WBS beantragen"]);
    });

    it("patchTask: Metadaten + data-Merge, Optimistic-Locking + Not-Found", async () => {
      const caseId = await neueAkte();
      const t = macheTask(caseId, {
        taskKind: "ziel",
        data: { kategorie: "Sprache", status: "neu" },
      });
      await tasks.insertTask(t);
      const scope = { tenantId: "t1", taskId: t.taskId };

      const nach = await tasks.patchTask({
        ...scope,
        expectedVersion: 1,
        state: "claimed",
        assignedTo: "sb.mueller",
        dataPatch: { status: "laufend" }, // merge: kategorie bleibt
      });
      expect(nach.state).toBe("claimed");
      expect(nach.assignedTo).toBe("sb.mueller");
      expect(nach.data).toEqual({ kategorie: "Sprache", status: "laufend" });
      expect(nach.version).toBe(2);

      // Veraltete Version → Konflikt.
      await expect(
        tasks.patchTask({ ...scope, expectedVersion: 1, state: "completed" }),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);

      // Unbekannt → NotFound.
      await expect(
        tasks.patchTask({
          tenantId: "t1",
          taskId: "gibt-es-nicht",
          state: "open",
        }),
      ).rejects.toBeInstanceOf(TaskNotFoundError);
    });

    it("aggregateChildFlag: Ziele-Fortschritt (erledigt) compute-on-read — 2 von 3", async () => {
      const caseId = await neueAkte();
      const ziel = macheTask(caseId, {
        taskKind: "ziel",
        title: "Arbeit finden",
      });
      await tasks.insertTask(ziel);
      for (const [i, done] of [true, true, false].entries())
        await tasks.insertTask(
          macheTask(caseId, {
            taskKind: "checkliste-item",
            parentTaskId: ziel.taskId,
            title: `Schritt ${i}`,
            sortRank: String(i),
            data: { erledigt: done },
          }),
        );
      const agg = await tasks.aggregateChildFlag({
        tenantId: "t1",
        parentTaskIds: [ziel.taskId],
        taskKind: "checkliste-item",
        flagKey: "erledigt",
      });
      expect(agg).toEqual([{ parentTaskId: ziel.taskId, total: 3, done: 2 }]);
      // Fortschritt in % rechnet der Aufrufer.
      expect(Math.round((agg[0]!.done / agg[0]!.total) * 100)).toBe(67);
      // Leere Eltern-Liste → leer.
      expect(
        await tasks.aggregateChildFlag({
          tenantId: "t1",
          parentTaskIds: [],
          taskKind: "checkliste-item",
          flagKey: "erledigt",
        }),
      ).toEqual([]);
    });
  });
}
