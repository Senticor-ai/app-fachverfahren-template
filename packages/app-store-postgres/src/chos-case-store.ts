// chos-case-store — der CaseStore-Adapter auf den chos-Graph-Store. Fall-DOKUMENTE liegen als versionierte
// Entities, das append-only Fall-Audit als Ereignis-Stream (Stream-Key = caseId). Der Zustandswechsel +
// Audit läuft ATOMAR über `mutateEntityWithEvent` (chos entity-lifecycle) — dieselbe Unteilbarkeit wie die
// eine Postgres-Transaktion. Der feinere Sicht-Scope (authority/owner) bleibt HIER (identische `imScope`-
// Wahrheit wie InMemory/Postgres); nur `tenantId` ist die harte chos-Partition.
//
// Das ist der OSS-Selektor-Zweig für „grundsätzlich chos für alle Datenspeicherungen": Postgres bleibt der
// Default dieses Repos, chos ist per `APP_STORE_MODE=chos` (+ `CHOS_API_URL`) wählbar — hinter EXAKT der
// CaseStore-Schnittstelle, ohne dass Route/UI sich ändern.

import {
  CaseNotFoundError,
  CaseVersionConflictError,
  imScope,
  type AppAuditEvent,
  type AppCase,
  type CaseStore,
  type GetCaseInput,
  type ListCasesQuery,
  type PatchCaseDataInput,
  type PatchCaseStateInput,
} from "./case-store.js";
import {
  ChosConflictError,
  ChosEntityNotFoundError,
  type ChosClient,
} from "./chos-client.js";
import { auditStreamOrder, chainAuditEvent } from "./audit-chain.js";

const CASE_COLLECTION = "app_cases";
/** Stream-Sentinel für ein Audit-Ereignis OHNE caseId (mandantenweit) — via listAuditEvents(caseId) nie
 *  sichtbar, exakt wie im InMemory-/Postgres-Pfad (dort matcht `case_id = $caseId` ein NULL nie). */
const NO_CASE_STREAM = "__no_case__";

function caseToBody(c: AppCase): Record<string, unknown> {
  return { ...c, subjectIds: [...c.subjectIds] };
}

function bodyToCase(body: Record<string, unknown>): AppCase {
  return {
    caseId: String(body["caseId"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    procedureId: String(body["procedureId"]),
    procedureVersion: String(body["procedureVersion"]),
    state: String(body["state"]),
    version: Number(body["version"]),
    subjectIds: Array.isArray(body["subjectIds"])
      ? (body["subjectIds"] as string[]).map(String)
      : [],
    openedAt: String(body["openedAt"]),
    closedAt:
      body["closedAt"] === null || body["closedAt"] === undefined
        ? null
        : String(body["closedAt"]),
    ownerActorId:
      body["ownerActorId"] === null || body["ownerActorId"] === undefined
        ? null
        : String(body["ownerActorId"]),
    data:
      body["data"] && typeof body["data"] === "object"
        ? (body["data"] as Record<string, unknown>)
        : {},
  };
}

function auditToBody(e: AppAuditEvent): Record<string, unknown> {
  return { ...e, payload: { ...e.payload } };
}

function bodyToAudit(
  body: Record<string, unknown>,
  fallbackCaseId: string,
): AppAuditEvent {
  return {
    auditEventId: String(body["auditEventId"]),
    caseId:
      body["caseId"] === null || body["caseId"] === undefined
        ? fallbackCaseId
        : String(body["caseId"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    actorId: String(body["actorId"]),
    eventType: String(body["eventType"]),
    purpose: String(body["purpose"]),
    legalBasisId: String(body["legalBasisId"]),
    requestId: String(body["requestId"]),
    payload:
      body["payload"] && typeof body["payload"] === "object"
        ? (body["payload"] as Record<string, unknown>)
        : {},
    occurredAt: String(body["occurredAt"]),
    // Hash-Kette (Issue #53) — im chos-Ereignis-Body mitgeführt.
    prevHash:
      body["prevHash"] === null || body["prevHash"] === undefined
        ? null
        : String(body["prevHash"]),
    ...(body["entryHash"] !== undefined
      ? { entryHash: String(body["entryHash"]) }
      : {}),
  };
}

export class ChosCaseStore implements CaseStore {
  constructor(private readonly client: ChosClient) {}

  async insertCase(input: AppCase): Promise<AppCase> {
    const stored = await this.client.putEntity({
      collection: CASE_COLLECTION,
      tenantId: input.tenantId,
      id: input.caseId,
      version: input.version,
      body: caseToBody(input),
    });
    return bodyToCase(stored.body);
  }

  async getCase(input: GetCaseInput): Promise<AppCase | undefined> {
    const found = await this.client.getEntity({
      collection: CASE_COLLECTION,
      tenantId: input.tenantId,
      id: input.caseId,
    });
    if (!found) return undefined;
    const c = bodyToCase(found.body);
    return imScope(c, input) ? c : undefined;
  }

  async listCases(query: ListCasesQuery): Promise<AppCase[]> {
    const all = await this.client.listEntities({
      collection: CASE_COLLECTION,
      tenantId: query.tenantId,
    });
    return all
      .map((e) => bodyToCase(e.body))
      .filter(
        (c) =>
          imScope(c, query) &&
          (query.state === undefined || c.state === query.state) &&
          (query.procedureId === undefined ||
            c.procedureId === query.procedureId),
      )
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, query.limit ?? 100);
  }

  async patchCaseState(input: PatchCaseStateInput): Promise<AppCase> {
    const current = await this.client.getEntity({
      collection: CASE_COLLECTION,
      tenantId: input.tenantId,
      id: input.caseId,
    });
    if (!current) throw new CaseNotFoundError(input.caseId);
    const currentCase = bodyToCase(current.body);
    if (currentCase.version !== input.expectedVersion)
      throw new CaseVersionConflictError(
        input.caseId,
        input.expectedVersion,
        currentCase.version,
      );
    const next: AppCase = {
      ...currentCase,
      state: input.newState,
      version: currentCase.version + 1,
      // Explizites `null` löscht die Schließzeit (Wiederaufnahme), ein String setzt sie, ein ausgelassenes
      // Feld lässt sie unverändert — Parität zu InMemory/Postgres (closedAt-Fallen-Historie).
      closedAt:
        input.closedAt !== undefined ? input.closedAt : currentCase.closedAt,
    };
    const chained = await this.chainAudit(input.auditEvent);
    try {
      const updated = await this.client.mutateEntityWithEvent({
        collection: CASE_COLLECTION,
        tenantId: input.tenantId,
        id: input.caseId,
        expectedVersion: input.expectedVersion,
        nextBody: caseToBody(next),
        event: {
          stream: chained.caseId ?? NO_CASE_STREAM,
          id: chained.auditEventId,
          occurredAt: chained.occurredAt,
          body: auditToBody(chained),
        },
      });
      return bodyToCase(updated.body);
    } catch (error) {
      if (error instanceof ChosConflictError)
        throw new CaseVersionConflictError(
          input.caseId,
          input.expectedVersion,
          // Der frühe Check oben deckt den Normalfall mit echter Ist-Version ab; hier zählt nur der seltene
          // NEBENLÄUFIGE Wechsel zwischen Lesen und Mutieren — ein Patch hebt die Version um genau 1.
          error.actualVersion ?? input.expectedVersion + 1,
        );
      if (error instanceof ChosEntityNotFoundError)
        throw new CaseNotFoundError(input.caseId);
      throw error;
    }
  }

  async patchCaseData(input: PatchCaseDataInput): Promise<AppCase> {
    const current = await this.client.getEntity({
      collection: CASE_COLLECTION,
      tenantId: input.tenantId,
      id: input.caseId,
    });
    if (!current) throw new CaseNotFoundError(input.caseId);
    const currentCase = bodyToCase(current.body);
    if (currentCase.version !== input.expectedVersion)
      throw new CaseVersionConflictError(
        input.caseId,
        input.expectedVersion,
        currentCase.version,
      );
    const next: AppCase = {
      ...currentCase,
      // `state` bleibt unangetastet — eine DSGVO-Löschung ist kein Zustandswechsel.
      data: input.newData,
      version: currentCase.version + 1,
    };
    const chained = await this.chainAudit(input.auditEvent);
    try {
      const updated = await this.client.mutateEntityWithEvent({
        collection: CASE_COLLECTION,
        tenantId: input.tenantId,
        id: input.caseId,
        expectedVersion: input.expectedVersion,
        nextBody: caseToBody(next),
        event: {
          stream: chained.caseId ?? NO_CASE_STREAM,
          id: chained.auditEventId,
          occurredAt: chained.occurredAt,
          body: auditToBody(chained),
        },
      });
      return bodyToCase(updated.body);
    } catch (error) {
      if (error instanceof ChosConflictError)
        throw new CaseVersionConflictError(
          input.caseId,
          input.expectedVersion,
          error.actualVersion ?? input.expectedVersion + 1,
        );
      if (error instanceof ChosEntityNotFoundError)
        throw new CaseNotFoundError(input.caseId);
      throw error;
    }
  }

  async appendAuditEvent(event: AppAuditEvent): Promise<AppAuditEvent> {
    const chained = await this.chainAudit(event);
    await this.client.appendEvent({
      tenantId: chained.tenantId,
      stream: chained.caseId ?? NO_CASE_STREAM,
      id: chained.auditEventId,
      occurredAt: chained.occurredAt,
      body: auditToBody(chained),
    });
    return { ...chained, payload: { ...chained.payload } };
  }

  /** Stempelt die Hash-Kette (prevHash/entryHash) — prevHash = Vorgänger im chos-Ereignis-Stream (Issue #53).
   *  Liest den Stream, kettet an dessen letztes Ereignis. Race-Fenster wie InMemory (Single-Thread-Parität). */
  private async chainAudit(event: AppAuditEvent): Promise<AppAuditEvent> {
    const stream = event.caseId ?? NO_CASE_STREAM;
    const existing = (
      await this.client.listEvents({ tenantId: event.tenantId, stream })
    ).map((e) => bodyToAudit(e.body, event.caseId ?? ""));
    return chainAuditEvent(event, existing);
  }

  async listAuditEvents(query: {
    tenantId: string;
    caseId: string;
    limit?: number;
  }): Promise<AppAuditEvent[]> {
    const events = await this.client.listEvents({
      tenantId: query.tenantId,
      stream: query.caseId,
      ...(query.limit !== undefined ? { limit: query.limit } : { limit: 500 }),
    });
    return events
      .map((e) => bodyToAudit(e.body, query.caseId))
      .sort(auditStreamOrder);
  }

  async ping(): Promise<void> {
    await this.client.ping?.();
  }
}
