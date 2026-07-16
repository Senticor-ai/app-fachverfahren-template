import { randomUUID } from "node:crypto";
import type {
  AttachmentStore,
  CaseEventRecord,
  CaseScope,
  CaseSnapshotRecord,
  CaseStore,
  VersionedCaseRecord,
} from "@senticor/app-store-contracts";
import {
  applyTransition,
  DomainRuleError,
  type CaseDomainConfig,
  type Vorgang,
} from "@senticor/fachverfahren-domain";

export class CaseServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "conflict"
      | "unprocessable"
      | "bad_request"
      | "unavailable",
  ) {
    super(message);
    this.name = "CaseServiceError";
  }
}

export interface CaseActor {
  actorId: string;
  rolle: string;
}

export interface CaseServiceDeps {
  caseStore: CaseStore;
  attachmentStore?: AttachmentStore;
  resolveConfig: (leistungId: string) => CaseDomainConfig;
  now?: () => string;
  newId?: () => string;
}

function toSnapshot(v: Vorgang): CaseSnapshotRecord {
  return {
    vorgangsnummer: v.vorgangsnummer,
    antragsdaten: v.antragsdaten as Record<string, unknown>,
    ...(v.berechnung
      ? { berechnung: v.berechnung as unknown as Record<string, unknown> }
      : {}),
    ki: v.ki as unknown as Record<string, unknown>,
    nachweise: v.nachweise as unknown as Array<Record<string, unknown>>,
    attachmentIds: v.nachweise
      .map((n) => n.attachmentId)
      .filter((id): id is string => Boolean(id)),
  };
}

function fromRecord(record: VersionedCaseRecord): Vorgang {
  const history =
    record.events?.map((e) => ({
      ts: e.occurredAt,
      aktion: e.eventType,
      rolle: e.actorRole,
      akteur: e.actorId,
      ...(e.reason ? { detail: e.reason } : {}),
    })) ?? [];
  const vorgang: Vorgang = {
    id: record.caseId,
    vorgangsnummer: record.payload.vorgangsnummer,
    eingangIso: record.submittedAt,
    antragsdaten: record.payload.antragsdaten,
    status: record.state,
    ki: record.payload.ki as unknown as Vorgang["ki"],
    nachweise: record.payload.nachweise as unknown as Vorgang["nachweise"],
    history,
    version: record.version,
    payloadVersion: record.payloadVersion,
    configVersion: record.configVersion,
  };
  if (record.payload.berechnung) {
    // exactOptionalPropertyTypes: cast to Berechnung (not Vorgang["berechnung"] which widens to Berechnung|undefined)
    vorgang.berechnung = record.payload.berechnung as unknown as NonNullable<
      Vorgang["berechnung"]
    >;
  }
  return vorgang;
}

export class CaseService {
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(private readonly deps: CaseServiceDeps) {
    this.now = deps.now ?? (() => new Date().toISOString());
    this.newId = deps.newId ?? (() => randomUUID());
  }

  async list(
    scope: CaseScope,
    query: {
      states?: string[];
      search?: string;
      cursor?: string;
      limit?: number;
    },
  ): Promise<Vorgang[]> {
    const page = await this.deps.caseStore.list(scope, query);
    const full: Vorgang[] = [];
    for (const summary of page.items) {
      const record = await this.deps.caseStore.get(scope, summary.caseId);
      if (record) full.push(fromRecord(record));
    }
    return full;
  }

  async get(scope: CaseScope, caseId: string): Promise<Vorgang | null> {
    const record = await this.deps.caseStore.get(scope, caseId);
    return record ? fromRecord(record) : null;
  }

  async einreichen(input: {
    scope: CaseScope;
    actor: CaseActor;
    leistungId: string;
    antragsdaten: Record<string, unknown>;
    attachmentIds?: string[];
    idempotencyKey: string;
    requestId: string;
  }): Promise<Vorgang> {
    const config = this.deps.resolveConfig(input.leistungId);
    const initial = config.statusMachine.initial;
    if (!initial) {
      throw new CaseServiceError(
        "statusMachine.initial fehlt",
        "unprocessable",
      );
    }
    const nowIso = this.now();
    const caseId = this.newId();
    const attachmentIds = input.attachmentIds ?? [];
    if (attachmentIds.length && this.deps.attachmentStore) {
      await this.deps.attachmentStore.bindToCase(
        input.scope,
        caseId,
        attachmentIds,
      );
    }
    const berechnung = config.berechne?.(input.antragsdaten);
    const nachweise = (config.nachweise?.(input.antragsdaten) ?? []).map(
      (n) => ({
        ...n,
        ...(attachmentIds.includes(n.id)
          ? { hochgeladen: true, attachmentId: n.id }
          : {}),
      }),
    );
    // Prefer binding by explicit attachment ids list on snapshot
    const snapshot: CaseSnapshotRecord = {
      vorgangsnummer: `FV-${nowIso.slice(0, 4)}-${caseId.slice(0, 4)}`,
      antragsdaten: input.antragsdaten,
      ...(berechnung
        ? { berechnung: berechnung as unknown as Record<string, unknown> }
        : {}),
      ki: { confidence: 0, flags: [] },
      nachweise: nachweise as unknown as Array<Record<string, unknown>>,
      attachmentIds,
    };
    const event: CaseEventRecord = {
      eventId: this.newId(),
      sequence: 1,
      eventType: "submitted",
      fromState: null,
      toState: initial,
      actorId: input.actor.actorId,
      actorRole: input.actor.rolle,
      requestId: input.requestId,
      occurredAt: nowIso,
    };
    try {
      const created = await this.deps.caseStore.create(
        input.scope,
        {
          caseId,
          leistungId: input.leistungId,
          state: initial,
          payloadVersion: config.payloadVersion,
          configVersion: config.configVersion,
          payload: snapshot,
          submittedAt: nowIso,
        },
        event,
        input.idempotencyKey,
      );
      return fromRecord(created);
    } catch (err) {
      mapStoreError(err);
    }
  }

  async uebergang(input: {
    scope: CaseScope;
    actor: CaseActor;
    caseId: string;
    eventName: string;
    detail?: string;
    expectedVersion: number;
    idempotencyKey: string;
    requestId: string;
    allowServiceAccounts?: boolean;
  }): Promise<Vorgang> {
    const record = await this.deps.caseStore.get(input.scope, input.caseId);
    if (!record) {
      throw new CaseServiceError("Fall nicht gefunden", "not_found");
    }
    if (record.version !== input.expectedVersion) {
      throw new CaseServiceError(
        `Versionskonflikt: erwartet ${input.expectedVersion}, aktuell ${record.version}`,
        "conflict",
      );
    }
    const config = this.deps.resolveConfig(record.leistungId);
    const vorgang = fromRecord(record);
    let applied;
    try {
      applied = applyTransition({
        config,
        vorgang,
        eventName: input.eventName,
        rolle: input.actor.rolle,
        actorId: input.actor.actorId,
        ...(input.detail !== undefined ? { detail: input.detail } : {}),
        nowIso: this.now(),
        ...(input.allowServiceAccounts !== undefined
          ? { allowServiceAccounts: input.allowServiceAccounts }
          : {}),
      });
    } catch (err) {
      if (err instanceof DomainRuleError) {
        throw new CaseServiceError(err.message, "unprocessable");
      }
      throw err;
    }
    const nextSnapshot = toSnapshot(applied.next);
    const event: CaseEventRecord = {
      eventId: this.newId(),
      sequence: (record.events?.length ?? 0) + 1,
      eventType: applied.transition.eventName ?? applied.transition.label,
      fromState: record.state,
      toState: applied.transition.to,
      actorId: input.actor.actorId,
      actorRole: input.actor.rolle,
      ...(input.detail !== undefined ? { reason: input.detail } : {}),
      requestId: input.requestId,
      occurredAt: applied.historyEntry.ts,
    };
    try {
      const committed = await this.deps.caseStore.commit(
        input.scope,
        input.caseId,
        input.expectedVersion,
        nextSnapshot,
        applied.transition.to,
        event,
        input.idempotencyKey,
      );
      return fromRecord(committed);
    } catch (err) {
      mapStoreError(err);
    }
  }
}

function mapStoreError(err: unknown): never {
  const name = err instanceof Error ? err.name : "";
  if (name === "StoreConflictError") {
    throw new CaseServiceError(
      err instanceof Error ? err.message : "conflict",
      "conflict",
    );
  }
  if (name === "StoreUnavailableError") {
    throw new CaseServiceError(
      err instanceof Error ? err.message : "unavailable",
      "unavailable",
    );
  }
  throw err instanceof Error ? err : new Error(String(err));
}
