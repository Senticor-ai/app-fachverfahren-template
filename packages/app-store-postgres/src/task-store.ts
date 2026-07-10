// task-store — die MANAGEMENT-Datenschicht (PM-Upgrade, Phase 4): verfahrensübergreifende Aufgaben (`app_tasks`) +
// der Triage-Eingang (`app_intake_items`). Getrennt vom fachlichen `CaseStore`: Metadaten (Priorität/Zuweisung/
// Label/Board-Rang) tragen KEIN Vier-Augen-Gate. `acceptIntake` verbindet die Welten ATOMAR: aus einem Eingang wird
// in EINER Transaktion ein fachlicher `app_cases`-Vorgang + eine Aufgabe + der Eingang als „accepted" markiert.
// Zwei Laufzeiten mit identischer Semantik: In-Memory (Tests/DEV) und Postgres (PROD). Mandanten-scoped überall.
import { createPooledPgClient } from "./client.js";
import type { AppAuditEvent, AppCase, CaseStore } from "./case-store.js";
import { CaseVersionConflictError } from "./case-store.js";
import type {
  AppAutomationEvent,
  AutomationStore,
} from "./automation-store.js";
import { insertAutomationEventTx } from "./automation-store.js";

export interface AppTask {
  taskId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string;
  caseId: string | null;
  title: string;
  priorityKey: string | null;
  assigneeActorId: string | null;
  labels: string[];
  dueAt: string | null;
  /** Fristzeitpunkt, für den der Deadline-Scanner bereits ein `frist-erreicht`-Event emittiert hat (ISO), sonst
   *  fehlend/null. Verhindert Re-Scan/Event-Sturm überfälliger Aufgaben; eine über `deadlineEmittedAt` hinaus
   *  verschobene `dueAt` feuert erneut. */
  deadlineEmittedAt?: string | null;
  sortRank: string;
  parentTaskId: string | null;
  boardColumn: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type IntakeSource = "antrag" | "email" | "formular" | "register";
export type IntakeTriageStatus =
  | "pending"
  | "snoozed"
  | "accepted"
  | "declined"
  | "duplicate";

export interface AppIntakeItem {
  intakeId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  procedureId: string;
  source: IntakeSource;
  triageStatus: IntakeTriageStatus;
  subject: string | null;
  rawData: Record<string, unknown>;
  taskId: string | null;
  caseId: string | null;
  receivedAt: string;
}

export interface ListTasksQuery {
  tenantId: string;
  authorityId: string;
  procedureId?: string;
  assigneeActorId?: string | "$none";
  priorityKey?: string;
  state?: string;
  limit?: number;
}

/** Metadaten-Patch einer Aufgabe. `expectedVersion` (optional) erzwingt Optimistic-Locking — für Board-Moves
 *  Pflicht, für reine Zuweisung/Priorität/Labels verzichtbar. Nur gesetzte Felder werden geändert. */
export interface TaskPatch {
  tenantId: string;
  taskId: string;
  expectedVersion?: number;
  priorityKey?: string | null;
  assigneeActorId?: string | null;
  labels?: string[];
  sortRank?: string;
  boardColumn?: string | null;
  /** Fälligkeit/Frist der Aufgabe (ISO) oder `null`. Speist den zeitgetriebenen `frist-erreicht`-Trigger. Eine über
   *  `deadlineEmittedAt` hinaus VERSCHOBENE Frist feuert erneut; `null` entfernt die Frist. */
  dueAt?: string | null;
}

/** Interner Vermerk/Kommentar an einer Aufgabe (append-only — nie editier-/löschbar, wie das Audit). */
export interface AppTaskComment {
  commentId: string;
  taskId: string;
  tenantId: string;
  authorityId: string;
  authorActorId: string;
  body: string;
  createdAt: string;
}

/** Aktivitäts-Eintrag (append-only) — jede Metadaten-/Statusänderung erzeugt einen. */
export interface AppTaskActivity {
  activityId: string;
  taskId: string;
  tenantId: string;
  actorId: string;
  activityType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

/** Gespeicherte Ansicht (Filter/Sort/Group/Layout). Anders als Vermerke: LÖSCHBAR (nicht append-only). */
export interface AppSavedView {
  viewId: string;
  tenantId: string;
  authorityId: string;
  /** `null` = geteilte Ansicht ohne persönlichen Eigentümer. */
  ownerActorId: string | null;
  scope: "personal" | "geteilt";
  label: string;
  layout: string;
  definition: Record<string, unknown>;
  createdAt: string;
}

export type TaskRelationType =
  | "blocks"
  | "blocked-by"
  | "duplicate"
  | "relates"
  | "widerspruch-zu";

/** Eine gerichtete Beziehung zwischen zwei Aufgaben (Plane-Parität). Löschbar; Selbstreferenz ist unzulässig. */
export interface AppTaskRelation {
  relationId: string;
  tenantId: string;
  authorityId: string;
  taskId: string;
  relatedTaskId: string;
  relationType: TaskRelationType;
  createdAt: string;
}

export interface AcceptIntakeInput {
  tenantId: string;
  intakeId: string;
  /** Der zu erzeugende fachliche Vorgang. */
  case: AppCase;
  /** Die zu erzeugende Aufgabe (mit `caseId` = case.caseId). */
  task: AppTask;
  /** WURZEL-Audit-Event (z. B. `case.eingegangen`) — wird ATOMAR mit dem Fall geschrieben, damit kein Fall ohne
   *  Audit-Wurzel entsteht (Revisionssicherheit ab dem ersten Zustand). */
  rootAudit?: AppAuditEvent;
  /** OPTIONAL — Outbox-Event (z. B. `beim-eingang`), das ATOMAR in DERSELBEN Transaktion eingereiht wird. */
  outboxEvent?: AppAutomationEvent;
}

export interface TaskStore {
  insertTask(task: AppTask): Promise<AppTask>;
  getTask(input: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTask | undefined>;
  listTasks(query: ListTasksQuery): Promise<AppTask[]>;
  /** Aufgaben mit ERREICHTER, NOCH NICHT emittierter Frist (`dueAt` ≤ `now`, `deadlineEmittedAt` < `dueAt` oder null) —
   *  die Quelle des zeitgetriebenen `frist-erreicht`-Triggers. BEHÖRDEN-scoped, damit das `limit`-Fenster je Behörde
   *  greift (sonst könnten Fristen einer Behörde die einer anderen verdrängen). */
  listDueTasks(input: {
    tenantId: string;
    authorityId: string;
    now: string;
    procedureId?: string;
    limit?: number;
  }): Promise<AppTask[]>;
  /** Markiert die aktuelle Frist (`dueAt`) einer Aufgabe als vom Scanner emittiert — verhindert Re-Scan/Event-Sturm
   *  überfälliger Aufgaben; eine über `at` hinaus verschobene Frist feuert erneut. */
  markDeadlineEmitted(input: {
    tenantId: string;
    taskId: string;
    at: string;
  }): Promise<void>;
  patchTask(patch: TaskPatch): Promise<AppTask>;
  insertIntake(item: AppIntakeItem): Promise<AppIntakeItem>;
  listIntake(query: {
    tenantId: string;
    authorityId: string;
    triageStatus?: IntakeTriageStatus;
    limit?: number;
  }): Promise<AppIntakeItem[]>;
  /** ATOMAR: Vorgang + Aufgabe anlegen + Eingang auf „accepted" setzen (+ Verknüpfungen). */
  acceptIntake(
    input: AcceptIntakeInput,
  ): Promise<{ case: AppCase; task: AppTask }>;
  /** Setzt den Triage-Status eines Eingangs (declined/duplicate/snoozed/pending) — NIE „accepted" (das ist atomar
   *  via `acceptIntake`, weil dabei Vorgang + Aufgabe entstehen). Behörden-scoped; wirft, wenn der Eingang fehlt. */
  setTriageStatus(input: {
    tenantId: string;
    authorityId: string;
    intakeId: string;
    triageStatus: Exclude<IntakeTriageStatus, "accepted">;
  }): Promise<AppIntakeItem>;

  // ── Vermerke / Aktivität (append-only) + gespeicherte Ansichten (löschbar) ──
  /** Append-only: legt einen internen Vermerk an (kein Update/Delete). */
  insertTaskComment(comment: AppTaskComment): Promise<AppTaskComment>;
  listTaskComments(query: {
    tenantId: string;
    taskId: string;
    limit?: number;
  }): Promise<AppTaskComment[]>;
  /** Append-only: protokolliert eine Aktivität. */
  insertTaskActivity(activity: AppTaskActivity): Promise<AppTaskActivity>;
  listTaskActivity(query: {
    tenantId: string;
    taskId: string;
    limit?: number;
  }): Promise<AppTaskActivity[]>;
  insertSavedView(view: AppSavedView): Promise<AppSavedView>;
  /** Persönliche Ansichten des Akteurs + ALLE geteilten im Mandanten/Behörden-Scope. */
  listSavedViews(query: {
    tenantId: string;
    authorityId: string;
    ownerActorId?: string;
  }): Promise<AppSavedView[]>;
  /** LÖSCHBAR (Ausnahme vom append-only-Muster — Ansichten sind kein Aktenbestandteil). Scope: eine PERSÖNLICHE
   *  Ansicht darf NUR ihr Eigentümer löschen, eine GETEILTE nur innerhalb ihrer Behörde. */
  deleteSavedView(query: {
    tenantId: string;
    authorityId: string;
    actorId: string;
    viewId: string;
  }): Promise<void>;

  /** Legt eine Aufgaben-Beziehung an (löschbar). Wirft bei Selbstreferenz/Duplikat. */
  insertTaskRelation(relation: AppTaskRelation): Promise<AppTaskRelation>;
  listTaskRelations(query: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTaskRelation[]>;
  /** LÖSCHT nur, wenn die Beziehung zu GENAU diesem Task + dieser Behörde gehört (Behörden-Scope wie GET/POST). */
  deleteTaskRelation(query: {
    tenantId: string;
    authorityId: string;
    taskId: string;
    relationId: string;
  }): Promise<void>;
}

export class TaskNotFoundError extends Error {
  constructor(readonly taskId: string) {
    super(`task ${taskId} not found`);
    this.name = "TaskNotFoundError";
  }
}

/** Ungültige Aufgaben-Beziehung: Selbstreferenz oder Duplikat (→ HTTP 409/422). */
export class TaskRelationError extends Error {
  constructor(readonly grund: "self-reference" | "duplicate") {
    super(`invalid task relation: ${grund}`);
    this.name = "TaskRelationError";
  }
}

export class IntakeNotFoundError extends Error {
  constructor(readonly intakeId: string) {
    super(`intake ${intakeId} not found`);
    this.name = "IntakeNotFoundError";
  }
}

// ── In-Memory ─────────────────────────────────────────────────────────────────────────────────────
export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, AppTask>();
  private readonly intake = new Map<string, AppIntakeItem>();
  private readonly now: () => string;
  /** GETEILTER CaseStore — `acceptIntake` schreibt den erzeugten Fall + das Wurzel-Audit HIER hinein (nicht in eine
   *  private Map), damit ein nachfolgender `executeCaseTransition` (der aus DIESEM CaseStore liest) den Fall findet.
   *  Fehlt er (Standalone-Tests), fällt `acceptIntake` auf eine lokale Map zurück. Das schließt das In-Memory-
   *  „Split-Brain": ohne geteilten Store ergab `accept → transition` gegen das In-Memory-Paar ein 404. */
  private readonly caseStore: CaseStore | undefined;
  private readonly localCases = new Map<string, AppCase>();
  private readonly comments: AppTaskComment[] = [];
  private readonly activity: AppTaskActivity[] = [];
  private readonly savedViews = new Map<string, AppSavedView>();
  private readonly relations: AppTaskRelation[] = [];
  /** OPTIONAL geteilter AutomationStore für die In-TX-Emission (analog zum geteilten caseStore). */
  private readonly automationStore: AutomationStore | undefined;

  constructor(
    opts: {
      now?: () => string;
      caseStore?: CaseStore;
      automationStore?: AutomationStore;
    } = {},
  ) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.caseStore = opts.caseStore;
    this.automationStore = opts.automationStore;
  }

  private tk(tenantId: string, id: string) {
    return `${tenantId}:${id}`;
  }

  async insertTask(task: AppTask): Promise<AppTask> {
    const stored = { ...task, labels: [...task.labels] };
    this.tasks.set(this.tk(task.tenantId, task.taskId), stored);
    return { ...stored, labels: [...stored.labels] };
  }

  async getTask(input: { tenantId: string; taskId: string }) {
    const t = this.tasks.get(this.tk(input.tenantId, input.taskId));
    return t ? { ...t, labels: [...t.labels] } : undefined;
  }

  async listTasks(query: ListTasksQuery): Promise<AppTask[]> {
    return [...this.tasks.values()]
      .filter(
        (t) =>
          t.tenantId === query.tenantId &&
          t.authorityId === query.authorityId &&
          (query.procedureId === undefined ||
            t.procedureId === query.procedureId) &&
          (query.priorityKey === undefined ||
            t.priorityKey === query.priorityKey) &&
          (query.assigneeActorId === undefined ||
            (query.assigneeActorId === "$none"
              ? t.assigneeActorId === null
              : t.assigneeActorId === query.assigneeActorId)),
      )
      .sort(
        (a, b) =>
          (a.sortRank < b.sortRank ? -1 : a.sortRank > b.sortRank ? 1 : 0) ||
          a.createdAt.localeCompare(b.createdAt),
      )
      .slice(0, query.limit ?? 200)
      .map((t) => ({ ...t, labels: [...t.labels] }));
  }

  async listDueTasks(input: {
    tenantId: string;
    authorityId: string;
    now: string;
    procedureId?: string;
    limit?: number;
  }): Promise<AppTask[]> {
    return [...this.tasks.values()]
      .filter(
        (t) =>
          t.tenantId === input.tenantId &&
          t.authorityId === input.authorityId &&
          t.dueAt !== null &&
          t.dueAt <= input.now &&
          // noch nicht für diese Frist emittiert (oder Frist über die letzte Emission hinaus verschoben).
          (t.deadlineEmittedAt === null ||
            t.deadlineEmittedAt === undefined ||
            t.deadlineEmittedAt < t.dueAt) &&
          (input.procedureId === undefined ||
            t.procedureId === input.procedureId),
      )
      .sort((a, b) =>
        (a.dueAt ?? "") < (b.dueAt ?? "")
          ? -1
          : (a.dueAt ?? "") > (b.dueAt ?? "")
            ? 1
            : 0,
      )
      .slice(0, input.limit ?? 500)
      .map((t) => ({ ...t, labels: [...t.labels] }));
  }

  async markDeadlineEmitted(input: {
    tenantId: string;
    taskId: string;
    at: string;
  }): Promise<void> {
    const key = this.tk(input.tenantId, input.taskId);
    const cur = this.tasks.get(key);
    if (cur) this.tasks.set(key, { ...cur, deadlineEmittedAt: input.at });
  }

  async patchTask(patch: TaskPatch): Promise<AppTask> {
    const key = this.tk(patch.tenantId, patch.taskId);
    const cur = this.tasks.get(key);
    if (!cur) throw new TaskNotFoundError(patch.taskId);
    if (
      patch.expectedVersion !== undefined &&
      cur.version !== patch.expectedVersion
    )
      throw new CaseVersionConflictError(
        patch.taskId,
        patch.expectedVersion,
        cur.version,
      );
    const next: AppTask = {
      ...cur,
      ...(patch.priorityKey !== undefined
        ? { priorityKey: patch.priorityKey }
        : {}),
      ...(patch.assigneeActorId !== undefined
        ? { assigneeActorId: patch.assigneeActorId }
        : {}),
      ...(patch.labels !== undefined ? { labels: [...patch.labels] } : {}),
      ...(patch.sortRank !== undefined ? { sortRank: patch.sortRank } : {}),
      ...(patch.boardColumn !== undefined
        ? { boardColumn: patch.boardColumn }
        : {}),
      ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt } : {}),
      version: cur.version + 1,
      updatedAt: this.now(),
    };
    this.tasks.set(key, next);
    return { ...next, labels: [...next.labels] };
  }

  async insertIntake(item: AppIntakeItem): Promise<AppIntakeItem> {
    const stored = { ...item, rawData: { ...item.rawData } };
    this.intake.set(this.tk(item.tenantId, item.intakeId), stored);
    return { ...stored, rawData: { ...stored.rawData } };
  }

  async listIntake(query: {
    tenantId: string;
    authorityId: string;
    triageStatus?: IntakeTriageStatus;
    limit?: number;
  }): Promise<AppIntakeItem[]> {
    return [...this.intake.values()]
      .filter(
        (i) =>
          i.tenantId === query.tenantId &&
          i.authorityId === query.authorityId &&
          (query.triageStatus === undefined ||
            i.triageStatus === query.triageStatus),
      )
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .slice(0, query.limit ?? 200)
      .map((i) => ({ ...i, rawData: { ...i.rawData } }));
  }

  async setTriageStatus(input: {
    tenantId: string;
    authorityId: string;
    intakeId: string;
    triageStatus: Exclude<IntakeTriageStatus, "accepted">;
  }): Promise<AppIntakeItem> {
    const cur = this.intake.get(this.tk(input.tenantId, input.intakeId));
    // `accepted` ist TERMINAL: ein angenommener Eingang trägt bereits einen Vorgang/Task — ihn per Triage auf
    // declined/pending zurückzusetzen würde ihn von seinem Fall desynchronisieren. Daher nicht triagierbar.
    if (
      !cur ||
      cur.authorityId !== input.authorityId ||
      cur.triageStatus === "accepted"
    )
      throw new IntakeNotFoundError(input.intakeId);
    const upd: AppIntakeItem = { ...cur, triageStatus: input.triageStatus };
    this.intake.set(this.tk(input.tenantId, input.intakeId), upd);
    return { ...upd, rawData: { ...upd.rawData } };
  }

  async acceptIntake(
    input: AcceptIntakeInput,
  ): Promise<{ case: AppCase; task: AppTask }> {
    const ikey = this.tk(input.tenantId, input.intakeId);
    const intake = this.intake.get(ikey);
    // Selbstschützend: BEHÖRDEN-scoped (die Behörde kommt aus dem zu erzeugenden Fall = Server-Session) UND `accepted`
    // ist terminal (Doppel-Annahme erzeugte sonst einen zweiten Vorgang + verwaiste den ersten). Nicht nur die Route
    // guardt — die Store-API ist selbst wiederverwendungssicher.
    if (
      !intake ||
      intake.authorityId !== input.case.authorityId ||
      intake.triageStatus === "accepted"
    )
      throw new IntakeNotFoundError(input.intakeId);
    // atomar (synchron unteilbar): Vorgang (+ Wurzel-Audit) in den GETEILTEN CaseStore, dann Aufgabe + Eingang-Update.
    if (this.caseStore) {
      await this.caseStore.insertCase(input.case);
      if (input.rootAudit)
        await this.caseStore.appendAuditEvent(input.rootAudit);
    } else {
      this.localCases.set(this.tk(input.case.tenantId, input.case.caseId), {
        ...input.case,
      });
    }
    const task = { ...input.task, caseId: input.case.caseId };
    this.tasks.set(this.tk(task.tenantId, task.taskId), task);
    this.intake.set(ikey, {
      ...intake,
      triageStatus: "accepted",
      caseId: input.case.caseId,
      taskId: task.taskId,
    });
    // In-TX-Emission (In-Memory: geteilter AutomationStore, aus dem auch die Engine liest).
    if (input.outboxEvent)
      await this.automationStore?.enqueueEvent(input.outboxEvent);
    return {
      case: { ...input.case },
      task: { ...task, labels: [...task.labels] },
    };
  }

  async insertTaskComment(comment: AppTaskComment): Promise<AppTaskComment> {
    this.comments.push({ ...comment });
    return { ...comment };
  }

  async listTaskComments(query: {
    tenantId: string;
    taskId: string;
    limit?: number;
  }): Promise<AppTaskComment[]> {
    return this.comments
      .filter((c) => c.tenantId === query.tenantId && c.taskId === query.taskId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, query.limit ?? 200)
      .map((c) => ({ ...c }));
  }

  async insertTaskActivity(
    activity: AppTaskActivity,
  ): Promise<AppTaskActivity> {
    this.activity.push({ ...activity, payload: { ...activity.payload } });
    return { ...activity };
  }

  async listTaskActivity(query: {
    tenantId: string;
    taskId: string;
    limit?: number;
  }): Promise<AppTaskActivity[]> {
    return this.activity
      .filter((a) => a.tenantId === query.tenantId && a.taskId === query.taskId)
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))
      .slice(0, query.limit ?? 200)
      .map((a) => ({ ...a, payload: { ...a.payload } }));
  }

  async insertSavedView(view: AppSavedView): Promise<AppSavedView> {
    this.savedViews.set(this.tk(view.tenantId, view.viewId), {
      ...view,
      definition: { ...view.definition },
    });
    return { ...view };
  }

  async listSavedViews(query: {
    tenantId: string;
    authorityId: string;
    ownerActorId?: string;
  }): Promise<AppSavedView[]> {
    return [...this.savedViews.values()]
      .filter(
        (v) =>
          v.tenantId === query.tenantId &&
          v.authorityId === query.authorityId &&
          (v.scope === "geteilt" ||
            (query.ownerActorId !== undefined &&
              v.ownerActorId === query.ownerActorId)),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((v) => ({ ...v, definition: { ...v.definition } }));
  }

  async deleteSavedView(query: {
    tenantId: string;
    authorityId: string;
    actorId: string;
    viewId: string;
  }): Promise<void> {
    const key = this.tk(query.tenantId, query.viewId);
    const v = this.savedViews.get(key);
    if (!v || v.authorityId !== query.authorityId) return;
    // Persönliche Ansicht nur vom Eigentümer, geteilte innerhalb der Behörde.
    if (v.scope === "geteilt" || v.ownerActorId === query.actorId) {
      this.savedViews.delete(key);
    }
  }

  async insertTaskRelation(
    relation: AppTaskRelation,
  ): Promise<AppTaskRelation> {
    if (relation.taskId === relation.relatedTaskId)
      throw new TaskRelationError("self-reference");
    const dup = this.relations.some(
      (r) =>
        r.tenantId === relation.tenantId &&
        r.taskId === relation.taskId &&
        r.relatedTaskId === relation.relatedTaskId &&
        r.relationType === relation.relationType,
    );
    if (dup) throw new TaskRelationError("duplicate");
    this.relations.push({ ...relation });
    return { ...relation };
  }

  async listTaskRelations(query: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTaskRelation[]> {
    return this.relations
      .filter((r) => r.tenantId === query.tenantId && r.taskId === query.taskId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((r) => ({ ...r }));
  }

  async deleteTaskRelation(query: {
    tenantId: string;
    authorityId: string;
    taskId: string;
    relationId: string;
  }): Promise<void> {
    const i = this.relations.findIndex(
      (r) =>
        r.tenantId === query.tenantId &&
        r.authorityId === query.authorityId &&
        r.taskId === query.taskId &&
        r.relationId === query.relationId,
    );
    if (i >= 0) this.relations.splice(i, 1);
  }
}

// ── Postgres ───────────────────────────────────────────────────────────────────────────────────────
export class PostgresTaskStore implements TaskStore {
  constructor(private readonly databaseUrl: string) {}

  async insertTask(task: AppTask): Promise<AppTask> {
    return this.withClient(async (c) => {
      const r = await c.query<TaskRow>(TASK_INSERT_SQL, taskInsertParams(task));
      return taskFromRow(r.rows[0]!);
    });
  }

  async getTask(input: { tenantId: string; taskId: string }) {
    return this.withClient(async (c) => {
      const r = await c.query<TaskRow>(
        `${TASK_SELECT} WHERE tenant_id = $1 AND task_id = $2`,
        [input.tenantId, input.taskId],
      );
      return r.rows[0] ? taskFromRow(r.rows[0]) : undefined;
    });
  }

  async listTasks(query: ListTasksQuery): Promise<AppTask[]> {
    return this.withClient(async (c) => {
      const assignee = query.assigneeActorId;
      const r = await c.query<TaskRow>(
        `${TASK_SELECT}
         WHERE tenant_id = $1 AND authority_id = $2
           AND ($3::text IS NULL OR procedure_id = $3)
           AND ($4::text IS NULL OR priority_key = $4)
           AND ($5::text IS NULL OR
                ($5 = '$none' AND assignee_actor_id IS NULL) OR
                ($5 <> '$none' AND assignee_actor_id = $5))
         ORDER BY sort_rank ASC, created_at ASC
         LIMIT $6`,
        [
          query.tenantId,
          query.authorityId,
          query.procedureId ?? null,
          query.priorityKey ?? null,
          assignee ?? null,
          query.limit ?? 200,
        ],
      );
      return r.rows.map(taskFromRow);
    });
  }

  async listDueTasks(input: {
    tenantId: string;
    authorityId: string;
    now: string;
    procedureId?: string;
    limit?: number;
  }): Promise<AppTask[]> {
    return this.withClient(async (c) => {
      const r = await c.query<TaskRow>(
        `${TASK_SELECT}
         WHERE tenant_id = $1 AND authority_id = $2
           AND due_at IS NOT NULL AND due_at <= $3
           AND (deadline_emitted_at IS NULL OR deadline_emitted_at < due_at)
           AND ($4::text IS NULL OR procedure_id = $4)
         ORDER BY due_at ASC
         LIMIT $5`,
        [
          input.tenantId,
          input.authorityId,
          input.now,
          input.procedureId ?? null,
          input.limit ?? 500,
        ],
      );
      return r.rows.map(taskFromRow);
    });
  }

  async markDeadlineEmitted(input: {
    tenantId: string;
    taskId: string;
    at: string;
  }): Promise<void> {
    await this.withClient((c) =>
      c.query(
        `UPDATE app_tasks SET deadline_emitted_at = $3
         WHERE tenant_id = $1 AND task_id = $2`,
        [input.tenantId, input.taskId, input.at],
      ),
    );
  }

  async patchTask(patch: TaskPatch): Promise<AppTask> {
    return this.withClient(async (c) => {
      try {
        await c.query("BEGIN");
        const cur = await c.query<TaskRow>(
          `${TASK_SELECT} WHERE tenant_id = $1 AND task_id = $2 FOR UPDATE`,
          [patch.tenantId, patch.taskId],
        );
        const row = cur.rows[0];
        if (!row) throw new TaskNotFoundError(patch.taskId);
        if (
          patch.expectedVersion !== undefined &&
          row.version !== patch.expectedVersion
        )
          throw new CaseVersionConflictError(
            patch.taskId,
            patch.expectedVersion,
            row.version,
          );
        const upd = await c.query<TaskRow>(
          // priority_key nutzt DASSELBE Flag/CASE-WHEN-Muster wie assignee/board/due — sonst kann ein explizites
          // `priorityKey: null` (Priorität ZURÜCKSETZEN) via COALESCE nicht von „nicht angegeben" unterschieden
          // werden und die Priorität bliebe fälschlich bestehen.
          `UPDATE app_tasks SET
             priority_key = CASE WHEN $3::boolean THEN $12 ELSE priority_key END,
             assignee_actor_id = CASE WHEN $4::boolean THEN $5 ELSE assignee_actor_id END,
             labels = COALESCE($6::jsonb, labels),
             sort_rank = COALESCE($7, sort_rank),
             board_column = CASE WHEN $8::boolean THEN $9 ELSE board_column END,
             due_at = CASE WHEN $10::boolean THEN $11 ELSE due_at END,
             version = version + 1,
             updated_at = now()
           WHERE tenant_id = $1 AND task_id = $2
           RETURNING ${TASK_COLS}`,
          [
            patch.tenantId,
            patch.taskId,
            patch.priorityKey !== undefined,
            patch.assigneeActorId !== undefined,
            patch.assigneeActorId ?? null,
            patch.labels !== undefined ? JSON.stringify(patch.labels) : null,
            patch.sortRank ?? null,
            patch.boardColumn !== undefined,
            patch.boardColumn ?? null,
            patch.dueAt !== undefined,
            patch.dueAt ?? null,
            patch.priorityKey ?? null,
          ],
        );
        await c.query("COMMIT");
        return taskFromRow(upd.rows[0]!);
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
  }

  async insertIntake(item: AppIntakeItem): Promise<AppIntakeItem> {
    return this.withClient(async (c) => {
      await c.query(INTAKE_INSERT_SQL, intakeInsertParams(item));
      return { ...item };
    });
  }

  async listIntake(query: {
    tenantId: string;
    authorityId: string;
    triageStatus?: IntakeTriageStatus;
    limit?: number;
  }): Promise<AppIntakeItem[]> {
    return this.withClient(async (c) => {
      const r = await c.query<IntakeRow>(
        `${INTAKE_SELECT}
         WHERE tenant_id = $1 AND authority_id = $2
           AND ($3::text IS NULL OR triage_status = $3)
         ORDER BY received_at DESC LIMIT $4`,
        [
          query.tenantId,
          query.authorityId,
          query.triageStatus ?? null,
          query.limit ?? 200,
        ],
      );
      return r.rows.map(intakeFromRow);
    });
  }

  async setTriageStatus(input: {
    tenantId: string;
    authorityId: string;
    intakeId: string;
    triageStatus: Exclude<IntakeTriageStatus, "accepted">;
  }): Promise<AppIntakeItem> {
    return this.withClient(async (c) => {
      const r = await c.query<IntakeRow>(
        // `accepted` ist TERMINAL (siehe In-Memory) — ein angenommener Eingang wird NICHT (kein Zeilentreffer → wirft).
        `UPDATE app_intake_items SET triage_status = $4
         WHERE tenant_id = $1 AND authority_id = $2 AND intake_id = $3
           AND triage_status <> 'accepted'
         RETURNING ${INTAKE_COLS}`,
        [input.tenantId, input.authorityId, input.intakeId, input.triageStatus],
      );
      if (!r.rows[0]) throw new IntakeNotFoundError(input.intakeId);
      return intakeFromRow(r.rows[0]);
    });
  }

  async acceptIntake(
    input: AcceptIntakeInput,
  ): Promise<{ case: AppCase; task: AppTask }> {
    return this.withClient(async (c) => {
      try {
        await c.query("BEGIN");
        // Selbstschützend + atomar: der FOR-UPDATE-Lock filtert BEHÖRDE (aus dem Fall = Session) UND schließt bereits
        // angenommene Eingänge aus (accepted ist terminal) — verhindert Doppel-Annahme/fremdbehördliche Annahme auch
        // bei nebenläufigen Aufrufen, nicht nur in der Route.
        const intake = await c.query(
          `SELECT intake_id FROM app_intake_items
           WHERE tenant_id = $1 AND intake_id = $2 AND authority_id = $3 AND triage_status <> 'accepted'
           FOR UPDATE`,
          [input.tenantId, input.intakeId, input.case.authorityId],
        );
        if (!intake.rows[0]) throw new IntakeNotFoundError(input.intakeId);
        await c.query(
          `INSERT INTO app_cases (case_id, tenant_id, authority_id, jurisdiction_id, procedure_id,
             procedure_version, state, version, subject_ids, opened_at, closed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)`,
          [
            input.case.caseId,
            input.case.tenantId,
            input.case.authorityId,
            input.case.jurisdictionId,
            input.case.procedureId,
            input.case.procedureVersion,
            input.case.state,
            input.case.version,
            JSON.stringify(input.case.subjectIds),
            input.case.openedAt,
            input.case.closedAt,
          ],
        );
        // Wurzel-Audit-Event ATOMAR mit dem Fall (kein Fall ohne Audit-Wurzel).
        if (input.rootAudit) {
          const a = input.rootAudit;
          await c.query(
            `INSERT INTO app_audit_events (audit_event_id, case_id, tenant_id, authority_id,
               jurisdiction_id, actor_id, event_type, purpose, legal_basis_id, request_id, payload, occurred_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
            [
              a.auditEventId,
              a.caseId,
              a.tenantId,
              a.authorityId,
              a.jurisdictionId,
              a.actorId,
              a.eventType,
              a.purpose,
              a.legalBasisId,
              a.requestId,
              JSON.stringify(a.payload),
              a.occurredAt,
            ],
          );
        }
        const task = { ...input.task, caseId: input.case.caseId };
        const tr = await c.query<TaskRow>(
          TASK_INSERT_SQL,
          taskInsertParams(task),
        );
        await c.query(
          `UPDATE app_intake_items SET triage_status = 'accepted', case_id = $3, task_id = $4
           WHERE tenant_id = $1 AND intake_id = $2`,
          [input.tenantId, input.intakeId, input.case.caseId, task.taskId],
        );
        // ATOMAR: das beim-eingang-Event teilt die BEGIN..COMMIT — kein Fall ohne sein Event (und umgekehrt).
        if (input.outboxEvent)
          await insertAutomationEventTx(c, input.outboxEvent);
        await c.query("COMMIT");
        return { case: { ...input.case }, task: taskFromRow(tr.rows[0]!) };
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      }
    });
  }

  async insertTaskComment(comment: AppTaskComment): Promise<AppTaskComment> {
    return this.withClient(async (c) => {
      await c.query(COMMENT_INSERT_SQL, [
        comment.commentId,
        comment.taskId,
        comment.tenantId,
        comment.authorityId,
        comment.authorActorId,
        comment.body,
        comment.createdAt,
      ]);
      return { ...comment };
    });
  }

  async listTaskComments(query: {
    tenantId: string;
    taskId: string;
    limit?: number;
  }): Promise<AppTaskComment[]> {
    return this.withClient(async (c) => {
      const r = await c.query<CommentRow>(
        `${COMMENT_SELECT} WHERE tenant_id = $1 AND task_id = $2
         ORDER BY created_at ASC LIMIT $3`,
        [query.tenantId, query.taskId, query.limit ?? 200],
      );
      return r.rows.map(commentFromRow);
    });
  }

  async insertTaskActivity(
    activity: AppTaskActivity,
  ): Promise<AppTaskActivity> {
    return this.withClient(async (c) => {
      await c.query(ACTIVITY_INSERT_SQL, [
        activity.activityId,
        activity.taskId,
        activity.tenantId,
        activity.actorId,
        activity.activityType,
        JSON.stringify(activity.payload),
        activity.occurredAt,
      ]);
      return { ...activity };
    });
  }

  async listTaskActivity(query: {
    tenantId: string;
    taskId: string;
    limit?: number;
  }): Promise<AppTaskActivity[]> {
    return this.withClient(async (c) => {
      const r = await c.query<ActivityRow>(
        `${ACTIVITY_SELECT} WHERE tenant_id = $1 AND task_id = $2
         ORDER BY occurred_at ASC LIMIT $3`,
        [query.tenantId, query.taskId, query.limit ?? 200],
      );
      return r.rows.map(activityFromRow);
    });
  }

  async insertSavedView(view: AppSavedView): Promise<AppSavedView> {
    return this.withClient(async (c) => {
      await c.query(SAVED_VIEW_INSERT_SQL, [
        view.viewId,
        view.tenantId,
        view.authorityId,
        view.ownerActorId,
        view.scope,
        view.label,
        view.layout,
        JSON.stringify(view.definition),
        view.createdAt,
      ]);
      return { ...view };
    });
  }

  async listSavedViews(query: {
    tenantId: string;
    authorityId: string;
    ownerActorId?: string;
  }): Promise<AppSavedView[]> {
    return this.withClient(async (c) => {
      const r = await c.query<SavedViewRow>(
        `${SAVED_VIEW_SELECT}
         WHERE tenant_id = $1 AND authority_id = $2
           AND (scope = 'geteilt' OR ($3::text IS NOT NULL AND owner_actor_id = $3))
         ORDER BY created_at ASC`,
        [query.tenantId, query.authorityId, query.ownerActorId ?? null],
      );
      return r.rows.map(savedViewFromRow);
    });
  }

  async deleteSavedView(query: {
    tenantId: string;
    authorityId: string;
    actorId: string;
    viewId: string;
  }): Promise<void> {
    await this.withClient((c) =>
      c.query(
        `DELETE FROM app_saved_views
         WHERE tenant_id = $1 AND view_id = $2 AND authority_id = $3
           AND (scope = 'geteilt' OR owner_actor_id = $4)`,
        [query.tenantId, query.viewId, query.authorityId, query.actorId],
      ),
    );
  }

  async insertTaskRelation(
    relation: AppTaskRelation,
  ): Promise<AppTaskRelation> {
    if (relation.taskId === relation.relatedTaskId)
      throw new TaskRelationError("self-reference");
    return this.withClient(async (c) => {
      try {
        await c.query(RELATION_INSERT_SQL, [
          relation.relationId,
          relation.tenantId,
          relation.authorityId,
          relation.taskId,
          relation.relatedTaskId,
          relation.relationType,
          relation.createdAt,
        ]);
      } catch (e) {
        // Verletzung des UNIQUE-Index (gleiche Beziehung) → als Duplikat melden.
        if (String((e as { code?: unknown }).code) === "23505")
          throw new TaskRelationError("duplicate");
        throw e;
      }
      return { ...relation };
    });
  }

  async listTaskRelations(query: {
    tenantId: string;
    taskId: string;
  }): Promise<AppTaskRelation[]> {
    return this.withClient(async (c) => {
      const r = await c.query<RelationRow>(
        `${RELATION_SELECT} WHERE tenant_id = $1 AND task_id = $2
         ORDER BY created_at ASC`,
        [query.tenantId, query.taskId],
      );
      return r.rows.map(relationFromRow);
    });
  }

  async deleteTaskRelation(query: {
    tenantId: string;
    authorityId: string;
    taskId: string;
    relationId: string;
  }): Promise<void> {
    await this.withClient((c) =>
      c.query(
        `DELETE FROM app_task_relations
         WHERE tenant_id = $1 AND relation_id = $2 AND authority_id = $3 AND task_id = $4`,
        [query.tenantId, query.relationId, query.authorityId, query.taskId],
      ),
    );
  }

  private async withClient<T>(
    cb: (c: import("./client.js").PgClient) => Promise<T>,
  ): Promise<T> {
    // Gepoolte Verbindung: eine geliehene Verbindung je `withClient`-Block — `BEGIN … COMMIT` bleibt auf ihr.
    const client = await createPooledPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await cb(client);
    } finally {
      await client.end();
    }
  }
}

export function createTaskStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TaskStore | undefined {
  const url = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return url ? new PostgresTaskStore(url) : undefined;
}

// ── SQL + Row-Mapping ───────────────────────────────────────────────────────────────────────────
const TASK_COLS = `task_id, tenant_id, authority_id, jurisdiction_id, procedure_id, case_id, title,
  priority_key, assignee_actor_id, labels, due_at, deadline_emitted_at, sort_rank, parent_task_id,
  board_column, version, created_at, updated_at`;
const TASK_SELECT = `SELECT ${TASK_COLS} FROM app_tasks`;
const TASK_INSERT_SQL = `INSERT INTO app_tasks (${TASK_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18)
  RETURNING ${TASK_COLS}`;

interface TaskRow extends Record<string, unknown> {
  task_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  procedure_id: string;
  case_id: string | null;
  title: string;
  priority_key: string | null;
  assignee_actor_id: string | null;
  labels: unknown;
  due_at: Date | string | null;
  deadline_emitted_at: Date | string | null;
  sort_rank: string;
  parent_task_id: string | null;
  board_column: string | null;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

function taskInsertParams(t: AppTask): readonly unknown[] {
  return [
    t.taskId,
    t.tenantId,
    t.authorityId,
    t.jurisdictionId,
    t.procedureId,
    t.caseId,
    t.title,
    t.priorityKey,
    t.assigneeActorId,
    JSON.stringify(t.labels),
    t.dueAt,
    t.deadlineEmittedAt ?? null,
    t.sortRank,
    t.parentTaskId,
    t.boardColumn,
    t.version,
    t.createdAt,
    t.updatedAt,
  ];
}

function taskFromRow(r: TaskRow): AppTask {
  return {
    taskId: r.task_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    jurisdictionId: r.jurisdiction_id,
    procedureId: r.procedure_id,
    caseId: r.case_id,
    title: r.title,
    priorityKey: r.priority_key,
    assigneeActorId: r.assignee_actor_id,
    labels: Array.isArray(r.labels) ? (r.labels as string[]) : [],
    dueAt: iso(r.due_at),
    deadlineEmittedAt: iso(r.deadline_emitted_at),
    sortRank: r.sort_rank,
    parentTaskId: r.parent_task_id,
    boardColumn: r.board_column,
    version: Number(r.version),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}

const INTAKE_COLS = `intake_id, tenant_id, authority_id, jurisdiction_id, procedure_id, source,
  triage_status, subject, raw_data, task_id, case_id, received_at`;
const INTAKE_SELECT = `SELECT ${INTAKE_COLS} FROM app_intake_items`;
const INTAKE_INSERT_SQL = `INSERT INTO app_intake_items (${INTAKE_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`;

interface IntakeRow extends Record<string, unknown> {
  intake_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  procedure_id: string;
  source: IntakeSource;
  triage_status: IntakeTriageStatus;
  subject: string | null;
  raw_data: unknown;
  task_id: string | null;
  case_id: string | null;
  received_at: Date | string;
}

function intakeInsertParams(i: AppIntakeItem): readonly unknown[] {
  return [
    i.intakeId,
    i.tenantId,
    i.authorityId,
    i.jurisdictionId,
    i.procedureId,
    i.source,
    i.triageStatus,
    i.subject,
    JSON.stringify(i.rawData),
    i.taskId,
    i.caseId,
    i.receivedAt,
  ];
}

function intakeFromRow(r: IntakeRow): AppIntakeItem {
  return {
    intakeId: r.intake_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    jurisdictionId: r.jurisdiction_id,
    procedureId: r.procedure_id,
    source: r.source,
    triageStatus: r.triage_status,
    subject: r.subject,
    rawData:
      r.raw_data && typeof r.raw_data === "object"
        ? (r.raw_data as Record<string, unknown>)
        : {},
    taskId: r.task_id,
    caseId: r.case_id,
    receivedAt: iso(r.received_at)!,
  };
}

// ── Vermerke (append-only) ──
const COMMENT_COLS = `comment_id, task_id, tenant_id, authority_id, author_actor_id, body, created_at`;
const COMMENT_SELECT = `SELECT ${COMMENT_COLS} FROM app_task_comments`;
const COMMENT_INSERT_SQL = `INSERT INTO app_task_comments (${COMMENT_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7)`;

interface CommentRow extends Record<string, unknown> {
  comment_id: string;
  task_id: string;
  tenant_id: string;
  authority_id: string;
  author_actor_id: string;
  body: string;
  created_at: Date | string;
}

function commentFromRow(r: CommentRow): AppTaskComment {
  return {
    commentId: r.comment_id,
    taskId: r.task_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    authorActorId: r.author_actor_id,
    body: r.body,
    createdAt: iso(r.created_at)!,
  };
}

// ── Aktivität (append-only) ──
const ACTIVITY_COLS = `activity_id, task_id, tenant_id, actor_id, activity_type, payload, occurred_at`;
const ACTIVITY_SELECT = `SELECT ${ACTIVITY_COLS} FROM app_task_activity`;
const ACTIVITY_INSERT_SQL = `INSERT INTO app_task_activity (${ACTIVITY_COLS})
  VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`;

interface ActivityRow extends Record<string, unknown> {
  activity_id: string;
  task_id: string;
  tenant_id: string;
  actor_id: string;
  activity_type: string;
  payload: unknown;
  occurred_at: Date | string;
}

function activityFromRow(r: ActivityRow): AppTaskActivity {
  return {
    activityId: r.activity_id,
    taskId: r.task_id,
    tenantId: r.tenant_id,
    actorId: r.actor_id,
    activityType: r.activity_type,
    payload:
      r.payload && typeof r.payload === "object"
        ? (r.payload as Record<string, unknown>)
        : {},
    occurredAt: iso(r.occurred_at)!,
  };
}

// ── Gespeicherte Ansichten (löschbar) ──
const SAVED_VIEW_COLS = `view_id, tenant_id, authority_id, owner_actor_id, scope, label, layout, definition, created_at`;
const SAVED_VIEW_SELECT = `SELECT ${SAVED_VIEW_COLS} FROM app_saved_views`;
const SAVED_VIEW_INSERT_SQL = `INSERT INTO app_saved_views (${SAVED_VIEW_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`;

interface SavedViewRow extends Record<string, unknown> {
  view_id: string;
  tenant_id: string;
  authority_id: string;
  owner_actor_id: string | null;
  scope: "personal" | "geteilt";
  label: string;
  layout: string;
  definition: unknown;
  created_at: Date | string;
}

function savedViewFromRow(r: SavedViewRow): AppSavedView {
  return {
    viewId: r.view_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    ownerActorId: r.owner_actor_id,
    scope: r.scope,
    label: r.label,
    layout: r.layout,
    definition:
      r.definition && typeof r.definition === "object"
        ? (r.definition as Record<string, unknown>)
        : {},
    createdAt: iso(r.created_at)!,
  };
}

// ── Aufgaben-Beziehungen (löschbar) ──
const RELATION_COLS = `relation_id, tenant_id, authority_id, task_id, related_task_id, relation_type, created_at`;
const RELATION_SELECT = `SELECT ${RELATION_COLS} FROM app_task_relations`;
const RELATION_INSERT_SQL = `INSERT INTO app_task_relations (${RELATION_COLS})
  VALUES ($1,$2,$3,$4,$5,$6,$7)`;

interface RelationRow extends Record<string, unknown> {
  relation_id: string;
  tenant_id: string;
  authority_id: string;
  task_id: string;
  related_task_id: string;
  relation_type: TaskRelationType;
  created_at: Date | string;
}

function relationFromRow(r: RelationRow): AppTaskRelation {
  return {
    relationId: r.relation_id,
    tenantId: r.tenant_id,
    authorityId: r.authority_id,
    taskId: r.task_id,
    relatedTaskId: r.related_task_id,
    relationType: r.relation_type,
    createdAt: iso(r.created_at)!,
  };
}
