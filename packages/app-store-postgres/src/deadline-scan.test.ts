// deadline-scan.test — der zeitgetriebene Fristen-Trigger (Issue #58): reine Fälligkeits-Entscheidung +
// idempotenter Scan-Tick über den TaskStore.
import { describe, expect, it } from "vitest";
import { InMemoryTaskStore, type AppTask } from "./task-store.js";
import {
  DEADLINE_OVERDUE,
  DEADLINE_STATUS_KEY,
  findDueDeadlines,
  runDeadlineScan,
} from "./deadline-scan.js";

const uid = () => globalThis.crypto.randomUUID();

function task(over: Partial<AppTask> = {}): AppTask {
  return {
    taskId: `task-${uid()}`,
    caseId: "case-1",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    title: "Termin",
    state: "open",
    assignedTo: null,
    dueAt: null,
    taskKind: "termin",
    parentTaskId: null,
    data: {},
    sortRank: "m",
    version: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const NOW = "2026-07-01T00:00:00.000Z";

describe("findDueDeadlines (reine Entscheidung)", () => {
  it("nur fällige (dueAt<=now), offene, noch nicht markierte Aufgaben", () => {
    const faellig = task({ dueAt: "2026-06-30T00:00:00.000Z" });
    const zukunft = task({ dueAt: "2026-08-01T00:00:00.000Z" });
    const ohneFrist = task({ dueAt: null });
    const erledigt = task({
      dueAt: "2026-06-01T00:00:00.000Z",
      state: "completed",
    });
    const schonMarkiert = task({
      dueAt: "2026-06-01T00:00:00.000Z",
      data: { [DEADLINE_STATUS_KEY]: DEADLINE_OVERDUE },
    });
    const due = findDueDeadlines(
      [faellig, zukunft, ohneFrist, erledigt, schonMarkiert],
      NOW,
    );
    expect(due.map((t) => t.taskId)).toEqual([faellig.taskId]);
  });
});

describe("runDeadlineScan (idempotent, mandanten-scoped)", () => {
  it("markiert fällige Aufgaben überfällig; ein zweiter Lauf markiert nichts mehr", async () => {
    const store = new InMemoryTaskStore();
    const faellig = task({ tenantId: "t1", dueAt: "2026-06-30T00:00:00.000Z" });
    const zukunft = task({ tenantId: "t1", dueAt: "2026-08-01T00:00:00.000Z" });
    const fremd = task({ tenantId: "t2", dueAt: "2026-06-30T00:00:00.000Z" });
    await store.insertTask(faellig);
    await store.insertTask(zukunft);
    await store.insertTask(fremd);

    const first = await runDeadlineScan({
      taskStore: store,
      tenantId: "t1",
      nowIso: NOW,
    });
    expect(first.fired.map((t) => t.taskId)).toEqual([faellig.taskId]);
    expect(first.fired[0]?.data[DEADLINE_STATUS_KEY]).toBe(DEADLINE_OVERDUE);
    // Fremder Mandant unberührt.
    expect(
      (await store.getTask({ tenantId: "t2", taskId: fremd.taskId }))?.data[
        DEADLINE_STATUS_KEY
      ],
    ).toBeUndefined();

    // Idempotenz: zweiter Lauf feuert nichts (Marker filtert die Aufgabe aus).
    const second = await runDeadlineScan({
      taskStore: store,
      tenantId: "t1",
      nowIso: NOW,
    });
    expect(second.fired).toHaveLength(0);
  });
});
