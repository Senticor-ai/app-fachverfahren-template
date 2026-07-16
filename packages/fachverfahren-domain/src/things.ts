/**
 * Schema.org-inspired Thing / Action model.
 * Kanban is a VIEW over Actions whose `object` points at Things — not a separate SoR.
 *
 * @see https://schema.org/Thing
 * @see https://schema.org/Action
 */

export type ThingType =
  | "Thing"
  | "CreativeWork"
  | "Book"
  | "Movie"
  | "MusicRecording"
  | "Recipe"
  | "TVSeries"
  | "AudioObject"
  | "ImageObject"
  | "VideoObject"
  | "Event"
  | "MedicalEntity"
  | "Organization"
  | "Person"
  | "Place"
  | "LocalBusiness"
  | "Restaurant"
  | "Product"
  | "Offer"
  | "AggregateOffer"
  | "Review"
  | "AggregateRating"
  | "Action";

export type ActionType =
  | "Action"
  | "ReadAction"
  | "ApproveAction"
  | "RejectAction"
  | "ReviewAction"
  | "AssessAction"
  | "CommunicateAction"
  | "ContactAction"
  | "SearchAction"
  | "RegisterAction"
  | "UpdateAction"
  | "CreateAction"
  | "DeleteAction"
  | "AssignAction"
  | "ConfirmAction";

export type ActionStatus =
  | "PotentialActionStatus"
  | "ActiveActionStatus"
  | "CompletedActionStatus"
  | "FailedActionStatus";

export interface ThingRef {
  thingId: string;
  type: ThingType;
}

export interface Thing {
  thingId: string;
  type: ThingType;
  name: string;
  description?: string;
  properties: Record<string, unknown>;
  url?: string;
  sameAs?: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface WorkAction {
  actionId: string;
  type: ActionType;
  name: string;
  description?: string;
  actionStatus: ActionStatus;
  object: ThingRef;
  agentActorId?: string;
  instrumentThingId?: string;
  resultThingId?: string;
  startTime?: string;
  endTime?: string;
  dueAt?: string;
  properties: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export const ACTION_STATUS_COLUMN: Record<ActionStatus, string> = {
  PotentialActionStatus: "backlog",
  ActiveActionStatus: "doing",
  CompletedActionStatus: "done",
  FailedActionStatus: "blocked",
};

export const ACTION_STATUS_COLUMN_LABEL: Record<string, string> = {
  backlog: "Bereit",
  doing: "In Arbeit",
  done: "Erledigt",
  blocked: "Blockiert",
};

export function columnKeyForActionStatus(status: ActionStatus): string {
  return ACTION_STATUS_COLUMN[status];
}

export function actionStatusForColumnKey(
  columnKey: string,
): ActionStatus | undefined {
  const entry = (
    Object.entries(ACTION_STATUS_COLUMN) as [ActionStatus, string][]
  ).find(([, key]) => key === columnKey);
  return entry?.[0];
}

export function actionCardSourceKey(actionId: string): string {
  return `action:${actionId}`;
}

export function parseActionCardSourceKey(
  sourceKey: string | null | undefined,
): string | undefined {
  if (!sourceKey?.startsWith("action:")) return undefined;
  const id = sourceKey.slice("action:".length);
  return id || undefined;
}

/** Card-shaped projection of an Action for Kanban UI (not the SoR). */
export interface ActionBoardCardProjection {
  sourceKey: string;
  actionId: string;
  actionType: ActionType;
  title: string;
  descriptionMarkdown: string | null;
  columnKey: string;
  columnLabel: string;
  actionStatus: ActionStatus;
  object: ThingRef;
  objectName?: string;
  assigneeActorId: string | null;
  dueAt: string | null;
  priority: "low" | "normal" | "high" | "critical";
  references: Array<{
    referenceKind: "Action" | "Thing";
    referenceSystem: "fachverfahren-domain";
    externalId: string;
    metadata: Record<string, unknown>;
  }>;
}

export interface BoardViewProjection {
  columns: Array<{ columnKey: string; title: string }>;
  cards: ActionBoardCardProjection[];
}

/**
 * Project Actions (+ optional Thing names) into a Kanban view model.
 * Does not write KanbanStore — callers may materialise or render directly.
 */
export function projectActionsToBoardView(
  actions: WorkAction[],
  thingsById: Map<string, Thing> = new Map(),
): BoardViewProjection {
  const columns = (
    Object.entries(ACTION_STATUS_COLUMN_LABEL) as [string, string][]
  ).map(([columnKey, title]) => ({ columnKey, title }));

  const cards: ActionBoardCardProjection[] = actions.map((action) => {
    const columnKey = columnKeyForActionStatus(action.actionStatus);
    const thing = thingsById.get(action.object.thingId);
    const objectName = thing?.name;
    const title =
      objectName !== undefined ? `${action.name}: ${objectName}` : action.name;
    return {
      sourceKey: actionCardSourceKey(action.actionId),
      actionId: action.actionId,
      actionType: action.type,
      title,
      descriptionMarkdown: action.description ?? null,
      columnKey,
      columnLabel: ACTION_STATUS_COLUMN_LABEL[columnKey] ?? columnKey,
      actionStatus: action.actionStatus,
      object: action.object,
      ...(objectName !== undefined ? { objectName } : {}),
      assigneeActorId: action.agentActorId ?? null,
      dueAt: action.dueAt ?? null,
      priority: priorityFromAction(action),
      references: [
        {
          referenceKind: "Action",
          referenceSystem: "fachverfahren-domain",
          externalId: action.actionId,
          metadata: {
            actionType: action.type,
            actionStatus: action.actionStatus,
          },
        },
        {
          referenceKind: "Thing",
          referenceSystem: "fachverfahren-domain",
          externalId: action.object.thingId,
          metadata: { thingType: action.object.type },
        },
      ],
    };
  });

  return { columns, cards };
}

function priorityFromAction(
  action: WorkAction,
): "low" | "normal" | "high" | "critical" {
  const raw = action.properties["priority"];
  if (
    raw === "low" ||
    raw === "normal" ||
    raw === "high" ||
    raw === "critical"
  ) {
    return raw;
  }
  if (action.type === "ApproveAction" || action.type === "RejectAction") {
    return "high";
  }
  return "normal";
}
