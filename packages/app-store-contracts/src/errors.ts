/** Provider-neutral persistence errors shared by Case/Kanban/Attachment stores. */

export class StoreConflictError extends Error {
  constructor(
    public readonly resource: string,
    public readonly resourceId: string,
    public readonly expectedVersion?: number,
    message?: string,
  ) {
    super(
      message ??
        (expectedVersion === undefined
          ? `conflict on ${resource} "${resourceId}"`
          : `version conflict on ${resource} "${resourceId}": expected version ${expectedVersion}`),
    );
    this.name = "StoreConflictError";
  }
}

export class StoreNotFoundError extends Error {
  constructor(resource: string, resourceId: string) {
    super(`${resource} "${resourceId}" not found`);
    this.name = "StoreNotFoundError";
  }
}

export class StoreValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreValidationError";
  }
}

export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreUnavailableError";
  }
}

export class StoreMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoreMalformedError";
  }
}

/** Kanban-specific aliases kept for existing call sites (same semantics). */
export class KanbanConflictError extends StoreConflictError {
  constructor(resource: string, resourceId: string, expectedVersion: number) {
    super(resource, resourceId, expectedVersion);
    this.name = "KanbanConflictError";
  }
}

export class KanbanNotFoundError extends StoreNotFoundError {
  constructor(resource: string, resourceId: string) {
    super(resource, resourceId);
    this.name = "KanbanNotFoundError";
  }
}

export class KanbanValidationError extends StoreValidationError {
  constructor(message: string) {
    super(message);
    this.name = "KanbanValidationError";
  }
}
