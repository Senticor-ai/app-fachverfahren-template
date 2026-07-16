import { randomUUID } from "node:crypto";
import type { Thing, WorkAction } from "@senticor/fachverfahren-domain";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  StoreConflictError,
  StoreUnavailableError,
  type ActionListQuery,
  type ActionStore,
  type CaseScope,
  type CreateActionInput,
  type CreateThingInput,
  type Page,
  type ThingListQuery,
  type ThingStore,
} from "@senticor/app-store-contracts";

type ScopedThing = Thing & {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
};

type ScopedAction = WorkAction & {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
};

function scopeKey(scope: CaseScope): string {
  return `${scope.tenantId}|${scope.authorityId}|${scope.jurisdictionId}`;
}

function inScope(
  row: { tenantId: string; authorityId: string; jurisdictionId: string },
  scope: CaseScope,
): boolean {
  return (
    row.tenantId === scope.tenantId &&
    row.authorityId === scope.authorityId &&
    row.jurisdictionId === scope.jurisdictionId
  );
}

export class InMemoryThingStore implements ThingStore {
  private readonly things = new Map<string, ScopedThing>();
  private readonly idempotency = new Map<string, string>();

  private key(scope: CaseScope, thingId: string): string {
    return `${scopeKey(scope)}|${thingId}`;
  }

  async list(scope: CaseScope, query: ThingListQuery): Promise<Page<Thing>> {
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    let rows = [...this.things.values()].filter((t) => inScope(t, scope));
    if (query.types?.length) {
      rows = rows.filter((t) => query.types!.includes(t.type));
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((t) => t.name.toLowerCase().includes(q));
    }
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    let start = 0;
    if (query.cursor) {
      const idx = rows.findIndex((r) => r.thingId === query.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = rows.slice(start, start + limit);
    const last = slice.at(-1);
    return {
      items: slice.map(publicThing),
      page: {
        ...(slice.length === limit && last ? { nextCursor: last.thingId } : {}),
        total: rows.length,
      },
    };
  }

  async get(scope: CaseScope, thingId: string): Promise<Thing | null> {
    const found = this.things.get(this.key(scope, thingId));
    if (!found || !inScope(found, scope)) return null;
    return publicThing(found);
  }

  async create(
    scope: CaseScope,
    input: CreateThingInput,
    idempotencyKey: string,
  ): Promise<Thing> {
    const idem = `${scopeKey(scope)}|${idempotencyKey}`;
    const existingId = this.idempotency.get(idem);
    if (existingId) {
      return (await this.get(scope, existingId))!;
    }
    const thingId = input.thingId ?? randomUUID();
    const now = new Date().toISOString();
    const row: ScopedThing = {
      thingId,
      type: input.type,
      name: input.name,
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      properties: input.properties ?? {},
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.sameAs !== undefined ? { sameAs: input.sameAs } : {}),
      createdAt: now,
      updatedAt: now,
      version: 1,
      tenantId: scope.tenantId,
      authorityId: scope.authorityId,
      jurisdictionId: scope.jurisdictionId,
    };
    this.things.set(this.key(scope, thingId), row);
    this.idempotency.set(idem, thingId);
    return publicThing(row);
  }

  async update(
    scope: CaseScope,
    thingId: string,
    expectedVersion: number,
    patch: Partial<
      Pick<Thing, "name" | "description" | "properties" | "url" | "sameAs">
    >,
    idempotencyKey: string,
  ): Promise<Thing> {
    const idem = `${scopeKey(scope)}|${idempotencyKey}`;
    const existingId = this.idempotency.get(idem);
    if (existingId) {
      return (await this.get(scope, existingId))!;
    }
    const key = this.key(scope, thingId);
    const current = this.things.get(key);
    if (!current || !inScope(current, scope)) {
      throw new StoreConflictError("thing", thingId, expectedVersion);
    }
    if (current.version !== expectedVersion) {
      throw new StoreConflictError("thing", thingId, expectedVersion);
    }
    const next: ScopedThing = {
      ...current,
      ...patch,
      properties: patch.properties ?? current.properties,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.things.set(key, next);
    this.idempotency.set(idem, thingId);
    return publicThing(next);
  }
}

export class InMemoryActionStore implements ActionStore {
  private readonly actions = new Map<string, ScopedAction>();
  private readonly idempotency = new Map<string, string>();

  private key(scope: CaseScope, actionId: string): string {
    return `${scopeKey(scope)}|${actionId}`;
  }

  async list(
    scope: CaseScope,
    query: ActionListQuery,
  ): Promise<Page<WorkAction>> {
    const limit = Math.min(
      Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    let rows = [...this.actions.values()].filter((a) => inScope(a, scope));
    if (query.statuses?.length) {
      rows = rows.filter((a) => query.statuses!.includes(a.actionStatus));
    }
    if (query.types?.length) {
      rows = rows.filter((a) => query.types!.includes(a.type));
    }
    if (query.objectThingId) {
      rows = rows.filter((a) => a.object.thingId === query.objectThingId);
    }
    if (query.agentActorId) {
      rows = rows.filter((a) => a.agentActorId === query.agentActorId);
    }
    if (query.search?.trim()) {
      const q = query.search.trim().toLowerCase();
      rows = rows.filter((a) => a.name.toLowerCase().includes(q));
    }
    rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    let start = 0;
    if (query.cursor) {
      const idx = rows.findIndex((r) => r.actionId === query.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const slice = rows.slice(start, start + limit);
    const last = slice.at(-1);
    return {
      items: slice.map(publicAction),
      page: {
        ...(slice.length === limit && last
          ? { nextCursor: last.actionId }
          : {}),
        total: rows.length,
      },
    };
  }

  async get(scope: CaseScope, actionId: string): Promise<WorkAction | null> {
    const found = this.actions.get(this.key(scope, actionId));
    if (!found || !inScope(found, scope)) return null;
    return publicAction(found);
  }

  async create(
    scope: CaseScope,
    input: CreateActionInput,
    idempotencyKey: string,
  ): Promise<WorkAction> {
    const idem = `${scopeKey(scope)}|${idempotencyKey}`;
    const existingId = this.idempotency.get(idem);
    if (existingId) {
      return (await this.get(scope, existingId))!;
    }
    const actionId = input.actionId ?? randomUUID();
    const now = new Date().toISOString();
    const row: ScopedAction = {
      actionId,
      type: input.type,
      name: input.name,
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      actionStatus: input.actionStatus ?? "PotentialActionStatus",
      object: input.object,
      ...(input.agentActorId !== undefined
        ? { agentActorId: input.agentActorId }
        : {}),
      ...(input.instrumentThingId !== undefined
        ? { instrumentThingId: input.instrumentThingId }
        : {}),
      ...(input.resultThingId !== undefined
        ? { resultThingId: input.resultThingId }
        : {}),
      ...(input.startTime !== undefined ? { startTime: input.startTime } : {}),
      ...(input.endTime !== undefined ? { endTime: input.endTime } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      properties: input.properties ?? {},
      createdAt: now,
      updatedAt: now,
      version: 1,
      tenantId: scope.tenantId,
      authorityId: scope.authorityId,
      jurisdictionId: scope.jurisdictionId,
    };
    this.actions.set(this.key(scope, actionId), row);
    this.idempotency.set(idem, actionId);
    return publicAction(row);
  }

  async update(
    scope: CaseScope,
    actionId: string,
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
  ): Promise<WorkAction> {
    const idem = `${scopeKey(scope)}|${idempotencyKey}`;
    const existingId = this.idempotency.get(idem);
    if (existingId) {
      return (await this.get(scope, existingId))!;
    }
    const key = this.key(scope, actionId);
    const current = this.actions.get(key);
    if (!current || !inScope(current, scope)) {
      throw new StoreConflictError("action", actionId, expectedVersion);
    }
    if (current.version !== expectedVersion) {
      throw new StoreConflictError("action", actionId, expectedVersion);
    }
    const next: ScopedAction = {
      ...current,
      ...patch,
      properties: patch.properties ?? current.properties,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.actions.set(key, next);
    this.idempotency.set(idem, actionId);
    return publicAction(next);
  }
}

export class UnavailableThingStore implements ThingStore {
  constructor(private readonly reason: string) {}
  private fail(): never {
    throw new StoreUnavailableError(this.reason);
  }
  list(): Promise<Page<Thing>> {
    this.fail();
  }
  get(): Promise<Thing | null> {
    this.fail();
  }
  create(): Promise<Thing> {
    this.fail();
  }
  update(): Promise<Thing> {
    this.fail();
  }
}

export class UnavailableActionStore implements ActionStore {
  constructor(private readonly reason: string) {}
  private fail(): never {
    throw new StoreUnavailableError(this.reason);
  }
  list(): Promise<Page<WorkAction>> {
    this.fail();
  }
  get(): Promise<WorkAction | null> {
    this.fail();
  }
  create(): Promise<WorkAction> {
    this.fail();
  }
  update(): Promise<WorkAction> {
    this.fail();
  }
}

function publicThing(row: ScopedThing): Thing {
  const { tenantId: _t, authorityId: _a, jurisdictionId: _j, ...thing } = row;
  return structuredClone(thing);
}

function publicAction(row: ScopedAction): WorkAction {
  const { tenantId: _t, authorityId: _a, jurisdictionId: _j, ...action } = row;
  return structuredClone(action);
}

export function createThingStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ThingStore {
  if (
    env["APP_THING_STORE"] === "memory" ||
    env["APP_CASE_STORE"] === "memory"
  ) {
    return new InMemoryThingStore();
  }
  return new UnavailableThingStore(
    "ThingStore requires APP_THING_STORE=memory until Postgres/CHOS adapter exists",
  );
}

export function createActionStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ActionStore {
  if (
    env["APP_ACTION_STORE"] === "memory" ||
    env["APP_CASE_STORE"] === "memory"
  ) {
    return new InMemoryActionStore();
  }
  return new UnavailableActionStore(
    "ActionStore requires APP_ACTION_STORE=memory until Postgres/CHOS adapter exists",
  );
}
