// tasks — DTOs für die Aufgaben/Ziele/Schritte/Termine EINER Akte (ADR-0001/ADR-0003). Mandant/Behörde/
// Jurisdiktion kommen IMMER aus der Sitzung, NIE aus Body/Query (additionalProperties: false); die Task-DTO
// exponiert die Server-Topologie (tenantId/authorityId/jurisdictionId) bewusst NICHT. `taskKind` (aufgabe|ziel|
// checkliste-item|termin) bleibt ein freier String (dossier-/verfahrensdefiniert); `state` ist der feste
// Lebenszyklus der Aufgabe. `data`/`dataPatch` sind frei-formig — nur DORT ist additionalProperties erlaubt.
import { Type, type Static } from "@sinclair/typebox";

export const TaskStateSchema = Type.Union([
  Type.Literal("open"),
  Type.Literal("claimed"),
  Type.Literal("completed"),
  Type.Literal("cancelled"),
]);

export type TaskStateDto = Static<typeof TaskStateSchema>;

export const TaskDtoSchema = Type.Object(
  {
    taskId: Type.String({ minLength: 1 }),
    caseId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    state: TaskStateSchema,
    assignedTo: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    dueAt: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    taskKind: Type.String({ minLength: 1 }),
    parentTaskId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    data: Type.Record(Type.String(), Type.Unknown()),
    sortRank: Type.String(),
    version: Type.Integer({ minimum: 1 }),
    /** Erstellzeitpunkt (ISO) — u. a. der Zeitstempel eines Vermerks (taskKind "notiz"). */
    createdAt: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type TaskDto = Static<typeof TaskDtoSchema>;

export const TaskListQuerySchema = Type.Object(
  {
    taskKind: Type.Optional(Type.String({ minLength: 1 })),
    parentTaskId: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 500 })),
  },
  { additionalProperties: false },
);

export type TaskListQueryDto = Static<typeof TaskListQuerySchema>;

export const TaskListDtoSchema = Type.Object(
  { tasks: Type.Array(TaskDtoSchema) },
  { additionalProperties: false },
);

export type TaskListDto = Static<typeof TaskListDtoSchema>;

export const TaskCreateRequestSchema = Type.Object(
  {
    title: Type.String({ minLength: 1 }),
    taskKind: Type.Optional(Type.String({ minLength: 1 })),
    parentTaskId: Type.Optional(Type.String({ minLength: 1 })),
    assignedTo: Type.Optional(Type.String({ minLength: 1 })),
    dueAt: Type.Optional(Type.String({ minLength: 1 })),
    sortRank: Type.Optional(Type.String()),
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export type TaskCreateRequestDto = Static<typeof TaskCreateRequestSchema>;

export const TaskPatchRequestSchema = Type.Object(
  {
    title: Type.Optional(Type.String({ minLength: 1 })),
    state: Type.Optional(TaskStateSchema),
    assignedTo: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    dueAt: Type.Optional(
      Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    ),
    sortRank: Type.Optional(Type.String()),
    dataPatch: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    expectedVersion: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);

export type TaskPatchRequestDto = Static<typeof TaskPatchRequestSchema>;

export const TaskIdParamsSchema = Type.Object(
  { id: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export type TaskIdParamsDto = Static<typeof TaskIdParamsSchema>;

// Fortschritt je Ziel: compute-on-read aus den `checkliste-item`-Schritten (nie persistiert). `percent` ist
// gerundet (0 bei total=0). Ziele ohne Schritte erscheinen mit total=0/done=0/percent=0.
export const ProgressDtoSchema = Type.Object(
  {
    ziele: Type.Array(
      Type.Object(
        {
          taskId: Type.String({ minLength: 1 }),
          title: Type.String({ minLength: 1 }),
          total: Type.Integer({ minimum: 0 }),
          done: Type.Integer({ minimum: 0 }),
          percent: Type.Integer({ minimum: 0, maximum: 100 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export type ProgressDto = Static<typeof ProgressDtoSchema>;
