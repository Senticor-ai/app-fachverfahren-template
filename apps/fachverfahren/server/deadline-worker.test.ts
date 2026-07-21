// deadline-worker.test — der Fristen-Scan-Prozess (Issue #58): env-Mandanten-Parsing + ein Tick über mehrere
// Mandanten gegen den InMemory-TaskStore (der Motor selbst ist in app-store-postgres separat getestet).
import { describe, expect, it } from "vitest";
import { InMemoryTaskStore, type AppTask } from "@senticor/app-store-postgres";
import { runDeadlineWorker, tenantIdsFromEnv } from "./deadline-worker.js";

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
    dueAt: "2026-06-30T00:00:00.000Z",
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

describe("tenantIdsFromEnv", () => {
  it("parst kommagetrennt, trimmt, verwirft Leere; ungesetzt → []", () => {
    expect(
      tenantIdsFromEnv({
        APP_TENANT_IDS: " t1 , t2 ,,t3 ",
      } as NodeJS.ProcessEnv),
    ).toEqual(["t1", "t2", "t3"]);
    expect(tenantIdsFromEnv({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("runDeadlineWorker (ein Tick über mehrere Mandanten)", () => {
  it("markiert fällige Aufgaben je Mandant und bilanziert; Zukunfts-Fristen unberührt", async () => {
    const store = new InMemoryTaskStore();
    await store.insertTask(task({ tenantId: "t1" }));
    await store.insertTask(task({ tenantId: "t1" }));
    await store.insertTask(
      task({ tenantId: "t2", dueAt: "2099-01-01T00:00:00.000Z" }),
    ); // Zukunft → nicht fällig
    await store.insertTask(task({ tenantId: "t2" }));

    const result = await runDeadlineWorker({
      taskStore: store,
      tenantIds: ["t1", "t2"],
      nowIso: "2026-07-01T00:00:00.000Z",
    });
    expect(result.tenants).toBe(2);
    expect(result.fired).toBe(3); // t1: 2, t2: 1 (die Zukunfts-Frist zählt nicht)
    expect(result.perTenant).toEqual([
      { tenantId: "t1", fired: 2 },
      { tenantId: "t2", fired: 1 },
    ]);
  });
});
