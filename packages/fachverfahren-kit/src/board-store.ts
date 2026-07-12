// fachverfahren-kit/board-store — In-Memory-`BoardPort` für Storybook, Tests und die DEV-App.
// Spiegelt serverseitig dieselben Regeln (Version-Konflikte, Spalten-Archivierungssperre bei
// aktiven Karten), ohne HTTP — genau das DEV/PROD-Muster von `store.ts`/`VorgangPort`. Implementiert
// zusätzlich alle optionalen Trello-artigen Methoden (Labels, Checkliste, Kommentare, Spalte
// umbenennen) vollständig, damit die Storybook-UX-Arbeit nicht auf die Server-Routen warten muss.
import {
  BoardConflictError,
  type Board,
  type BoardCard,
  type BoardColumn,
  type BoardLabel,
  type BoardPort,
  type CardPatch,
  type CreateBoardInput,
  type CreateCardInput,
  type CreateColumnInput,
  type LabelColor,
  type UpdateColumnInput,
} from "./board-types.js";
import { nextPositionKey } from "./lib/position.js";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}.${counter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function appendKey(existingKeys: string[]): string {
  return nextPositionKey(existingKeys.at(-1) ?? null, null);
}

export interface BoardStoreSeed<TCardData = Record<string, unknown>> {
  boards?: Board[];
  columns?: BoardColumn[];
  cards?: BoardCard<TCardData>[];
}

export function createBoardStore<TCardData = Record<string, unknown>>(
  seed: BoardStoreSeed<TCardData> = {},
): BoardPort<TCardData> {
  const boards = new Map<string, Board>(
    (seed.boards ?? []).map((board) => [board.boardId, board]),
  );
  const columns = new Map<string, BoardColumn>(
    (seed.columns ?? []).map((column) => [column.columnId, column]),
  );
  const cards = new Map<string, BoardCard<TCardData>>(
    (seed.cards ?? []).map((card) => [card.cardId, card]),
  );

  function columnsFor(boardId: string): BoardColumn[] {
    return [...columns.values()]
      .filter((column) => column.boardId === boardId && !column.archivedAt)
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  function cardsFor(boardId: string): BoardCard<TCardData>[] {
    return [...cards.values()]
      .filter((card) => card.boardId === boardId && !card.archivedAt)
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  function requireBoard(boardId: string): Board {
    const board = boards.get(boardId);
    if (!board) throw new Error(`board "${boardId}" not found`);
    return board;
  }

  function requireCard(cardId: string): BoardCard<TCardData> {
    const card = cards.get(cardId);
    if (!card) throw new Error(`card "${cardId}" not found`);
    return card;
  }

  function assertVersion(
    resource: string,
    resourceId: string,
    current: number,
    expected: number,
  ): void {
    if (current !== expected) {
      throw new BoardConflictError(resource, resourceId);
    }
  }

  /** Child mutations (checklist/comments) bump the parent card's version — same rule as the
   *  real backend (kanban plan decision 11), so a concurrent card edit is still caught. */
  function bumpCard(cardId: string): BoardCard<TCardData> {
    const current = requireCard(cardId);
    const next = { ...current, version: current.version + 1 };
    cards.set(cardId, next);
    return next;
  }

  return {
    async listBoards() {
      return [...boards.values()].filter((board) => !board.archivedAt);
    },

    async getBoard(boardId) {
      const board = boards.get(boardId);
      if (!board) return undefined;
      return { board, columns: columnsFor(boardId), cards: cardsFor(boardId) };
    },

    async createBoard(input: CreateBoardInput) {
      const timestamp = nowIso();
      const board: Board = {
        boardId: nextId("board"),
        title: input.title,
        description: input.description ?? null,
        visibility: input.visibility ?? "personal",
        contentLocale: "de",
        version: 1,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        labels: [],
        members: [],
      };
      boards.set(board.boardId, board);
      return board;
    },

    async createColumn(boardId, input: CreateColumnInput) {
      const column: BoardColumn = {
        columnId: nextId("column"),
        boardId,
        title: input.title,
        positionKey: appendKey(columnsFor(boardId).map((c) => c.positionKey)),
        version: 1,
        archivedAt: null,
      };
      columns.set(column.columnId, column);
      return column;
    },

    async updateColumn(
      _boardId,
      columnId,
      expectedVersion,
      patch: UpdateColumnInput,
    ) {
      const current = columns.get(columnId);
      if (!current) throw new Error(`column "${columnId}" not found`);
      assertVersion("column", columnId, current.version, expectedVersion);
      const next: BoardColumn = {
        ...current,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.positionKey !== undefined
          ? { positionKey: patch.positionKey }
          : {}),
        version: current.version + 1,
      };
      columns.set(columnId, next);
      return next;
    },

    async archiveColumn(_boardId, columnId, expectedVersion) {
      const column = columns.get(columnId);
      if (!column) throw new Error(`column "${columnId}" not found`);
      assertVersion("column", columnId, column.version, expectedVersion);
      const hasActiveCards = [...cards.values()].some(
        (card) => card.columnId === columnId && !card.archivedAt,
      );
      if (hasActiveCards) {
        throw new Error(
          `column "${columnId}" still holds non-archived cards; move or archive them first`,
        );
      }
      const next = {
        ...column,
        archivedAt: nowIso(),
        version: column.version + 1,
      };
      columns.set(columnId, next);
      return next;
    },

    async createCard(boardId, input: CreateCardInput) {
      const card: BoardCard<TCardData> = {
        cardId: nextId("card"),
        boardId,
        columnId: input.columnId,
        title: input.title,
        descriptionMarkdown: input.descriptionMarkdown ?? null,
        kind: input.kind ?? "task",
        priority: input.priority ?? "normal",
        assigneeActorId: null,
        dueAt: null,
        blockedReason: null,
        positionKey: appendKey(
          cardsFor(boardId)
            .filter((c) => c.columnId === input.columnId)
            .map((c) => c.positionKey),
        ),
        labelIds: [],
        checklist: [],
        comments: [],
        version: 1,
        archivedAt: null,
      };
      cards.set(card.cardId, card);
      return card;
    },

    async updateCard(_boardId, cardId, expectedVersion, patch: CardPatch) {
      const current = requireCard(cardId);
      assertVersion("card", cardId, current.version, expectedVersion);
      const next = { ...current, ...patch, version: current.version + 1 };
      cards.set(cardId, next);
      return next;
    },

    async moveCard(
      _boardId,
      cardId,
      expectedVersion,
      toColumnId,
      toPositionKey,
    ) {
      const current = requireCard(cardId);
      assertVersion("card", cardId, current.version, expectedVersion);
      const positionKey =
        toPositionKey ??
        appendKey(
          [...cards.values()]
            .filter((c) => c.columnId === toColumnId && !c.archivedAt)
            .sort((a, b) => a.positionKey.localeCompare(b.positionKey))
            .map((c) => c.positionKey),
        );
      const next = {
        ...current,
        columnId: toColumnId,
        positionKey,
        version: current.version + 1,
      };
      cards.set(cardId, next);
      return next;
    },

    async archiveCard(_boardId, cardId, expectedVersion) {
      const current = requireCard(cardId);
      assertVersion("card", cardId, current.version, expectedVersion);
      const next = {
        ...current,
        archivedAt: nowIso(),
        version: current.version + 1,
      };
      cards.set(cardId, next);
      return next;
    },

    async restoreCard(_boardId, cardId, expectedVersion) {
      const current = requireCard(cardId);
      assertVersion("card", cardId, current.version, expectedVersion);
      const next = {
        ...current,
        archivedAt: null,
        version: current.version + 1,
      };
      cards.set(cardId, next);
      return next;
    },

    async createLabel(boardId, input: { name: string; color: LabelColor }) {
      const board = requireBoard(boardId);
      const label: BoardLabel = { labelId: nextId("label"), ...input };
      const next: Board = {
        ...board,
        labels: [...(board.labels ?? []), label],
      };
      boards.set(boardId, next);
      return label;
    },

    async addChecklistItem(_boardId, cardId, text) {
      const current = requireCard(cardId);
      const item = { itemId: nextId("item"), text, done: false };
      const next = { ...current, checklist: [...current.checklist, item] };
      cards.set(cardId, next);
      return bumpCard(cardId);
    },

    async toggleChecklistItem(_boardId, cardId, itemId) {
      const current = requireCard(cardId);
      const next = {
        ...current,
        checklist: current.checklist.map((item) =>
          item.itemId === itemId ? { ...item, done: !item.done } : item,
        ),
      };
      cards.set(cardId, next);
      return bumpCard(cardId);
    },

    async removeChecklistItem(_boardId, cardId, itemId) {
      const current = requireCard(cardId);
      const next = {
        ...current,
        checklist: current.checklist.filter((item) => item.itemId !== itemId),
      };
      cards.set(cardId, next);
      return bumpCard(cardId);
    },

    async addComment(_boardId, cardId, body) {
      const current = requireCard(cardId);
      const comment = {
        commentId: nextId("comment"),
        authorName: "Sie",
        body,
        createdAt: nowIso(),
      };
      const next = { ...current, comments: [...current.comments, comment] };
      cards.set(cardId, next);
      return bumpCard(cardId);
    },

    async listArchivedCards(boardId) {
      return [...cards.values()]
        .filter((card) => card.boardId === boardId && card.archivedAt)
        .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
    },
  };
}
