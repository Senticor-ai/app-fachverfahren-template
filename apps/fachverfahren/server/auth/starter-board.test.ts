import { InMemoryKanbanStore } from "@senticor/app-store-postgres";
import { describe, expect, it } from "vitest";
import { seedPersonalStarterBoard } from "./starter-board.js";

function makeInput() {
  return {
    tenantId: "default",
    authorityId: "default",
    jurisdictionId: "de",
    ownerActorId: "actor.member",
    contentLocale: "de",
    now: new Date("2026-07-12T10:00:00.000Z"),
  };
}

function makeIds() {
  let counter = 0;
  return {
    generateId: (prefix: string) => `${prefix}.${(counter += 1)}`,
  };
}

describe("seedPersonalStarterBoard", () => {
  it("seeds a personal board with the four workflow columns and onboarding cards", async () => {
    const store = new InMemoryKanbanStore();
    const board = await seedPersonalStarterBoard(store, makeInput(), makeIds());

    expect(board.title).toBe("Mein Board");
    expect(board.visibility).toBe("personal");
    expect(board.templateKey).toBe("personal-starter-v1");
    expect(board.purpose).toBe("personal-tasks");
    expect(board.ownerActorId).toBe("actor.member");

    const columns = await store.listColumns({
      tenantId: "default",
      boardId: board.boardId,
    });
    expect(columns.map((column) => column.title)).toEqual([
      "Eingang",
      "In Arbeit",
      "Review",
      "Erledigt",
    ]);

    const cards = await store.listCards({
      tenantId: "default",
      boardId: board.boardId,
    });
    expect(cards.map((card) => card.sourceKey).sort()).toEqual([
      "team-board",
      "welcome",
    ]);
    expect(
      cards.every((card) => card.createdByActorId === "actor.member"),
    ).toBe(true);
  });

  it("keeps column order stable via position keys", async () => {
    const store = new InMemoryKanbanStore();
    const board = await seedPersonalStarterBoard(store, makeInput(), makeIds());
    const columns = await store.listColumns({
      tenantId: "default",
      boardId: board.boardId,
    });
    const keys = columns.map((column) => column.positionKey);
    expect([...keys].sort()).toEqual(keys);
  });
});
