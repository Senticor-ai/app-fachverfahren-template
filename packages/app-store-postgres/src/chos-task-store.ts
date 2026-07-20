// chos-task-store — der TaskStore-Adapter auf den chos-Graph-Store. Aufgaben/Ziele/Schritte/Termine (ADR-0003)
// liegen als versionierte chos-Entities; `patchTask` ist Optimistic-Locking-CAS OHNE Ereignis (reiner
// Metadaten-/`data`-Merge, kein Audit) und `aggregateChildFlag` ist compute-on-read über die Kinder. Semantik
// in Parität zu InMemory/Postgres (Sortierung sortRank→createdAt, flacher data-Merge, updatedAt bleibt beim
// Patch unverändert wie im InMemory-Pfad). Gewählt via APP_STORE_MODE=chos; Postgres bleibt der OSS-Default.

import {
  ChosConflictError,
  ChosEntityNotFoundError,
  type ChosClient,
} from "./chos-client.js";
import {
  applyTaskPatch,
  TaskNotFoundError,
  TaskVersionConflictError,
  type AppTask,
  type ChildFlagAggregate,
  type ListTasksQuery,
  type TaskPatch,
  type TaskState,
  type TaskStore,
} from "./task-store.js";

const TASK_COLLECTION = "app_tasks";

function taskToBody(t: AppTask): Record<string, unknown> {
  return { ...t, data: { ...t.data } };
}

function bodyToTask(body: Record<string, unknown>): AppTask {
  return {
    taskId: String(body["taskId"]),
    caseId: String(body["caseId"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    title: String(body["title"]),
    state: String(body["state"]) as TaskState,
    assignedTo:
      body["assignedTo"] === null || body["assignedTo"] === undefined
        ? null
        : String(body["assignedTo"]),
    dueAt:
      body["dueAt"] === null || body["dueAt"] === undefined
        ? null
        : String(body["dueAt"]),
    taskKind: String(body["taskKind"]),
    parentTaskId:
      body["parentTaskId"] === null || body["parentTaskId"] === undefined
        ? null
        : String(body["parentTaskId"]),
    data:
      body["data"] && typeof body["data"] === "object"
        ? (body["data"] as Record<string, unknown>)
        : {},
    sortRank: String(body["sortRank"]),
    version: Number(body["version"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

export class ChosTaskStore implements TaskStore {
  constructor(private readonly client: ChosClient) {}

  async insertTask(input: AppTask): Promise<AppTask> {
    const stored = await this.client.putEntity({
      collection: TASK_COLLECTION,
      tenantId: input.tenantId,
      id: input.taskId,
      version: input.version,
      body: taskToBody(input),
    });
    return bodyToTask(stored.body);
  }

  async getTask(input: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTask | undefined> {
    const found = await this.client.getEntity({
      collection: TASK_COLLECTION,
      tenantId: input.tenantId,
      id: input.taskId,
    });
    return found ? bodyToTask(found.body) : undefined;
  }

  async listTasks(query: ListTasksQuery): Promise<AppTask[]> {
    const all = await this.client.listEntities({
      collection: TASK_COLLECTION,
      tenantId: query.tenantId,
    });
    return all
      .map((e) => bodyToTask(e.body))
      .filter(
        (t) =>
          (query.caseId === undefined || t.caseId === query.caseId) &&
          (query.taskKind === undefined || t.taskKind === query.taskKind) &&
          (query.parentTaskId === undefined ||
            t.parentTaskId === query.parentTaskId) &&
          (query.assignedTo === undefined || t.assignedTo === query.assignedTo),
      )
      .sort(
        (a, b) =>
          (a.sortRank < b.sortRank ? -1 : a.sortRank > b.sortRank ? 1 : 0) ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .slice(0, query.limit ?? 500);
  }

  async patchTask(patch: TaskPatch): Promise<AppTask> {
    const current = await this.client.getEntity({
      collection: TASK_COLLECTION,
      tenantId: patch.tenantId,
      id: patch.taskId,
    });
    if (!current) throw new TaskNotFoundError(patch.taskId);
    const found = bodyToTask(current.body);
    if (
      patch.expectedVersion !== undefined &&
      found.version !== patch.expectedVersion
    )
      throw new TaskVersionConflictError(
        patch.taskId,
        patch.expectedVersion,
        found.version,
      );
    const next: AppTask = {
      ...applyTaskPatch(found, patch),
      version: found.version + 1,
    };
    try {
      // Mit `expectedVersion` → CAS (Konflikt bei nebenläufiger Änderung). Ohne → unbedingter Upsert
      // (last-write-wins, Parität zum lock-freien InMemory-Pfad).
      const updated =
        patch.expectedVersion !== undefined
          ? await this.client.mutateEntity({
              collection: TASK_COLLECTION,
              tenantId: patch.tenantId,
              id: patch.taskId,
              expectedVersion: patch.expectedVersion,
              nextBody: taskToBody(next),
            })
          : await this.client.putEntity({
              collection: TASK_COLLECTION,
              tenantId: patch.tenantId,
              id: patch.taskId,
              version: next.version,
              body: taskToBody(next),
            });
      return bodyToTask(updated.body);
    } catch (error) {
      if (error instanceof ChosConflictError)
        throw new TaskVersionConflictError(
          patch.taskId,
          // Nur erreichbar mit gesetztem expectedVersion (nur dann CAST); der frühe Check deckt den
          // Normalfall, hier bleibt der seltene nebenläufige Wechsel (Version +1).
          patch.expectedVersion ?? found.version,
          error.actualVersion ?? found.version + 1,
        );
      if (error instanceof ChosEntityNotFoundError)
        throw new TaskNotFoundError(patch.taskId);
      throw error;
    }
  }

  async aggregateChildFlag(input: {
    tenantId: string;
    parentTaskIds: string[];
    taskKind: string;
    flagKey: string;
  }): Promise<ChildFlagAggregate[]> {
    const parents = new Set(input.parentTaskIds);
    const byParent = new Map<string, ChildFlagAggregate>();
    const all = await this.client.listEntities({
      collection: TASK_COLLECTION,
      tenantId: input.tenantId,
    });
    for (const entity of all) {
      const t = bodyToTask(entity.body);
      if (
        t.taskKind !== input.taskKind ||
        t.parentTaskId === null ||
        !parents.has(t.parentTaskId)
      )
        continue;
      const agg = byParent.get(t.parentTaskId) ?? {
        parentTaskId: t.parentTaskId,
        total: 0,
        done: 0,
      };
      agg.total += 1;
      const flag = t.data[input.flagKey];
      if (flag === true || flag === "true") agg.done += 1;
      byParent.set(t.parentTaskId, agg);
    }
    return [...byParent.values()];
  }

  async ping(): Promise<void> {
    await this.client.ping?.();
  }
}
