import type { CaseStore } from "./case.js";
import type { CaseScope } from "./common.js";
import { StoreConflictError } from "./errors.js";

export interface StoreContractScenario {
  name: string;
  run: () => Promise<void>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const scope: CaseScope = {
  tenantId: "tenant.contract",
  authorityId: "authority.contract",
  jurisdictionId: "de",
  actorId: "actor.contract",
};

/**
 * Provider-neutral CaseStore contract suite.
 * Runnable unchanged against InMemory, Postgres, and later provider-chos.
 */
export function caseStoreContractScenarios(
  store: CaseStore,
): StoreContractScenario[] {
  return [
    {
      name: "create/get/list roundtrip with tenant scope",
      async run() {
        const caseId = `case-${crypto.randomUUID()}`;
        const created = await store.create(
          scope,
          {
            caseId,
            leistungId: "demo",
            state: "eingegangen",
            payloadVersion: "1",
            configVersion: "1",
            payload: {
              vorgangsnummer: "FV-2026-0001",
              antragsdaten: { x: 1 },
              ki: { confidence: 0, flags: [] },
              nachweise: [],
              attachmentIds: [],
            },
            submittedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            eventId: `evt-${crypto.randomUUID()}`,
            sequence: 1,
            eventType: "submitted",
            fromState: null,
            toState: "eingegangen",
            actorId: "citizen.1",
            actorRole: "buerger",
            requestId: "req-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
          },
          `idem-create-${caseId}`,
        );
        assert(created.version === 1, "create starts at version 1");
        const got = await store.get(scope, caseId);
        assert(got?.caseId === caseId, "get returns created case");
        assert((got?.events?.length ?? 0) >= 1, "get includes events");
        const listed = await store.list(scope, { states: ["eingegangen"] });
        assert(
          listed.items.some((i) => i.caseId === caseId),
          "list includes created case",
        );
        const other = await store.get(
          { ...scope, tenantId: "other-tenant" },
          caseId,
        );
        assert(other === null, "cross-tenant get is null");
      },
    },
    {
      name: "create is idempotent on idempotencyKey",
      async run() {
        const caseId = `case-${crypto.randomUUID()}`;
        const key = `idem-${caseId}`;
        const input = {
          caseId,
          leistungId: "demo",
          state: "eingegangen",
          payloadVersion: "1",
          configVersion: "1",
          payload: {
            vorgangsnummer: "FV-2026-0002",
            antragsdaten: {},
            ki: { confidence: 0, flags: [] },
            nachweise: [],
            attachmentIds: [],
          },
          submittedAt: "2026-01-02T00:00:00.000Z",
        };
        const event = {
          eventId: `evt-${crypto.randomUUID()}`,
          sequence: 1,
          eventType: "submitted",
          fromState: null,
          toState: "eingegangen",
          actorId: "citizen.1",
          actorRole: "buerger",
          requestId: "req-2",
          occurredAt: "2026-01-02T00:00:00.000Z",
        };
        const a = await store.create(scope, input, event, key);
        const b = await store.create(scope, input, event, key);
        assert(a.caseId === b.caseId, "idempotent create returns same case");
        assert(a.version === b.version, "idempotent create keeps version");
      },
    },
    {
      name: "commit is atomic, ordered, and concurrency-safe",
      async run() {
        const caseId = `case-${crypto.randomUUID()}`;
        await store.create(
          scope,
          {
            caseId,
            leistungId: "demo",
            state: "eingegangen",
            payloadVersion: "1",
            configVersion: "1",
            payload: {
              vorgangsnummer: "FV-2026-0003",
              antragsdaten: {},
              ki: { confidence: 0, flags: [] },
              nachweise: [],
              attachmentIds: [],
            },
            submittedAt: "2026-01-03T00:00:00.000Z",
          },
          {
            eventId: `evt-${crypto.randomUUID()}`,
            sequence: 1,
            eventType: "submitted",
            fromState: null,
            toState: "eingegangen",
            actorId: "citizen.1",
            actorRole: "buerger",
            requestId: "req-3",
            occurredAt: "2026-01-03T00:00:00.000Z",
          },
          `idem-create-${caseId}`,
        );
        const next = await store.commit(
          scope,
          caseId,
          1,
          {
            vorgangsnummer: "FV-2026-0003",
            antragsdaten: {},
            ki: { confidence: 0, flags: [] },
            nachweise: [],
            attachmentIds: [],
          },
          "in-pruefung",
          {
            eventId: `evt-${crypto.randomUUID()}`,
            sequence: 2,
            eventType: "transition",
            fromState: "eingegangen",
            toState: "in-pruefung",
            actorId: "cw.1",
            actorRole: "sachbearbeitung",
            requestId: "req-4",
            occurredAt: "2026-01-03T01:00:00.000Z",
          },
          `idem-commit-${caseId}-2`,
        );
        assert(next.version === 2, "commit bumps version");
        assert(next.state === "in-pruefung", "commit updates state");
        let conflicted = false;
        try {
          await store.commit(
            scope,
            caseId,
            1,
            next.payload,
            "festgesetzt",
            {
              eventId: `evt-${crypto.randomUUID()}`,
              sequence: 3,
              eventType: "transition",
              fromState: "in-pruefung",
              toState: "festgesetzt",
              actorId: "cw.2",
              actorRole: "sachbearbeitung",
              requestId: "req-5",
              occurredAt: "2026-01-03T02:00:00.000Z",
            },
            `idem-stale-${caseId}`,
          );
        } catch (err) {
          conflicted = err instanceof StoreConflictError;
        }
        assert(conflicted, "stale expectedVersion must conflict");
      },
    },
  ];
}
