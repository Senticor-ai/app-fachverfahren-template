import { describe, expect, it } from "vitest";
import {
  InMemoryKanbanStore,
  KanbanConflictError,
  KanbanValidationError,
  type Board,
  type BoardCard,
  type BoardColumn,
} from "./kanban-store.js";
import { nextPositionKey } from "./position.js";

function makeBoard(overrides: Partial<Board> = {}): Board {
  const now = new Date().toISOString();
  return {
    boardId: "board.1",
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    ownerActorId: "actor.owner",
    title: "Build the Fachverfahren",
    description: null,
    visibility: "personal",
    contentLocale: "de",
    templateKey: "fachverfahren-discovery-v1",
    templateVersion: 1,
    purpose: null,
    lifecycleStage: null,
    version: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeColumn(overrides: Partial<BoardColumn> = {}): BoardColumn {
  const now = new Date().toISOString();
  return {
    columnId: "column.1",
    boardId: "board.1",
    title: "Inbox",
    positionKey: nextPositionKey(null, null),
    version: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCard(overrides: Partial<BoardCard> = {}): BoardCard {
  const now = new Date().toISOString();
  return {
    cardId: "card.1",
    boardId: "board.1",
    columnId: "column.1",
    title: "Define the legal basis",
    descriptionMarkdown: null,
    kind: "task",
    priority: "normal",
    assigneeActorId: null,
    dueAt: null,
    blockedReason: null,
    positionKey: nextPositionKey(null, null),
    labels: [],
    sourceKey: null,
    createdByActorId: "actor.owner",
    version: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("nextPositionKey", () => {
  it("generates a key between two neighbors that sorts correctly", () => {
    const first = nextPositionKey(null, null);
    const second = nextPositionKey(first, null);
    const between = nextPositionKey(first, second);

    expect([first, between, second]).toEqual(
      [first, between, second].slice().sort(),
    );
    expect(between > first).toBe(true);
    expect(between < second).toBe(true);
  });
});

describe("InMemoryKanbanStore — boards", () => {
  it("creates, reads, and lists boards scoped by tenant and owner", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    await store.createBoard(
      makeBoard({ boardId: "board.2", tenantId: "tenant.other" }),
    );

    const fetched = await store.getBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
    });
    expect(fetched?.title).toBe("Build the Fachverfahren");

    const listed = await store.listBoards({
      tenantId: "tenant.local",
      actorId: "actor.owner",
    });
    expect(listed.map((board) => board.boardId)).toEqual(["board.1"]);
  });

  it("lists team boards of other owners but hides their personal boards", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(
      makeBoard({ boardId: "board.own", ownerActorId: "actor.member" }),
    );
    await store.createBoard(
      makeBoard({
        boardId: "board.team",
        ownerActorId: "actor.owner",
        visibility: "team",
      }),
    );
    await store.createBoard(
      makeBoard({ boardId: "board.foreign", ownerActorId: "actor.owner" }),
    );
    await store.createBoard(
      makeBoard({
        boardId: "board.other-tenant",
        tenantId: "tenant.other",
        visibility: "team",
      }),
    );

    const listed = await store.listBoards({
      tenantId: "tenant.local",
      actorId: "actor.member",
    });
    expect(listed.map((board) => board.boardId).sort()).toEqual([
      "board.own",
      "board.team",
    ]);
  });

  it("carries purpose and lifecycle stage as board metadata", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(
      makeBoard({
        purpose: "requirements-discovery",
        lifecycleStage: "design",
      }),
    );

    const fetched = await store.getBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
    });
    expect(fetched?.purpose).toBe("requirements-discovery");
    expect(fetched?.lifecycleStage).toBe("design");
  });

  it("rejects an update with a stale version", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());

    const updated = await store.updateBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
      expectedVersion: 1,
      patch: { title: "Renamed" },
    });
    expect(updated.version).toBe(2);
    expect(updated.title).toBe("Renamed");

    await expect(
      store.updateBoard({
        tenantId: "tenant.local",
        boardId: "board.1",
        expectedVersion: 1,
        patch: { title: "Stale write" },
      }),
    ).rejects.toBeInstanceOf(KanbanConflictError);
  });

  it("archives and restores a board", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());

    const archived = await store.archiveBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
      expectedVersion: 1,
    });
    expect(archived.archivedAt).not.toBeNull();

    const restored = await store.restoreBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
      expectedVersion: 2,
    });
    expect(restored.archivedAt).toBeNull();
  });
});

describe("InMemoryKanbanStore — columns", () => {
  it("orders columns by position key", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    const first = nextPositionKey(null, null);
    const second = nextPositionKey(first, null);
    await store.createColumn(
      makeColumn({ columnId: "column.b", positionKey: second, title: "Ready" }),
    );
    await store.createColumn(
      makeColumn({ columnId: "column.a", positionKey: first, title: "Inbox" }),
    );

    const columns = await store.listColumns({
      tenantId: "tenant.local",
      boardId: "board.1",
    });
    expect(columns.map((column) => column.title)).toEqual(["Inbox", "Ready"]);
  });

  it("refuses to archive a column that still holds non-archived cards", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    await store.createColumn(makeColumn());
    await store.createCard(makeCard());

    await expect(
      store.archiveColumn({
        tenantId: "tenant.local",
        boardId: "board.1",
        columnId: "column.1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(KanbanValidationError);

    await store.archiveCard({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 1,
    });

    const archived = await store.archiveColumn({
      tenantId: "tenant.local",
      boardId: "board.1",
      columnId: "column.1",
      expectedVersion: 1,
    });
    expect(archived.archivedAt).not.toBeNull();
  });
});

describe("InMemoryKanbanStore — cards", () => {
  it("moves a card to a new column and position", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    await store.createColumn(makeColumn());
    await store.createColumn(
      makeColumn({ columnId: "column.2", title: "Understand" }),
    );
    await store.createCard(makeCard());

    const moved = await store.moveCard({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 1,
      toColumnId: "column.2",
      toPositionKey: nextPositionKey(null, null),
    });

    expect(moved.columnId).toBe("column.2");
    expect(moved.version).toBe(2);
  });

  it("is idempotent when re-seeding a card with a known sourceKey", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    await store.createColumn(makeColumn());
    await store.createCard(makeCard({ sourceKey: "legal-basis" }));
    const again = await store.createCard(
      makeCard({ cardId: "card.duplicate", sourceKey: "legal-basis" }),
    );

    const cards = await store.listCards({
      tenantId: "tenant.local",
      boardId: "board.1",
    });
    expect(cards).toHaveLength(1);
    expect(again.cardId).toBe("card.1");
  });

  it("bumps the parent card version when a checklist item is added, so a concurrent card edit is caught", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    await store.createColumn(makeColumn());
    await store.createCard(makeCard());

    const { card: afterChecklist } = await store.addChecklistItem({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 1,
      item: {
        itemId: "item.1",
        text: "Confirm Satzung reference",
        done: false,
        positionKey: nextPositionKey(null, null),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    expect(afterChecklist.version).toBe(2);

    await expect(
      store.updateCard({
        tenantId: "tenant.local",
        boardId: "board.1",
        cardId: "card.1",
        expectedVersion: 1,
        patch: { title: "Stale concurrent edit" },
      }),
    ).rejects.toBeInstanceOf(KanbanConflictError);

    const succeeded = await store.updateCard({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 2,
      patch: { title: "Legal basis (confirmed)" },
    });
    expect(succeeded.title).toBe("Legal basis (confirmed)");
  });

  it("bumps the parent card version when a reference is added", async () => {
    const store = new InMemoryKanbanStore();
    await store.createBoard(makeBoard());
    await store.createColumn(makeColumn());
    await store.createCard(makeCard());

    const { card, reference } = await store.addCardReference({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 1,
      reference: {
        referenceId: "ref.1",
        referenceKind: "url",
        referenceSystem: null,
        externalId: null,
        url: "https://example.org/satzung",
        metadata: {},
        createdAt: new Date().toISOString(),
      },
    });

    expect(card.version).toBe(2);
    expect(reference.referenceKind).toBe("url");

    const references = await store.listCardReferences({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
    });
    expect(references).toHaveLength(1);
  });
});
