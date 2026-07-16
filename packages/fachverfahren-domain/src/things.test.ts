import { describe, expect, it } from "vitest";
import {
  actionCardSourceKey,
  columnKeyForActionStatus,
  parseActionCardSourceKey,
  projectActionsToBoardView,
  type Thing,
  type WorkAction,
} from "./things.js";

describe("thing/action kanban projection", () => {
  it("maps action status to column keys", () => {
    expect(columnKeyForActionStatus("PotentialActionStatus")).toBe("backlog");
    expect(columnKeyForActionStatus("ActiveActionStatus")).toBe("doing");
  });

  it("round-trips action card source keys", () => {
    expect(actionCardSourceKey("act-1")).toBe("action:act-1");
    expect(parseActionCardSourceKey("action:act-1")).toBe("act-1");
    expect(parseActionCardSourceKey("board:x")).toBeUndefined();
  });

  it("projects ApproveAction on CreativeWork and ContactAction on Person", () => {
    const things = new Map<string, Thing>([
      [
        "work-1",
        {
          thingId: "work-1",
          type: "CreativeWork",
          name: "Bauzeichnung A",
          properties: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          version: 1,
        },
      ],
      [
        "person-1",
        {
          thingId: "person-1",
          type: "Person",
          name: "Alex Muster",
          properties: {},
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          version: 1,
        },
      ],
    ]);
    const actions: WorkAction[] = [
      {
        actionId: "a1",
        type: "ApproveAction",
        name: "Freigeben",
        actionStatus: "PotentialActionStatus",
        object: { thingId: "work-1", type: "CreativeWork" },
        properties: {},
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        version: 1,
      },
      {
        actionId: "a2",
        type: "CommunicateAction",
        name: "Kontaktieren",
        actionStatus: "ActiveActionStatus",
        object: { thingId: "person-1", type: "Person" },
        agentActorId: "cw.1",
        properties: {},
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        version: 1,
      },
    ];
    const view = projectActionsToBoardView(actions, things);
    expect(view.columns.map((c) => c.columnKey)).toEqual([
      "backlog",
      "doing",
      "done",
      "blocked",
    ]);
    expect(view.cards[0]?.title).toBe("Freigeben: Bauzeichnung A");
    expect(view.cards[0]?.columnKey).toBe("backlog");
    expect(view.cards[0]?.references.map((r) => r.referenceKind)).toEqual([
      "Action",
      "Thing",
    ]);
    expect(view.cards[1]?.title).toBe("Kontaktieren: Alex Muster");
    expect(view.cards[1]?.columnKey).toBe("doing");
    expect(view.cards[1]?.assigneeActorId).toBe("cw.1");
  });
});
