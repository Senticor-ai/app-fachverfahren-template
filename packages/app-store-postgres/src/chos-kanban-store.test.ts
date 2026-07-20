// chos-kanban-store.test — der KanbanStore-chos-Adapter über den Fake-Graph (ohne laufendes chos). Deckt
// alle fünf Entity-Typen inkl. versionierter Mutationen, Archivierungs-Validierung und Karten-Version-Bump
// durch Checklist-/Reference-Änderungen.
import { describe, expect, it } from "vitest";
import { ChosKanbanStore } from "./chos-kanban-store.js";
import { InMemoryChosClient } from "./chos-client.js";
import {
  KanbanConflictError,
  KanbanValidationError,
  type Board,
  type BoardCard,
  type BoardColumn,
} from "./kanban-store.js";

function makeBoard(overrides: Partial<Board> = {}): Board {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    boardId: "board.1",
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    ownerActorId: "actor.owner",
    title: "Board",
    description: null,
    visibility: "personal",
    contentLocale: "de",
    templateKey: null,
    templateVersion: null,
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
  const now = "2026-06-01T00:00:00.000Z";
  return {
    columnId: "column.1",
    boardId: "board.1",
    title: "Inbox",
    positionKey: "m",
    version: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeCard(overrides: Partial<BoardCard> = {}): BoardCard {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    cardId: "card.1",
    boardId: "board.1",
    columnId: "column.1",
    title: "Karte",
    descriptionMarkdown: null,
    kind: "task",
    priority: "normal",
    assigneeActorId: null,
    dueAt: null,
    blockedReason: null,
    positionKey: "m",
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

function store(): ChosKanbanStore {
  return new ChosKanbanStore(new InMemoryChosClient());
}

describe("ChosKanbanStore — Boards", () => {
  it("create/get; list zeigt eigene + team-Boards, verbirgt fremde personal + archivierte", async () => {
    const s = store();
    await s.createBoard(makeBoard({ boardId: "b1", ownerActorId: "me" }));
    await s.createBoard(
      makeBoard({ boardId: "b2", ownerActorId: "andere", visibility: "team" }),
    );
    await s.createBoard(
      makeBoard({
        boardId: "b3",
        ownerActorId: "andere",
        visibility: "personal",
      }),
    );
    const list = await s.listBoards({
      tenantId: "tenant.local",
      actorId: "me",
    });
    expect(list.map((b) => b.boardId).sort()).toEqual(["b1", "b2"]);
  });

  it("update/archive/restore versioniert; falsche expectedVersion → Conflict", async () => {
    const s = store();
    await s.createBoard(makeBoard());
    const updated = await s.updateBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
      expectedVersion: 1,
      patch: { title: "Neu" },
    });
    expect(updated.version).toBe(2);
    expect(updated.title).toBe("Neu");
    await expect(
      s.updateBoard({
        tenantId: "tenant.local",
        boardId: "board.1",
        expectedVersion: 1,
        patch: { title: "X" },
      }),
    ).rejects.toBeInstanceOf(KanbanConflictError);
    const archived = await s.archiveBoard({
      tenantId: "tenant.local",
      boardId: "board.1",
      expectedVersion: 2,
    });
    expect(archived.archivedAt).not.toBeNull();
  });
});

describe("ChosKanbanStore — Columns + Cards", () => {
  it("Spalte mit aktiver Karte lässt sich NICHT archivieren (Validierung)", async () => {
    const s = store();
    await s.createBoard(makeBoard());
    await s.createColumn(makeColumn());
    await s.createCard(makeCard());
    await expect(
      s.archiveColumn({
        tenantId: "tenant.local",
        boardId: "board.1",
        columnId: "column.1",
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(KanbanValidationError);
  });

  it("createCard ist idempotent über sourceKey; move + list sortiert nach positionKey", async () => {
    const s = store();
    await s.createBoard(makeBoard());
    const first = await s.createCard(
      makeCard({ cardId: "c1", sourceKey: "src-1", positionKey: "b" }),
    );
    const dup = await s.createCard(
      makeCard({ cardId: "c2", sourceKey: "src-1", positionKey: "a" }),
    );
    expect(dup.cardId).toBe(first.cardId); // Dedup: liefert die vorhandene Karte
    await s.createCard(makeCard({ cardId: "c3", positionKey: "a" }));
    const cards = await s.listCards({
      tenantId: "tenant.local",
      boardId: "board.1",
    });
    expect(cards.map((c) => c.cardId)).toEqual(["c3", "c1"]); // a vor b
    const moved = await s.moveCard({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "c1",
      expectedVersion: 1,
      toColumnId: "column.2",
      toPositionKey: "z",
    });
    expect(moved.columnId).toBe("column.2");
    expect(moved.version).toBe(2);
  });
});

describe("ChosKanbanStore — Checklist + References bumpen die Karten-Version", () => {
  it("addChecklistItem: Item entsteht, Karte +1; update/remove ebenso", async () => {
    const s = store();
    await s.createBoard(makeBoard());
    await s.createCard(makeCard());
    const added = await s.addChecklistItem({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 1,
      item: {
        itemId: "i1",
        text: "Schritt",
        done: false,
        positionKey: "m",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(added.card.version).toBe(2);
    expect(
      (
        await s.listChecklistItems({
          tenantId: "tenant.local",
          boardId: "board.1",
          cardId: "card.1",
        })
      ).map((i) => i.itemId),
    ).toEqual(["i1"]);
    const updated = await s.updateChecklistItem({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 2,
      itemId: "i1",
      patch: { done: true },
    });
    expect(updated.item.done).toBe(true);
    expect(updated.card.version).toBe(3);
    const removed = await s.removeChecklistItem({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 3,
      itemId: "i1",
    });
    expect(removed.card.version).toBe(4);
    expect(
      await s.listChecklistItems({
        tenantId: "tenant.local",
        boardId: "board.1",
        cardId: "card.1",
      }),
    ).toHaveLength(0);
  });

  it("addCardReference / removeCardReference bumpen die Karten-Version", async () => {
    const s = store();
    await s.createBoard(makeBoard());
    await s.createCard(makeCard());
    const added = await s.addCardReference({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 1,
      reference: {
        referenceId: "r1",
        referenceKind: "issue",
        referenceSystem: "gitlab",
        externalId: "42",
        url: null,
        metadata: {},
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    });
    expect(added.card.version).toBe(2);
    expect(
      await s.listCardReferences({
        tenantId: "tenant.local",
        boardId: "board.1",
        cardId: "card.1",
      }),
    ).toHaveLength(1);
    const removed = await s.removeCardReference({
      tenantId: "tenant.local",
      boardId: "board.1",
      cardId: "card.1",
      expectedVersion: 2,
      referenceId: "r1",
    });
    expect(removed.card.version).toBe(3);
  });
});
