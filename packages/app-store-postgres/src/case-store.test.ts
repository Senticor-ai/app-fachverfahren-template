import { describe, expect, it } from "vitest";
import { caseStoreContractScenarios } from "@senticor/app-store-contracts";
import { InMemoryCaseStore } from "./case-store.js";

describe("InMemoryCaseStore contract", () => {
  for (const scenario of caseStoreContractScenarios(new InMemoryCaseStore())) {
    it(scenario.name, async () => {
      await scenario.run();
    });
  }
});

describe("InMemoryCaseStore extras", () => {
  it("paginates with stable ordering", async () => {
    const store = new InMemoryCaseStore();
    const scope = {
      tenantId: "t1",
      authorityId: "a1",
      jurisdictionId: "de",
    };
    for (let i = 0; i < 3; i++) {
      await store.create(
        scope,
        {
          caseId: `c-${i}`,
          leistungId: "demo",
          state: "eingegangen",
          payloadVersion: "1",
          configVersion: "1",
          payload: {
            vorgangsnummer: `FV-${i}`,
            antragsdaten: {},
            ki: { confidence: 0, flags: [] },
            nachweise: [],
            attachmentIds: [],
          },
          submittedAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        },
        {
          eventId: `e-${i}`,
          sequence: 1,
          eventType: "submitted",
          fromState: null,
          toState: "eingegangen",
          actorId: "c",
          actorRole: "buerger",
          requestId: `r-${i}`,
          occurredAt: `2026-01-0${i + 1}T00:00:00.000Z`,
        },
        `idem-${i}`,
      );
    }
    const page1 = await store.list(scope, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.page.nextCursor).toBeTruthy();
    const page2 = await store.list(scope, {
      limit: 2,
      ...(page1.page.nextCursor ? { cursor: page1.page.nextCursor } : {}),
    });
    expect(page2.items).toHaveLength(1);
  });
});
