import type { CaseScope, Page } from "./common.js";

export type CaseId = string;

/** Current application-data snapshot (no history array, no attachment bytes). */
export interface CaseSnapshotRecord {
  vorgangsnummer: string;
  antragsdaten: Record<string, unknown>;
  berechnung?: Record<string, unknown>;
  ki: Record<string, unknown>;
  nachweise: Array<Record<string, unknown>>;
  /** Attachment ids bound to this case (metadata lives in AttachmentStore / linkage table). */
  attachmentIds: string[];
}

export interface CaseEventRecord {
  eventId: string;
  sequence: number;
  eventType: string;
  fromState: string | null;
  toState: string;
  actorId: string;
  actorRole: string;
  reason?: string;
  eventPayload?: Record<string, unknown>;
  requestId: string;
  occurredAt: string;
}

export interface CreateCaseRecord {
  caseId: CaseId;
  leistungId: string;
  state: string;
  payloadVersion: string;
  configVersion: string;
  payload: CaseSnapshotRecord;
  submittedAt: string;
}

export interface VersionedCaseRecord {
  caseId: CaseId;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  leistungId: string;
  state: string;
  version: number;
  payloadVersion: string;
  configVersion: string;
  payload: CaseSnapshotRecord;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Events loaded with get(); list summaries may omit. */
  events?: CaseEventRecord[];
}

export interface CaseSummaryRecord {
  caseId: CaseId;
  leistungId: string;
  state: string;
  version: number;
  vorgangsnummer: string;
  submittedAt: string;
  updatedAt: string;
}

export interface CaseListQuery {
  states?: string[];
  /** Free-text search over vorgangsnummer (and optionally other summary fields). */
  search?: string;
  /** Opaque cursor from a previous page. */
  cursor?: string;
  limit?: number;
}

/**
 * Provider-neutral case persistence.
 * Does NOT validate transitions, berechne, or four-eyes — CaseService owns that.
 * create/commit are atomic snapshot+event and idempotent on idempotencyKey.
 */
export interface CaseStore {
  list(
    scope: CaseScope,
    query: CaseListQuery,
  ): Promise<Page<CaseSummaryRecord>>;

  get(scope: CaseScope, caseId: CaseId): Promise<VersionedCaseRecord | null>;

  create(
    scope: CaseScope,
    input: CreateCaseRecord,
    initialEvent: CaseEventRecord,
    idempotencyKey: string,
  ): Promise<VersionedCaseRecord>;

  commit(
    scope: CaseScope,
    caseId: CaseId,
    expectedVersion: number,
    nextSnapshot: CaseSnapshotRecord,
    nextState: string,
    event: CaseEventRecord,
    idempotencyKey: string,
  ): Promise<VersionedCaseRecord>;
}
