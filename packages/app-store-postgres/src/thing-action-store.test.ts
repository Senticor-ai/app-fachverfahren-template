import { describe, expect, it } from "vitest";
import { projectActionsToBoardView } from "@senticor/fachverfahren-domain";
import {
  InMemoryActionStore,
  InMemoryThingStore,
} from "./thing-action-store.js";

const scope = {
  tenantId: "t1",
  authorityId: "a1",
  jurisdictionId: "de",
};

describe("ThingStore / ActionStore + board projection", () => {
  it("stores Things/Actions and projects a Kanban view", async () => {
    const things = new InMemoryThingStore();
    const actions = new InMemoryActionStore();

    const work = await things.create(
      scope,
      {
        type: "CreativeWork",
        name: "Antragsskizze",
        properties: { encodingFormat: "application/pdf" },
      },
      "idem-thing-1",
    );
    const person = await things.create(
      scope,
      { type: "Person", name: "Kim Beispiel", properties: {} },
      "idem-thing-2",
    );

    const approve = await actions.create(
      scope,
      {
        type: "ApproveAction",
        name: "Freigeben",
        object: { thingId: work.thingId, type: "CreativeWork" },
        actionStatus: "PotentialActionStatus",
      },
      "idem-action-1",
    );
    await actions.create(
      scope,
      {
        type: "CommunicateAction",
        name: "Kontaktieren",
        object: { thingId: person.thingId, type: "Person" },
        actionStatus: "ActiveActionStatus",
        agentActorId: "cw.1",
      },
      "idem-action-2",
    );

    const listed = await actions.list(scope, {});
    expect(listed.items).toHaveLength(2);

    const thingMap = new Map(
      (await things.list(scope, {})).items.map((t) => [t.thingId, t]),
    );
    const view = projectActionsToBoardView(listed.items, thingMap);
    expect(view.cards.some((c) => c.actionId === approve.actionId)).toBe(true);
    expect(
      view.cards.find((c) => c.actionType === "ApproveAction")?.object.type,
    ).toBe("CreativeWork");
    expect(
      view.cards.find((c) => c.actionType === "CommunicateAction")?.columnKey,
    ).toBe("doing");
  });

  it("isolates tenants", async () => {
    const things = new InMemoryThingStore();
    await things.create(
      scope,
      { type: "Organization", name: "Amt A", properties: {} },
      "idem-org",
    );
    const other = await things.get(
      { ...scope, tenantId: "other" },
      (await things.list(scope, {})).items[0]!.thingId,
    );
    expect(other).toBeNull();
  });
});
