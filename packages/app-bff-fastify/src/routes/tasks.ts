// Task-Routen — Ziele/Schritte/Termine + Fortschritt EINER Akte (ADR-0001/ADR-0003). Lesen erfordert `case.read`,
// Schreiben `case.decision.prepare`. Mandant/Behörde/Jurisdiktion + Akteur kommen AUSSCHLIESSLICH aus der Sitzung.
// Jede Route prüft zuerst, dass die Akte zur Session-Behörde gehört (getCase, 404 sonst — keine Existenz-Leaks).
// Der Fortschritt (`/progress`) wird compute-on-read aus den `checkliste-item`-Schritten je Ziel gerechnet, nie
// persistiert. Template-Stub für den Standalone-/Ohne-chos-Pfad (in PROD sitzt chos hinter derselben Naht).
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import {
  CaseIdParamsSchema,
  ErrorEnvelopeSchema,
  ProgressDtoSchema,
  TaskCreateRequestSchema,
  TaskDtoSchema,
  TaskIdParamsSchema,
  TaskListDtoSchema,
  TaskListQuerySchema,
  TaskPatchRequestSchema,
  type ProgressDto,
  type TaskDto,
} from "@senticor/app-bff-contracts";
import {
  TaskNotFoundError,
  TaskVersionConflictError,
  type AppCase,
  type AppTask,
  type ChildFlagAggregate,
} from "@senticor/app-store-postgres";
import { builtInPermissions } from "@senticor/public-sector-sdk";
import type { BffDeps } from "../deps.js";
import { bffRouteAuth, requestIdOf, sessionOf } from "../route-auth.js";
import { storeUnavailable } from "../store-error.js";

/** AppTask → TaskDto (Server-Topologie tenant/authority/jurisdiction bleibt verborgen). */
function toTaskDto(t: AppTask): TaskDto {
  return {
    taskId: t.taskId,
    caseId: t.caseId,
    title: t.title,
    state: t.state,
    assignedTo: t.assignedTo,
    dueAt: t.dueAt,
    taskKind: t.taskKind,
    parentTaskId: t.parentTaskId,
    data: t.data,
    sortRank: t.sortRank,
    version: t.version,
    createdAt: t.createdAt,
  };
}

export function registerTaskRoutes(app: FastifyInstance, deps: BffDeps): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const readAuth = bffRouteAuth(
    { kind: "rbac", permission: builtInPermissions.caseRead.permission },
    deps,
  );
  const writeAuth = bffRouteAuth(
    {
      kind: "rbac",
      permission: builtInPermissions.casePrepareDecision.permission,
    },
    deps,
  );
  const errorResponses = {
    400: ErrorEnvelopeSchema,
    401: ErrorEnvelopeSchema,
    403: ErrorEnvelopeSchema,
    404: ErrorEnvelopeSchema,
    503: ErrorEnvelopeSchema,
  };

  /** Akte laden und Behörden-Scope prüfen. `undefined` heißt: nicht vorhanden ODER Fremd-Behörde → 404. */
  async function loadOwnedCase(
    session: ReturnType<typeof sessionOf>,
    caseId: string,
  ): Promise<AppCase | undefined> {
    const found = await deps.caseStore.getCase({
      tenantId: session.tenantId,
      caseId,
    });
    if (!found || found.authorityId !== session.authorityId) return undefined;
    return found;
  }

  typed.get(
    "/api/cases/:id/tasks",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["tasks"],
        summary: "Aufgaben/Ziele/Schritte/Termine einer Akte lesen",
        params: CaseIdParamsSchema,
        querystring: TaskListQuerySchema,
        response: { 200: TaskListDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let tasks: AppTask[];
      try {
        const owned = await loadOwnedCase(session, request.params.id);
        if (!owned)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        tasks = await deps.taskStore.listTasks({
          tenantId: session.tenantId,
          caseId: request.params.id,
          ...(request.query.taskKind !== undefined
            ? { taskKind: request.query.taskKind }
            : {}),
          ...(request.query.parentTaskId !== undefined
            ? { parentTaskId: request.query.parentTaskId }
            : {}),
          ...(request.query.limit !== undefined
            ? { limit: request.query.limit }
            : {}),
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.send({ tasks: tasks.map(toTaskDto) });
    },
  );

  typed.post(
    "/api/cases/:id/tasks",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["tasks"],
        summary: "Aufgabe/Ziel/Schritt/Termin einer Akte anlegen",
        params: CaseIdParamsSchema,
        body: TaskCreateRequestSchema,
        response: { 201: TaskDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;
      let created: AppTask;
      try {
        const owned = await loadOwnedCase(session, request.params.id);
        if (!owned)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        const now = new Date().toISOString();
        const task: AppTask = {
          taskId: randomUUID(),
          caseId: request.params.id,
          tenantId: session.tenantId,
          authorityId: session.authorityId,
          jurisdictionId: session.jurisdictionId,
          title: body.title,
          state: "open",
          assignedTo: body.assignedTo ?? null,
          dueAt: body.dueAt ?? null,
          taskKind: body.taskKind ?? "aufgabe",
          parentTaskId: body.parentTaskId ?? null,
          // Urheber:in server-autoritativ aus der Session (nie vom Client) — generische Metadaten für JEDE
          // Aufgabe; u. a. der Autor eines Vermerks (taskKind "notiz"). Überschreibt ein evtl. mitgesendetes Feld.
          data: { ...(body.data ?? {}), createdBy: session.actorId },
          sortRank: body.sortRank ?? "",
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        created = await deps.taskStore.insertTask(task);
      } catch {
        return storeUnavailable(request, reply);
      }
      return reply.code(201).send(toTaskDto(created));
    },
  );

  typed.patch(
    "/api/tasks/:id",
    {
      config: writeAuth.config,
      preHandler: writeAuth.preHandler,
      schema: {
        tags: ["tasks"],
        summary: "Aufgabe patchen (Metadaten + data-Merge, Optimistic-Locking)",
        params: TaskIdParamsSchema,
        body: TaskPatchRequestSchema,
        response: { 200: TaskDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      const body = request.body;
      let updated: AppTask;
      try {
        const task = await deps.taskStore.getTask({
          tenantId: session.tenantId,
          taskId: request.params.id,
        });
        // Nicht vorhanden ODER fremder Mandant (getTask ist mandanten-scoped) → 404 (keine Existenz-Leaks).
        if (!task)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        // Behörden-Scope über die Akte: eine Fremd-Behörde im selben Mandanten → 404.
        const owned = await loadOwnedCase(session, task.caseId);
        if (!owned)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        updated = await deps.taskStore.patchTask({
          tenantId: session.tenantId,
          taskId: request.params.id,
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.state !== undefined ? { state: body.state } : {}),
          ...(body.assignedTo !== undefined
            ? { assignedTo: body.assignedTo }
            : {}),
          ...(body.dueAt !== undefined ? { dueAt: body.dueAt } : {}),
          ...(body.sortRank !== undefined ? { sortRank: body.sortRank } : {}),
          ...(body.dataPatch !== undefined
            ? { dataPatch: body.dataPatch }
            : {}),
          ...(body.expectedVersion !== undefined
            ? { expectedVersion: body.expectedVersion }
            : {}),
        });
      } catch (error) {
        if (error instanceof TaskVersionConflictError)
          return reply.code(409).send({
            error: "task version conflict",
            requestId: requestIdOf(request),
          });
        if (error instanceof TaskNotFoundError)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        return storeUnavailable(request, reply);
      }
      return reply.send(toTaskDto(updated));
    },
  );

  typed.get(
    "/api/cases/:id/progress",
    {
      config: readAuth.config,
      preHandler: readAuth.preHandler,
      schema: {
        tags: ["tasks"],
        summary:
          "Fortschritt je Ziel (compute-on-read aus den checkliste-item-Schritten)",
        params: CaseIdParamsSchema,
        response: { 200: ProgressDtoSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const session = sessionOf(request);
      let ziele: AppTask[];
      let aggregates: ChildFlagAggregate[];
      try {
        const owned = await loadOwnedCase(session, request.params.id);
        if (!owned)
          return reply
            .code(404)
            .send({ error: "not found", requestId: requestIdOf(request) });
        ziele = await deps.taskStore.listTasks({
          tenantId: session.tenantId,
          caseId: request.params.id,
          taskKind: "ziel",
        });
        aggregates = await deps.taskStore.aggregateChildFlag({
          tenantId: session.tenantId,
          parentTaskIds: ziele.map((z) => z.taskId),
          taskKind: "checkliste-item",
          flagKey: "erledigt",
        });
      } catch {
        return storeUnavailable(request, reply);
      }
      const byParent = new Map(aggregates.map((a) => [a.parentTaskId, a]));
      const response: ProgressDto = {
        ziele: ziele.map((z) => {
          const agg = byParent.get(z.taskId);
          const total = agg?.total ?? 0;
          const done = agg?.done ?? 0;
          return {
            taskId: z.taskId,
            title: z.title,
            total,
            done,
            percent: total ? Math.round((done / total) * 100) : 0,
          };
        }),
      };
      return reply.send(response);
    },
  );
}
