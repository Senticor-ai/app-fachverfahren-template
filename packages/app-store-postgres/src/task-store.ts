// task-store — die Aufgaben/Ziele/Schritte/Termine EINER Akte (ADR-0001 / ADR-0003). Erweitert die SDK-`Task`-Form
// um die Dossier-Träger `taskKind`/`parentTaskId`/`data` und persistiert gegen `app_tasks`. EINE polymorphe Tabelle
// bildet die Ziele-mit-Schritten-Hierarchie ab; `aggregateChildFlag` liefert den Fortschritt compute-on-read (nie
// persistiert). Drei Laufzeiten (Postgres/InMemory/Unavailable) mit identischer Semantik; Mandanten-scoped überall.
// Template-Stub für den Standalone-/Ohne-chos-Pfad (in PROD sitzt chos hinter derselben Capability-Naht).
import { createPgClient, type PgClient } from "./client.js";

export type TaskState = "open" | "claimed" | "completed" | "cancelled";

/** Eine Aufgabe/ein Ziel/ein Schritt/ein Termin einer Akte. Erweitert SDK-`Task` (taskId/caseId/title/state/
 *  assignedTo/dueAt) um `taskKind` (aufgabe|ziel|checkliste-item|termin), `parentTaskId` (Schritt → Ziel) und
 *  `data` (frei-formige Nutzlast). */
export interface AppTask {
  taskId: string;
  caseId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  title: string;
  state: TaskState;
  assignedTo: string | null;
  dueAt: string | null;
  taskKind: string;
  parentTaskId: string | null;
  data: Record<string, unknown>;
  sortRank: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListTasksQuery {
  tenantId: string;
  caseId?: string;
  taskKind?: string;
  parentTaskId?: string;
  assignedTo?: string;
  limit?: number;
}

/** Metadaten-/Daten-Patch einer Aufgabe. Nur gesetzte Felder ändern sich; `dataPatch` ist ein FLACHER Merge in
 *  `data` (jsonb `||`). `expectedVersion` (optional) erzwingt Optimistic-Locking. */
export interface TaskPatch {
  tenantId: string;
  taskId: string;
  expectedVersion?: number;
  title?: string;
  state?: TaskState;
  assignedTo?: string | null;
  dueAt?: string | null;
  sortRank?: string;
  dataPatch?: Record<string, unknown>;
}

export interface ChildFlagAggregate {
  parentTaskId: string;
  total: number;
  done: number;
}

export interface TaskStore {
  insertTask(input: AppTask): Promise<AppTask>;
  getTask(input: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTask | undefined>;
  listTasks(query: ListTasksQuery): Promise<AppTask[]>;
  /** Metadaten + `data`-Merge, Optimistic-Locking. Wirft `TaskNotFoundError`/`TaskVersionConflictError`. */
  patchTask(patch: TaskPatch): Promise<AppTask>;
  /** compute-on-read Fortschritt: je Eltern-Aufgabe (`parentTaskId` ∈ `parentTaskIds`) die Zahl der Kinder eines
   *  `taskKind` + wie viele davon ein boolesches `data`-Flag gesetzt haben (`data->>flagKey='true'`). Eltern ohne
   *  passende Kinder fehlen im Ergebnis (Aufrufer behandelt Fehlen als 0/0). LIMIT-frei, nie persistiert. */
  aggregateChildFlag(input: {
    tenantId: string;
    parentTaskIds: string[];
    taskKind: string;
    flagKey: string;
  }): Promise<ChildFlagAggregate[]>;
  ping?(): Promise<void>;
}

export class TaskNotFoundError extends Error {
  constructor(readonly taskId: string) {
    super(`task not found: ${taskId}`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskVersionConflictError extends Error {
  constructor(
    readonly taskId: string,
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(
      `task version conflict: ${taskId} expected ${expectedVersion}, actual ${actualVersion}`,
    );
    this.name = "TaskVersionConflictError";
  }
}

function applyTaskPatch(current: AppTask, patch: TaskPatch): AppTask {
  return {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.assignedTo !== undefined ? { assignedTo: patch.assignedTo } : {}),
    ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
    ...(patch.sortRank !== undefined ? { sortRank: patch.sortRank } : {}),
    ...(patch.dataPatch !== undefined
      ? { data: { ...current.data, ...patch.dataPatch } }
      : {}),
  };
}

export class PostgresTaskStore implements TaskStore {
  constructor(private readonly databaseUrl: string) {}

  async insertTask(input: AppTask): Promise<AppTask> {
    return this.withClient(async (client) => {
      const result = await client.query<TaskRow>(
        `INSERT INTO app_tasks (${TASK_COLS})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)
         RETURNING ${TASK_COLS}`,
        taskInsertParams(input),
      );
      return taskFromRow(result.rows[0]!);
    });
  }

  async getTask(input: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTask | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<TaskRow>(
        `SELECT ${TASK_COLS} FROM app_tasks WHERE tenant_id = $1 AND task_id = $2`,
        [input.tenantId, input.taskId],
      );
      return result.rows[0] ? taskFromRow(result.rows[0]) : undefined;
    });
  }

  async listTasks(query: ListTasksQuery): Promise<AppTask[]> {
    return this.withClient(async (client) => {
      const result = await client.query<TaskRow>(
        `SELECT ${TASK_COLS} FROM app_tasks
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR case_id = $2)
           AND ($3::text IS NULL OR task_kind = $3)
           AND ($4::text IS NULL OR parent_task_id = $4)
           AND ($5::text IS NULL OR assigned_to = $5)
         ORDER BY sort_rank ASC, created_at ASC
         LIMIT $6`,
        [
          query.tenantId,
          query.caseId ?? null,
          query.taskKind ?? null,
          query.parentTaskId ?? null,
          query.assignedTo ?? null,
          query.limit ?? 500,
        ],
      );
      return result.rows.map(taskFromRow);
    });
  }

  async patchTask(patch: TaskPatch): Promise<AppTask> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const cur = await client.query<TaskRow>(
          `SELECT ${TASK_COLS} FROM app_tasks WHERE tenant_id = $1 AND task_id = $2 FOR UPDATE`,
          [patch.tenantId, patch.taskId],
        );
        if (cur.rows.length === 0) throw new TaskNotFoundError(patch.taskId);
        const current = taskFromRow(cur.rows[0]!);
        if (
          patch.expectedVersion !== undefined &&
          current.version !== patch.expectedVersion
        )
          throw new TaskVersionConflictError(
            patch.taskId,
            patch.expectedVersion,
            current.version,
          );
        const next = applyTaskPatch(current, patch);
        const upd = await client.query<TaskRow>(
          `UPDATE app_tasks
             SET title = $1, state = $2, assigned_to = $3, due_at = $4,
                 sort_rank = $5, data = $6::jsonb, version = version + 1, updated_at = now()
           WHERE tenant_id = $7 AND task_id = $8
           RETURNING ${TASK_COLS}`,
          [
            next.title,
            next.state,
            next.assignedTo,
            next.dueAt,
            next.sortRank,
            JSON.stringify(next.data),
            patch.tenantId,
            patch.taskId,
          ],
        );
        await client.query("COMMIT");
        return taskFromRow(upd.rows[0]!);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }

  async aggregateChildFlag(input: {
    tenantId: string;
    parentTaskIds: string[];
    taskKind: string;
    flagKey: string;
  }): Promise<ChildFlagAggregate[]> {
    if (input.parentTaskIds.length === 0) return [];
    return this.withClient(async (client) => {
      const result = await client.query<{
        parent_task_id: string;
        total: number;
        done: number;
      }>(
        `SELECT parent_task_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE data ->> $4 = 'true')::int AS done
         FROM app_tasks
         WHERE tenant_id = $1 AND task_kind = $2 AND parent_task_id = ANY($3)
         GROUP BY parent_task_id`,
        [input.tenantId, input.taskKind, input.parentTaskIds, input.flagKey],
      );
      return result.rows.map((r) => ({
        parentTaskId: r.parent_task_id,
        total: Number(r.total),
        done: Number(r.done),
      }));
    });
  }

  async ping(): Promise<void> {
    await this.withClient((client) => client.query("SELECT 1"));
  }

  private async withClient<T>(callback: (client: PgClient) => Promise<T>) {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, AppTask>();

  private key(tenantId: string, taskId: string) {
    return `${tenantId}:${taskId}`;
  }

  private clone(task: AppTask): AppTask {
    return { ...task, data: { ...task.data } };
  }

  async insertTask(input: AppTask): Promise<AppTask> {
    const stored = this.clone(input);
    this.tasks.set(this.key(input.tenantId, input.taskId), stored);
    return this.clone(stored);
  }

  async getTask(input: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTask | undefined> {
    const found = this.tasks.get(this.key(input.tenantId, input.taskId));
    return found ? this.clone(found) : undefined;
  }

  async listTasks(query: ListTasksQuery): Promise<AppTask[]> {
    return [...this.tasks.values()]
      .filter(
        (t) =>
          t.tenantId === query.tenantId &&
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
      .slice(0, query.limit ?? 500)
      .map((t) => this.clone(t));
  }

  async patchTask(patch: TaskPatch): Promise<AppTask> {
    const found = this.tasks.get(this.key(patch.tenantId, patch.taskId));
    if (!found) throw new TaskNotFoundError(patch.taskId);
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
    this.tasks.set(this.key(patch.tenantId, patch.taskId), next);
    return this.clone(next);
  }

  async aggregateChildFlag(input: {
    tenantId: string;
    parentTaskIds: string[];
    taskKind: string;
    flagKey: string;
  }): Promise<ChildFlagAggregate[]> {
    const parents = new Set(input.parentTaskIds);
    const byParent = new Map<string, ChildFlagAggregate>();
    for (const t of this.tasks.values()) {
      if (
        t.tenantId !== input.tenantId ||
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

  async ping(): Promise<void> {}
}

export class UnavailableTaskStore implements TaskStore {
  constructor(private readonly reason: string) {}
  async insertTask(): Promise<AppTask> {
    throw new Error(this.reason);
  }
  async getTask(): Promise<AppTask | undefined> {
    throw new Error(this.reason);
  }
  async listTasks(): Promise<AppTask[]> {
    throw new Error(this.reason);
  }
  async patchTask(): Promise<AppTask> {
    throw new Error(this.reason);
  }
  async aggregateChildFlag(): Promise<ChildFlagAggregate[]> {
    throw new Error(this.reason);
  }
  async ping(): Promise<void> {
    throw new Error(this.reason);
  }
}

export function createTaskStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TaskStore {
  // Ephemerer Preview-/Dev-Store (s. createAuthStoreFromEnv): APP_STORE_MODE=memory → prozess-lokaler In-Memory-Store.
  if (env["APP_STORE_MODE"] === "memory") return new InMemoryTaskStore();
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresTaskStore(databaseUrl)
    : new UnavailableTaskStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for task data",
      );
}

// ── SQL + Row-Mapping ────────────────────────────────────────────────────────────────────────
const TASK_COLS = `task_id, case_id, tenant_id, authority_id, jurisdiction_id, title, state,
  assigned_to, due_at, task_kind, parent_task_id, data, sort_rank, version, created_at, updated_at`;

function taskInsertParams(t: AppTask): unknown[] {
  return [
    t.taskId,
    t.caseId,
    t.tenantId,
    t.authorityId,
    t.jurisdictionId,
    t.title,
    t.state,
    t.assignedTo,
    t.dueAt,
    t.taskKind,
    t.parentTaskId,
    JSON.stringify(t.data),
    t.sortRank,
    t.version,
    t.createdAt,
    t.updatedAt,
  ];
}

interface TaskRow extends Record<string, unknown> {
  task_id: string;
  case_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  title: string;
  state: TaskState;
  assigned_to: string | null;
  due_at: Date | string | null;
  task_kind: string;
  parent_task_id: string | null;
  data: Record<string, unknown>;
  sort_rank: string;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

function taskFromRow(row: TaskRow): AppTask {
  return {
    taskId: row.task_id,
    caseId: row.case_id,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    title: row.title,
    state: row.state,
    assignedTo: row.assigned_to,
    dueAt: row.due_at === null ? null : toIsoString(row.due_at),
    taskKind: row.task_kind,
    parentTaskId: row.parent_task_id,
    data: row.data && typeof row.data === "object" ? row.data : {},
    sortRank: row.sort_rank,
    version: Number(row.version),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
