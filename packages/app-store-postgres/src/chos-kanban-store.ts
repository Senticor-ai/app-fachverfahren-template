// chos-kanban-store — der KanbanStore-Adapter auf den chos-Graph-Store (SB-Workspace-Boards). Fünf Entity-
// Collections: Boards (Partition = tenantId), Columns/Cards (Partition = boardId), Checklist-Items/Card-
// References (Partition = cardId) — natürlich board-/karten-scoped. Versionierte Mutationen prüfen die
// erwartete Version in-store (Parität zu InMemory: read → assertVersion → putEntity); Checklist-/Reference-
// Änderungen bumpen die KARTEN-Version. Gewählt via APP_STORE_MODE=chos; Postgres bleibt der OSS-Default.
import { type ChosClient } from "./chos-client.js";
import {
  assertVersion,
  KanbanNotFoundError,
  KanbanValidationError,
  type Board,
  type BoardCard,
  type BoardColumn,
  type BoardPatch,
  type BoardScope,
  type BoardVisibility,
  type CardKind,
  type CardPatch,
  type CardPriority,
  type CardReference,
  type CardScope,
  type ChecklistItem,
  type ColumnPatch,
  type KanbanStore,
  type TenantScope,
  type VersionedMutation,
} from "./kanban-store.js";

const BOARDS = "kb_boards";
const COLUMNS = "kb_columns";
const CARDS = "kb_cards";
const CHECKLIST = "kb_checklist";
const REFERENCES = "kb_references";

function nowIso(): string {
  return new Date().toISOString();
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

// ─── (De-)Serialisierung ─────────────────────────────────────────────────
function bodyToBoard(body: Record<string, unknown>): Board {
  return {
    boardId: String(body["boardId"]),
    tenantId: String(body["tenantId"]),
    authorityId: String(body["authorityId"]),
    jurisdictionId: String(body["jurisdictionId"]),
    ownerActorId: String(body["ownerActorId"]),
    title: String(body["title"]),
    description: nullableString(body["description"]),
    visibility: String(body["visibility"]) as BoardVisibility,
    contentLocale: String(body["contentLocale"]),
    templateKey: nullableString(body["templateKey"]),
    templateVersion:
      body["templateVersion"] === null || body["templateVersion"] === undefined
        ? null
        : Number(body["templateVersion"]),
    purpose: nullableString(body["purpose"]),
    lifecycleStage: nullableString(body["lifecycleStage"]),
    version: Number(body["version"]),
    archivedAt: nullableString(body["archivedAt"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

function bodyToColumn(body: Record<string, unknown>): BoardColumn {
  return {
    columnId: String(body["columnId"]),
    boardId: String(body["boardId"]),
    title: String(body["title"]),
    positionKey: String(body["positionKey"]),
    version: Number(body["version"]),
    archivedAt: nullableString(body["archivedAt"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

function bodyToCard(body: Record<string, unknown>): BoardCard {
  return {
    cardId: String(body["cardId"]),
    boardId: String(body["boardId"]),
    columnId: String(body["columnId"]),
    title: String(body["title"]),
    descriptionMarkdown: nullableString(body["descriptionMarkdown"]),
    kind: String(body["kind"]) as CardKind,
    priority: String(body["priority"]) as CardPriority,
    assigneeActorId: nullableString(body["assigneeActorId"]),
    dueAt: nullableString(body["dueAt"]),
    blockedReason: nullableString(body["blockedReason"]),
    positionKey: String(body["positionKey"]),
    labels: Array.isArray(body["labels"])
      ? (body["labels"] as string[]).map(String)
      : [],
    sourceKey: nullableString(body["sourceKey"]),
    createdByActorId: nullableString(body["createdByActorId"]),
    version: Number(body["version"]),
    archivedAt: nullableString(body["archivedAt"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

function bodyToChecklistItem(body: Record<string, unknown>): ChecklistItem {
  return {
    itemId: String(body["itemId"]),
    cardId: String(body["cardId"]),
    text: String(body["text"]),
    done: body["done"] === true,
    positionKey: String(body["positionKey"]),
    createdAt: String(body["createdAt"]),
    updatedAt: String(body["updatedAt"]),
  };
}

function bodyToReference(body: Record<string, unknown>): CardReference {
  return {
    referenceId: String(body["referenceId"]),
    cardId: String(body["cardId"]),
    referenceKind: String(body["referenceKind"]),
    referenceSystem: nullableString(body["referenceSystem"]),
    externalId: nullableString(body["externalId"]),
    url: nullableString(body["url"]),
    metadata:
      body["metadata"] && typeof body["metadata"] === "object"
        ? (body["metadata"] as Record<string, unknown>)
        : {},
    createdAt: String(body["createdAt"]),
  };
}

function toBody<T extends object>(entity: T): Record<string, unknown> {
  return { ...entity } as Record<string, unknown>;
}

export class ChosKanbanStore implements KanbanStore {
  constructor(private readonly client: ChosClient) {}

  // ─── Boards ──────────────────────────────────────────────────────────
  async createBoard(board: Board): Promise<Board> {
    await this.client.putEntity({
      collection: BOARDS,
      tenantId: board.tenantId,
      id: board.boardId,
      version: board.version,
      body: toBody(board),
    });
    return { ...board };
  }

  async getBoard(input: BoardScope): Promise<Board | undefined> {
    const found = await this.client.getEntity({
      collection: BOARDS,
      tenantId: input.tenantId,
      id: input.boardId,
    });
    return found ? bodyToBoard(found.body) : undefined;
  }

  async listBoards(
    input: TenantScope & { actorId: string; includeArchived?: boolean },
  ): Promise<Board[]> {
    const all = await this.client.listEntities({
      collection: BOARDS,
      tenantId: input.tenantId,
    });
    return all
      .map((e) => bodyToBoard(e.body))
      .filter(
        (board) =>
          (board.ownerActorId === input.actorId ||
            board.visibility === "team") &&
          (input.includeArchived || board.archivedAt === null),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private async requireBoard(
    tenantId: string,
    boardId: string,
  ): Promise<Board> {
    const board = await this.getBoard({ tenantId, boardId });
    if (!board) throw new KanbanNotFoundError("board", boardId);
    return board;
  }

  private async putBoard(board: Board): Promise<Board> {
    await this.client.putEntity({
      collection: BOARDS,
      tenantId: board.tenantId,
      id: board.boardId,
      version: board.version,
      body: toBody(board),
    });
    return { ...board };
  }

  async updateBoard(
    input: BoardScope & VersionedMutation & { patch: BoardPatch },
  ): Promise<Board> {
    const current = await this.requireBoard(input.tenantId, input.boardId);
    assertVersion(
      "board",
      input.boardId,
      current.version,
      input.expectedVersion,
    );
    return this.putBoard({
      ...current,
      ...input.patch,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  async archiveBoard(input: BoardScope & VersionedMutation): Promise<Board> {
    return this.setBoardArchived(input, nowIso());
  }

  async restoreBoard(input: BoardScope & VersionedMutation): Promise<Board> {
    return this.setBoardArchived(input, null);
  }

  private async setBoardArchived(
    input: BoardScope & VersionedMutation,
    archivedAt: string | null,
  ): Promise<Board> {
    const current = await this.requireBoard(input.tenantId, input.boardId);
    assertVersion(
      "board",
      input.boardId,
      current.version,
      input.expectedVersion,
    );
    return this.putBoard({
      ...current,
      archivedAt,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  // ─── Columns (Partition = boardId) ─────────────────────────────────────
  async createColumn(column: BoardColumn): Promise<BoardColumn> {
    await this.client.putEntity({
      collection: COLUMNS,
      tenantId: column.boardId,
      id: column.columnId,
      version: column.version,
      body: toBody(column),
    });
    return { ...column };
  }

  async listColumns(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardColumn[]> {
    const all = await this.client.listEntities({
      collection: COLUMNS,
      tenantId: input.boardId,
    });
    return all
      .map((e) => bodyToColumn(e.body))
      .filter((column) => input.includeArchived || column.archivedAt === null)
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  private async requireColumn(
    boardId: string,
    columnId: string,
  ): Promise<BoardColumn> {
    const found = await this.client.getEntity({
      collection: COLUMNS,
      tenantId: boardId,
      id: columnId,
    });
    if (!found) throw new KanbanNotFoundError("column", columnId);
    const column = bodyToColumn(found.body);
    if (column.boardId !== boardId)
      throw new KanbanNotFoundError("column", columnId);
    return column;
  }

  private async putColumn(column: BoardColumn): Promise<BoardColumn> {
    await this.client.putEntity({
      collection: COLUMNS,
      tenantId: column.boardId,
      id: column.columnId,
      version: column.version,
      body: toBody(column),
    });
    return { ...column };
  }

  async updateColumn(
    input: BoardScope &
      VersionedMutation & { columnId: string; patch: ColumnPatch },
  ): Promise<BoardColumn> {
    const current = await this.requireColumn(input.boardId, input.columnId);
    assertVersion(
      "column",
      input.columnId,
      current.version,
      input.expectedVersion,
    );
    return this.putColumn({
      ...current,
      ...input.patch,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  async archiveColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn> {
    const cards = await this.client.listEntities({
      collection: CARDS,
      tenantId: input.boardId,
    });
    const hasActiveCards = cards
      .map((e) => bodyToCard(e.body))
      .some(
        (card) => card.columnId === input.columnId && card.archivedAt === null,
      );
    if (hasActiveCards)
      throw new KanbanValidationError(
        `column "${input.columnId}" still holds non-archived cards; move or archive them first`,
      );
    return this.setColumnArchived(input, nowIso());
  }

  async restoreColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn> {
    return this.setColumnArchived(input, null);
  }

  private async setColumnArchived(
    input: BoardScope & VersionedMutation & { columnId: string },
    archivedAt: string | null,
  ): Promise<BoardColumn> {
    const current = await this.requireColumn(input.boardId, input.columnId);
    assertVersion(
      "column",
      input.columnId,
      current.version,
      input.expectedVersion,
    );
    return this.putColumn({
      ...current,
      archivedAt,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  // ─── Cards (Partition = boardId) ───────────────────────────────────────
  async createCard(card: BoardCard): Promise<BoardCard> {
    if (card.sourceKey) {
      const existing = await this.client.listEntities({
        collection: CARDS,
        tenantId: card.boardId,
      });
      const duplicate = existing
        .map((e) => bodyToCard(e.body))
        .find((c) => c.sourceKey === card.sourceKey);
      if (duplicate) return duplicate;
    }
    await this.putCard(card);
    return { ...card };
  }

  async getCard(input: CardScope): Promise<BoardCard | undefined> {
    const found = await this.client.getEntity({
      collection: CARDS,
      tenantId: input.boardId,
      id: input.cardId,
    });
    if (!found) return undefined;
    const card = bodyToCard(found.body);
    return card.boardId === input.boardId ? card : undefined;
  }

  async listCards(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardCard[]> {
    const all = await this.client.listEntities({
      collection: CARDS,
      tenantId: input.boardId,
    });
    return all
      .map((e) => bodyToCard(e.body))
      .filter((card) => input.includeArchived || card.archivedAt === null)
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  private async requireCard(
    boardId: string,
    cardId: string,
  ): Promise<BoardCard> {
    const card = await this.getCard({ tenantId: "", boardId, cardId });
    if (!card) throw new KanbanNotFoundError("card", cardId);
    return card;
  }

  private async putCard(card: BoardCard): Promise<BoardCard> {
    await this.client.putEntity({
      collection: CARDS,
      tenantId: card.boardId,
      id: card.cardId,
      version: card.version,
      body: toBody(card),
    });
    return { ...card };
  }

  async updateCard(
    input: CardScope & VersionedMutation & { patch: CardPatch },
  ): Promise<BoardCard> {
    const current = await this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    return this.putCard({
      ...current,
      ...input.patch,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  async moveCard(
    input: CardScope &
      VersionedMutation & { toColumnId: string; toPositionKey: string },
  ): Promise<BoardCard> {
    const current = await this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    return this.putCard({
      ...current,
      columnId: input.toColumnId,
      positionKey: input.toPositionKey,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  async archiveCard(input: CardScope & VersionedMutation): Promise<BoardCard> {
    return this.setCardArchived(input, nowIso());
  }

  async restoreCard(input: CardScope & VersionedMutation): Promise<BoardCard> {
    return this.setCardArchived(input, null);
  }

  private async setCardArchived(
    input: CardScope & VersionedMutation,
    archivedAt: string | null,
  ): Promise<BoardCard> {
    const current = await this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    return this.putCard({
      ...current,
      archivedAt,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  private async bumpCardVersion(
    input: CardScope & VersionedMutation,
  ): Promise<BoardCard> {
    const current = await this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    return this.putCard({
      ...current,
      version: current.version + 1,
      updatedAt: nowIso(),
    });
  }

  // ─── Checklist-Items (Partition = cardId) ──────────────────────────────
  async listChecklistItems(input: CardScope): Promise<ChecklistItem[]> {
    const all = await this.client.listEntities({
      collection: CHECKLIST,
      tenantId: input.cardId,
    });
    return all
      .map((e) => bodyToChecklistItem(e.body))
      .filter((item) => item.cardId === input.cardId)
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  async addChecklistItem(
    input: CardScope &
      VersionedMutation & { item: Omit<ChecklistItem, "cardId"> },
  ): Promise<{ item: ChecklistItem; card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    const item: ChecklistItem = { ...input.item, cardId: input.cardId };
    await this.client.putEntity({
      collection: CHECKLIST,
      tenantId: input.cardId,
      id: item.itemId,
      version: 1,
      body: toBody(item),
    });
    return { item: { ...item }, card };
  }

  async updateChecklistItem(
    input: CardScope &
      VersionedMutation & {
        itemId: string;
        patch: { text?: string; done?: boolean; positionKey?: string };
      },
  ): Promise<{ item: ChecklistItem; card: BoardCard }> {
    const found = await this.client.getEntity({
      collection: CHECKLIST,
      tenantId: input.cardId,
      id: input.itemId,
    });
    if (!found) throw new KanbanNotFoundError("checklist item", input.itemId);
    const current = bodyToChecklistItem(found.body);
    if (current.cardId !== input.cardId)
      throw new KanbanNotFoundError("checklist item", input.itemId);
    const card = await this.bumpCardVersion(input);
    const next: ChecklistItem = {
      ...current,
      ...input.patch,
      updatedAt: nowIso(),
    };
    await this.client.putEntity({
      collection: CHECKLIST,
      tenantId: input.cardId,
      id: input.itemId,
      version: 1,
      body: toBody(next),
    });
    return { item: { ...next }, card };
  }

  async removeChecklistItem(
    input: CardScope & VersionedMutation & { itemId: string },
  ): Promise<{ card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    await this.client.transact({
      deletes: [
        { collection: CHECKLIST, tenantId: input.cardId, id: input.itemId },
      ],
    });
    return { card };
  }

  // ─── Card-References (Partition = cardId) ──────────────────────────────
  async listCardReferences(input: CardScope): Promise<CardReference[]> {
    const all = await this.client.listEntities({
      collection: REFERENCES,
      tenantId: input.cardId,
    });
    return all
      .map((e) => bodyToReference(e.body))
      .filter((reference) => reference.cardId === input.cardId);
  }

  async addCardReference(
    input: CardScope &
      VersionedMutation & { reference: Omit<CardReference, "cardId"> },
  ): Promise<{ reference: CardReference; card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    const reference: CardReference = {
      ...input.reference,
      cardId: input.cardId,
    };
    await this.client.putEntity({
      collection: REFERENCES,
      tenantId: input.cardId,
      id: reference.referenceId,
      version: 1,
      body: toBody(reference),
    });
    return { reference: { ...reference }, card };
  }

  async removeCardReference(
    input: CardScope & VersionedMutation & { referenceId: string },
  ): Promise<{ card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    await this.client.transact({
      deletes: [
        {
          collection: REFERENCES,
          tenantId: input.cardId,
          id: input.referenceId,
        },
      ],
    });
    return { card };
  }
}
