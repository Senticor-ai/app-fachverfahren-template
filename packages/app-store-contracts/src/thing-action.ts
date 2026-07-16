import type {
  ActionStatus,
  ActionType,
  Thing,
  ThingRef,
  ThingType,
  WorkAction,
} from "@senticor/fachverfahren-domain";
import type { CaseScope, Page } from "./common.js";

export type ThingId = string;
export type ActionId = string;

export interface ThingListQuery {
  types?: ThingType[];
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface ActionListQuery {
  statuses?: ActionStatus[];
  types?: ActionType[];
  objectThingId?: string;
  agentActorId?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateThingInput {
  thingId?: ThingId;
  type: ThingType;
  name: string;
  description?: string;
  properties?: Record<string, unknown>;
  url?: string;
  sameAs?: string[];
}

export interface CreateActionInput {
  actionId?: ActionId;
  type: ActionType;
  name: string;
  description?: string;
  actionStatus?: ActionStatus;
  object: ThingRef;
  agentActorId?: string;
  instrumentThingId?: string;
  resultThingId?: string;
  startTime?: string;
  endTime?: string;
  dueAt?: string;
  properties?: Record<string, unknown>;
}

/**
 * Provider-neutral Thing store (Schema.org-ish entities).
 * System of record for CreativeWork, Person, Organization, Product, …
 */
export interface ThingStore {
  list(scope: CaseScope, query: ThingListQuery): Promise<Page<Thing>>;
  get(scope: CaseScope, thingId: ThingId): Promise<Thing | null>;
  create(
    scope: CaseScope,
    input: CreateThingInput,
    idempotencyKey: string,
  ): Promise<Thing>;
  update(
    scope: CaseScope,
    thingId: ThingId,
    expectedVersion: number,
    patch: Partial<
      Pick<Thing, "name" | "description" | "properties" | "url" | "sameAs">
    >,
    idempotencyKey: string,
  ): Promise<Thing>;
}

/**
 * Provider-neutral Action store — durable work items.
 * Kanban boards are a VIEW / materialised projection over this store.
 */
export interface ActionStore {
  list(scope: CaseScope, query: ActionListQuery): Promise<Page<WorkAction>>;
  get(scope: CaseScope, actionId: ActionId): Promise<WorkAction | null>;
  create(
    scope: CaseScope,
    input: CreateActionInput,
    idempotencyKey: string,
  ): Promise<WorkAction>;
  update(
    scope: CaseScope,
    actionId: ActionId,
    expectedVersion: number,
    patch: Partial<
      Pick<
        WorkAction,
        | "name"
        | "description"
        | "actionStatus"
        | "agentActorId"
        | "dueAt"
        | "startTime"
        | "endTime"
        | "properties"
      >
    >,
    idempotencyKey: string,
  ): Promise<WorkAction>;
}

export type {
  ActionStatus,
  ActionType,
  Thing,
  ThingRef,
  ThingType,
  WorkAction,
};
