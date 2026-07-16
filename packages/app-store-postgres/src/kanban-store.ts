import { createPgClient, type PgClient } from "./client.js";

export type BoardVisibility = "personal" | "team";

export interface Board {
  boardId: string;
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  ownerActorId: string;
  title: string;
  description: string | null;
  visibility: BoardVisibility;
  contentLocale: string;
  templateKey: string | null;
  templateVersion: number | null;
  /** Wozu dient das Board (z.B. "requirements-discovery", "personal-tasks") — macht den
   *  Board-Katalog erweiterbar (security-review/audit/betrieb), ohne neue Produkte zu bauen. */
  purpose: string | null;
  /** Phase im Progressive-Evolution-Modell (z.B. "design", "build", "operate"). */
  lifecycleStage: string | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardPatch {
  title?: string;
  description?: string | null;
  visibility?: BoardVisibility;
}

export interface BoardColumn {
  columnId: string;
  boardId: string;
  title: string;
  positionKey: string;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ColumnPatch {
  title?: string;
  positionKey?: string;
}

export type CardKind =
  | "question"
  | "hypothesis"
  | "research"
  | "decision"
  | "feature"
  | "task"
  | "risk"
  | "defect";

export type CardPriority = "low" | "normal" | "high" | "critical";

export interface BoardCard {
  cardId: string;
  boardId: string;
  columnId: string;
  title: string;
  descriptionMarkdown: string | null;
  kind: CardKind;
  priority: CardPriority;
  assigneeActorId: string | null;
  dueAt: string | null;
  blockedReason: string | null;
  positionKey: string;
  labels: string[];
  sourceKey: string | null;
  /** NULL nach Konto-Löschung des Erstellers (FK ON DELETE SET NULL) — die Karte
   *  überlebt anonymisiert. */
  createdByActorId: string | null;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardPatch {
  title?: string;
  descriptionMarkdown?: string | null;
  kind?: CardKind;
  priority?: CardPriority;
  assigneeActorId?: string | null;
  dueAt?: string | null;
  blockedReason?: string | null;
  labels?: string[];
}

export interface ChecklistItem {
  itemId: string;
  cardId: string;
  text: string;
  done: boolean;
  positionKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface CardReference {
  referenceId: string;
  cardId: string;
  referenceKind: string;
  referenceSystem: string | null;
  externalId: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface TenantScope {
  tenantId: string;
}

export interface BoardScope extends TenantScope {
  boardId: string;
}

export interface CardScope extends BoardScope {
  cardId: string;
}

export interface VersionedMutation {
  expectedVersion: number;
}

export class KanbanConflictError extends Error {
  constructor(
    public readonly resource: string,
    public readonly resourceId: string,
    public readonly expectedVersion: number,
  ) {
    super(
      `version conflict on ${resource} "${resourceId}": expected version ${expectedVersion}`,
    );
    this.name = "KanbanConflictError";
  }
}

export class KanbanNotFoundError extends Error {
  constructor(resource: string, resourceId: string) {
    super(`${resource} "${resourceId}" not found`);
    this.name = "KanbanNotFoundError";
  }
}

export class KanbanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KanbanValidationError";
  }
}

export interface KanbanStore {
  createBoard(board: Board): Promise<Board>;
  getBoard(input: BoardScope): Promise<Board | undefined>;
  /** Sichtbarkeit für einen Actor: eigene Boards PLUS team-sichtbare Boards des Tenants.
   *  (Bewusst `actorId` statt `ownerActorId` — es ist der anfragende Actor, nicht der Owner.) */
  listBoards(
    input: TenantScope & { actorId: string; includeArchived?: boolean },
  ): Promise<Board[]>;
  updateBoard(
    input: BoardScope & VersionedMutation & { patch: BoardPatch },
  ): Promise<Board>;
  archiveBoard(input: BoardScope & VersionedMutation): Promise<Board>;
  restoreBoard(input: BoardScope & VersionedMutation): Promise<Board>;

  createColumn(column: BoardColumn): Promise<BoardColumn>;
  listColumns(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardColumn[]>;
  updateColumn(
    input: BoardScope &
      VersionedMutation & { columnId: string; patch: ColumnPatch },
  ): Promise<BoardColumn>;
  archiveColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn>;
  restoreColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn>;

  createCard(card: BoardCard): Promise<BoardCard>;
  getCard(input: CardScope): Promise<BoardCard | undefined>;
  listCards(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardCard[]>;
  updateCard(
    input: CardScope & VersionedMutation & { patch: CardPatch },
  ): Promise<BoardCard>;
  moveCard(
    input: CardScope &
      VersionedMutation & { toColumnId: string; toPositionKey: string },
  ): Promise<BoardCard>;
  archiveCard(input: CardScope & VersionedMutation): Promise<BoardCard>;
  restoreCard(input: CardScope & VersionedMutation): Promise<BoardCard>;

  listChecklistItems(input: CardScope): Promise<ChecklistItem[]>;
  addChecklistItem(
    input: CardScope &
      VersionedMutation & {
        item: Omit<ChecklistItem, "cardId">;
      },
  ): Promise<{ item: ChecklistItem; card: BoardCard }>;
  updateChecklistItem(
    input: CardScope &
      VersionedMutation & {
        itemId: string;
        patch: { text?: string; done?: boolean; positionKey?: string };
      },
  ): Promise<{ item: ChecklistItem; card: BoardCard }>;
  removeChecklistItem(
    input: CardScope & VersionedMutation & { itemId: string },
  ): Promise<{ card: BoardCard }>;

  listCardReferences(input: CardScope): Promise<CardReference[]>;
  addCardReference(
    input: CardScope &
      VersionedMutation & {
        reference: Omit<CardReference, "cardId">;
      },
  ): Promise<{ reference: CardReference; card: BoardCard }>;
  removeCardReference(
    input: CardScope & VersionedMutation & { referenceId: string },
  ): Promise<{ card: BoardCard }>;
}

// ─── InMemory ────────────────────────────────────────────────────────────

export class InMemoryKanbanStore implements KanbanStore {
  private readonly boards = new Map<string, Board>();
  private readonly columns = new Map<string, BoardColumn>();
  private readonly cards = new Map<string, BoardCard>();
  private readonly checklistItems = new Map<string, ChecklistItem>();
  private readonly references = new Map<string, CardReference>();

  async createBoard(board: Board): Promise<Board> {
    this.boards.set(boardKey(board.tenantId, board.boardId), { ...board });
    return { ...board };
  }

  async getBoard(input: BoardScope): Promise<Board | undefined> {
    const board = this.boards.get(boardKey(input.tenantId, input.boardId));
    return board ? { ...board } : undefined;
  }

  async listBoards(
    input: TenantScope & { actorId: string; includeArchived?: boolean },
  ): Promise<Board[]> {
    return [...this.boards.values()]
      .filter(
        (board) =>
          board.tenantId === input.tenantId &&
          (board.ownerActorId === input.actorId ||
            board.visibility === "team") &&
          (input.includeArchived || board.archivedAt === null),
      )
      .map((board) => ({ ...board }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateBoard(
    input: BoardScope & VersionedMutation & { patch: BoardPatch },
  ): Promise<Board> {
    const current = this.requireBoard(input.tenantId, input.boardId);
    assertVersion(
      "board",
      input.boardId,
      current.version,
      input.expectedVersion,
    );
    const next: Board = {
      ...current,
      ...input.patch,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.boards.set(boardKey(input.tenantId, input.boardId), next);
    return { ...next };
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
    const current = this.requireBoard(input.tenantId, input.boardId);
    assertVersion(
      "board",
      input.boardId,
      current.version,
      input.expectedVersion,
    );
    const next: Board = {
      ...current,
      archivedAt,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.boards.set(boardKey(input.tenantId, input.boardId), next);
    return { ...next };
  }

  async createColumn(column: BoardColumn): Promise<BoardColumn> {
    this.columns.set(column.columnId, { ...column });
    return { ...column };
  }

  async listColumns(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardColumn[]> {
    return [...this.columns.values()]
      .filter(
        (column) =>
          column.boardId === input.boardId &&
          (input.includeArchived || column.archivedAt === null),
      )
      .map((column) => ({ ...column }))
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  async updateColumn(
    input: BoardScope &
      VersionedMutation & { columnId: string; patch: ColumnPatch },
  ): Promise<BoardColumn> {
    const current = this.requireColumn(input.boardId, input.columnId);
    assertVersion(
      "column",
      input.columnId,
      current.version,
      input.expectedVersion,
    );
    const next: BoardColumn = {
      ...current,
      ...input.patch,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.columns.set(input.columnId, next);
    return { ...next };
  }

  async archiveColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn> {
    const hasActiveCards = [...this.cards.values()].some(
      (card) => card.columnId === input.columnId && card.archivedAt === null,
    );
    if (hasActiveCards) {
      throw new KanbanValidationError(
        `column "${input.columnId}" still holds non-archived cards; move or archive them first`,
      );
    }
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
    const current = this.requireColumn(input.boardId, input.columnId);
    assertVersion(
      "column",
      input.columnId,
      current.version,
      input.expectedVersion,
    );
    const next: BoardColumn = {
      ...current,
      archivedAt,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.columns.set(input.columnId, next);
    return { ...next };
  }

  async createCard(card: BoardCard): Promise<BoardCard> {
    if (card.sourceKey) {
      const duplicate = [...this.cards.values()].find(
        (existing) =>
          existing.boardId === card.boardId &&
          existing.sourceKey === card.sourceKey,
      );
      if (duplicate) {
        return { ...duplicate };
      }
    }
    this.cards.set(card.cardId, { ...card });
    return { ...card };
  }

  async getCard(input: CardScope): Promise<BoardCard | undefined> {
    const card = this.cards.get(input.cardId);
    return card && card.boardId === input.boardId ? { ...card } : undefined;
  }

  async listCards(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardCard[]> {
    return [...this.cards.values()]
      .filter(
        (card) =>
          card.boardId === input.boardId &&
          (input.includeArchived || card.archivedAt === null),
      )
      .map((card) => ({ ...card }))
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  async updateCard(
    input: CardScope & VersionedMutation & { patch: CardPatch },
  ): Promise<BoardCard> {
    const current = this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    const next: BoardCard = {
      ...current,
      ...input.patch,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.cards.set(input.cardId, next);
    return { ...next };
  }

  async moveCard(
    input: CardScope &
      VersionedMutation & { toColumnId: string; toPositionKey: string },
  ): Promise<BoardCard> {
    const current = this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    const next: BoardCard = {
      ...current,
      columnId: input.toColumnId,
      positionKey: input.toPositionKey,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.cards.set(input.cardId, next);
    return { ...next };
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
    const current = this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    const next: BoardCard = {
      ...current,
      archivedAt,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.cards.set(input.cardId, next);
    return { ...next };
  }

  async listChecklistItems(input: CardScope): Promise<ChecklistItem[]> {
    return [...this.checklistItems.values()]
      .filter((item) => item.cardId === input.cardId)
      .map((item) => ({ ...item }))
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));
  }

  async addChecklistItem(
    input: CardScope &
      VersionedMutation & { item: Omit<ChecklistItem, "cardId"> },
  ): Promise<{ item: ChecklistItem; card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    const item: ChecklistItem = { ...input.item, cardId: input.cardId };
    this.checklistItems.set(item.itemId, item);
    return { item: { ...item }, card };
  }

  async updateChecklistItem(
    input: CardScope &
      VersionedMutation & {
        itemId: string;
        patch: { text?: string; done?: boolean; positionKey?: string };
      },
  ): Promise<{ item: ChecklistItem; card: BoardCard }> {
    const current = this.checklistItems.get(input.itemId);
    if (!current || current.cardId !== input.cardId) {
      throw new KanbanNotFoundError("checklist item", input.itemId);
    }
    const card = await this.bumpCardVersion(input);
    const next: ChecklistItem = {
      ...current,
      ...input.patch,
      updatedAt: nowIso(),
    };
    this.checklistItems.set(input.itemId, next);
    return { item: { ...next }, card };
  }

  async removeChecklistItem(
    input: CardScope & VersionedMutation & { itemId: string },
  ): Promise<{ card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    this.checklistItems.delete(input.itemId);
    return { card };
  }

  async listCardReferences(input: CardScope): Promise<CardReference[]> {
    return [...this.references.values()]
      .filter((reference) => reference.cardId === input.cardId)
      .map((reference) => ({ ...reference }));
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
    this.references.set(reference.referenceId, reference);
    return { reference: { ...reference }, card };
  }

  async removeCardReference(
    input: CardScope & VersionedMutation & { referenceId: string },
  ): Promise<{ card: BoardCard }> {
    const card = await this.bumpCardVersion(input);
    this.references.delete(input.referenceId);
    return { card };
  }

  private async bumpCardVersion(
    input: CardScope & VersionedMutation,
  ): Promise<BoardCard> {
    const current = this.requireCard(input.boardId, input.cardId);
    assertVersion("card", input.cardId, current.version, input.expectedVersion);
    const next: BoardCard = {
      ...current,
      version: current.version + 1,
      updatedAt: nowIso(),
    };
    this.cards.set(input.cardId, next);
    return { ...next };
  }

  private requireBoard(tenantId: string, boardId: string): Board {
    const board = this.boards.get(boardKey(tenantId, boardId));
    if (!board) {
      throw new KanbanNotFoundError("board", boardId);
    }
    return board;
  }

  private requireColumn(boardId: string, columnId: string): BoardColumn {
    const column = this.columns.get(columnId);
    if (!column || column.boardId !== boardId) {
      throw new KanbanNotFoundError("column", columnId);
    }
    return column;
  }

  private requireCard(boardId: string, cardId: string): BoardCard {
    const card = this.cards.get(cardId);
    if (!card || card.boardId !== boardId) {
      throw new KanbanNotFoundError("card", cardId);
    }
    return card;
  }
}

function assertVersion(
  resource: string,
  resourceId: string,
  currentVersion: number,
  expectedVersion: number,
): void {
  if (currentVersion !== expectedVersion) {
    throw new KanbanConflictError(resource, resourceId, expectedVersion);
  }
}

function boardKey(tenantId: string, boardId: string): string {
  return `${tenantId}:${boardId}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Unavailable ─────────────────────────────────────────────────────────

export class UnavailableKanbanStore implements KanbanStore {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new Error(this.reason);
  }

  async createBoard(): Promise<Board> {
    this.fail();
  }
  async getBoard(): Promise<Board | undefined> {
    this.fail();
  }
  async listBoards(): Promise<Board[]> {
    this.fail();
  }
  async updateBoard(): Promise<Board> {
    this.fail();
  }
  async archiveBoard(): Promise<Board> {
    this.fail();
  }
  async restoreBoard(): Promise<Board> {
    this.fail();
  }
  async createColumn(): Promise<BoardColumn> {
    this.fail();
  }
  async listColumns(): Promise<BoardColumn[]> {
    this.fail();
  }
  async updateColumn(): Promise<BoardColumn> {
    this.fail();
  }
  async archiveColumn(): Promise<BoardColumn> {
    this.fail();
  }
  async restoreColumn(): Promise<BoardColumn> {
    this.fail();
  }
  async createCard(): Promise<BoardCard> {
    this.fail();
  }
  async getCard(): Promise<BoardCard | undefined> {
    this.fail();
  }
  async listCards(): Promise<BoardCard[]> {
    this.fail();
  }
  async updateCard(): Promise<BoardCard> {
    this.fail();
  }
  async moveCard(): Promise<BoardCard> {
    this.fail();
  }
  async archiveCard(): Promise<BoardCard> {
    this.fail();
  }
  async restoreCard(): Promise<BoardCard> {
    this.fail();
  }
  async listChecklistItems(): Promise<ChecklistItem[]> {
    this.fail();
  }
  async addChecklistItem(): Promise<{ item: ChecklistItem; card: BoardCard }> {
    this.fail();
  }
  async updateChecklistItem(): Promise<{
    item: ChecklistItem;
    card: BoardCard;
  }> {
    this.fail();
  }
  async removeChecklistItem(): Promise<{ card: BoardCard }> {
    this.fail();
  }
  async listCardReferences(): Promise<CardReference[]> {
    this.fail();
  }
  async addCardReference(): Promise<{
    reference: CardReference;
    card: BoardCard;
  }> {
    this.fail();
  }
  async removeCardReference(): Promise<{ card: BoardCard }> {
    this.fail();
  }
}

export function createKanbanStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): KanbanStore {
  // Ephemerer Preview-/Dev-Store (s. createAuthStoreFromEnv): APP_STORE_MODE=memory → prozess-lokaler In-Memory-Store.
  if (env["APP_STORE_MODE"] === "memory") return new InMemoryKanbanStore();
  const databaseUrl = env["APP_PG_URL"] ?? env["APP_PG_DIRECT_URL"];
  return databaseUrl
    ? new PostgresKanbanStore(databaseUrl)
    : new UnavailableKanbanStore(
        "APP_PG_URL or APP_PG_DIRECT_URL is required for kanban data",
      );
}

// ─── Postgres ────────────────────────────────────────────────────────────

interface BoardRow extends Record<string, unknown> {
  board_id: string;
  tenant_id: string;
  authority_id: string;
  jurisdiction_id: string;
  owner_actor_id: string;
  title: string;
  description: string | null;
  visibility: BoardVisibility;
  content_locale: string;
  template_key: string | null;
  template_version: number | null;
  purpose: string | null;
  lifecycle_stage: string | null;
  version: number;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ColumnRow extends Record<string, unknown> {
  column_id: string;
  board_id: string;
  title: string;
  position_key: string;
  version: number;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CardRow extends Record<string, unknown> {
  card_id: string;
  board_id: string;
  column_id: string;
  title: string;
  description_markdown: string | null;
  kind: CardKind;
  priority: CardPriority;
  assignee_actor_id: string | null;
  due_at: Date | string | null;
  blocked_reason: string | null;
  position_key: string;
  labels: string[];
  source_key: string | null;
  created_by_actor_id: string | null;
  version: number;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ChecklistItemRow extends Record<string, unknown> {
  item_id: string;
  card_id: string;
  text: string;
  done: boolean;
  position_key: string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReferenceRow extends Record<string, unknown> {
  reference_id: string;
  card_id: string;
  reference_kind: string;
  reference_system: string | null;
  external_id: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
  created_at: Date | string;
}

export class PostgresKanbanStore implements KanbanStore {
  constructor(private readonly databaseUrl: string) {}

  async createBoard(board: Board): Promise<Board> {
    return this.withClient(async (client) => {
      const result = await client.query<BoardRow>(
        `
          INSERT INTO app_boards (
            board_id, tenant_id, authority_id, jurisdiction_id, owner_actor_id,
            title, description, visibility, content_locale, template_key,
            template_version, purpose, lifecycle_stage, version, archived_at,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          RETURNING *
        `,
        [
          board.boardId,
          board.tenantId,
          board.authorityId,
          board.jurisdictionId,
          board.ownerActorId,
          board.title,
          board.description,
          board.visibility,
          board.contentLocale,
          board.templateKey,
          board.templateVersion,
          board.purpose,
          board.lifecycleStage,
          board.version,
          board.archivedAt,
          board.createdAt,
          board.updatedAt,
        ],
      );
      return boardFromRow(requireRow(result.rows, "board", board.boardId));
    });
  }

  async getBoard(input: BoardScope): Promise<Board | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<BoardRow>(
        `SELECT * FROM app_boards WHERE tenant_id = $1 AND board_id = $2`,
        [input.tenantId, input.boardId],
      );
      const row = result.rows[0];
      return row ? boardFromRow(row) : undefined;
    });
  }

  async listBoards(
    input: TenantScope & { actorId: string; includeArchived?: boolean },
  ): Promise<Board[]> {
    return this.withClient(async (client) => {
      const result = await client.query<BoardRow>(
        `
          SELECT * FROM app_boards
          WHERE tenant_id = $1
            AND (owner_actor_id = $2 OR visibility = 'team')
            AND ($3::boolean OR archived_at IS NULL)
          ORDER BY created_at DESC
        `,
        [input.tenantId, input.actorId, Boolean(input.includeArchived)],
      );
      return result.rows.map(boardFromRow);
    });
  }

  async updateBoard(
    input: BoardScope & VersionedMutation & { patch: BoardPatch },
  ): Promise<Board> {
    return this.withVersionedUpdate(
      "board",
      input.boardId,
      input.expectedVersion,
      (client) =>
        client.query<BoardRow>(
          `
            UPDATE app_boards
            SET title = COALESCE($4, title),
                description = CASE WHEN $5::boolean THEN $6 ELSE description END,
                visibility = COALESCE($7, visibility),
                version = version + 1,
                updated_at = now()
            WHERE tenant_id = $1 AND board_id = $2 AND version = $3
            RETURNING *
          `,
          [
            input.tenantId,
            input.boardId,
            input.expectedVersion,
            input.patch.title ?? null,
            "description" in input.patch,
            input.patch.description ?? null,
            input.patch.visibility ?? null,
          ],
        ),
      boardFromRow,
    );
  }

  async archiveBoard(input: BoardScope & VersionedMutation): Promise<Board> {
    return this.setBoardArchived(input, true);
  }

  async restoreBoard(input: BoardScope & VersionedMutation): Promise<Board> {
    return this.setBoardArchived(input, false);
  }

  private async setBoardArchived(
    input: BoardScope & VersionedMutation,
    archived: boolean,
  ): Promise<Board> {
    return this.withVersionedUpdate(
      "board",
      input.boardId,
      input.expectedVersion,
      (client) =>
        client.query<BoardRow>(
          `
            UPDATE app_boards
            SET archived_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
                version = version + 1,
                updated_at = now()
            WHERE tenant_id = $1 AND board_id = $2 AND version = $3
            RETURNING *
          `,
          [input.tenantId, input.boardId, input.expectedVersion, archived],
        ),
      boardFromRow,
    );
  }

  async createColumn(column: BoardColumn): Promise<BoardColumn> {
    return this.withClient(async (client) => {
      const result = await client.query<ColumnRow>(
        `
          INSERT INTO app_board_columns (
            column_id, board_id, title, position_key, version, archived_at,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `,
        [
          column.columnId,
          column.boardId,
          column.title,
          column.positionKey,
          column.version,
          column.archivedAt,
          column.createdAt,
          column.updatedAt,
        ],
      );
      return columnFromRow(requireRow(result.rows, "column", column.columnId));
    });
  }

  async listColumns(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardColumn[]> {
    return this.withClient(async (client) => {
      const result = await client.query<ColumnRow>(
        `
          SELECT * FROM app_board_columns
          WHERE board_id = $1 AND ($2::boolean OR archived_at IS NULL)
          ORDER BY position_key ASC
        `,
        [input.boardId, Boolean(input.includeArchived)],
      );
      return result.rows.map(columnFromRow);
    });
  }

  async updateColumn(
    input: BoardScope &
      VersionedMutation & { columnId: string; patch: ColumnPatch },
  ): Promise<BoardColumn> {
    return this.withVersionedUpdate(
      "column",
      input.columnId,
      input.expectedVersion,
      (client) =>
        client.query<ColumnRow>(
          `
            UPDATE app_board_columns
            SET title = COALESCE($4, title),
                position_key = COALESCE($5, position_key),
                version = version + 1,
                updated_at = now()
            WHERE board_id = $1 AND column_id = $2 AND version = $3
            RETURNING *
          `,
          [
            input.boardId,
            input.columnId,
            input.expectedVersion,
            input.patch.title ?? null,
            input.patch.positionKey ?? null,
          ],
        ),
      columnFromRow,
    );
  }

  async archiveColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn> {
    return this.withClient(async (client) => {
      const activeCards = await client.query(
        `
          SELECT 1 FROM app_board_cards
          WHERE column_id = $1 AND archived_at IS NULL
          LIMIT 1
        `,
        [input.columnId],
      );
      if (activeCards.rows.length > 0) {
        throw new KanbanValidationError(
          `column "${input.columnId}" still holds non-archived cards; move or archive them first`,
        );
      }
      return this.setColumnArchivedWithClient(client, input, true);
    });
  }

  async restoreColumn(
    input: BoardScope & VersionedMutation & { columnId: string },
  ): Promise<BoardColumn> {
    return this.withClient((client) =>
      this.setColumnArchivedWithClient(client, input, false),
    );
  }

  private async setColumnArchivedWithClient(
    client: PgClient,
    input: BoardScope & VersionedMutation & { columnId: string },
    archived: boolean,
  ): Promise<BoardColumn> {
    const result = await client.query<ColumnRow>(
      `
        UPDATE app_board_columns
        SET archived_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
            version = version + 1,
            updated_at = now()
        WHERE board_id = $1 AND column_id = $2 AND version = $3
        RETURNING *
      `,
      [input.boardId, input.columnId, input.expectedVersion, archived],
    );
    const row = result.rows[0];
    if (!row) {
      await this.assertExistsOrThrowConflict(
        client,
        "app_board_columns",
        "column_id",
        input.columnId,
        "column",
        input.expectedVersion,
      );
    }
    return columnFromRow(requireRow(result.rows, "column", input.columnId));
  }

  async createCard(card: BoardCard): Promise<BoardCard> {
    return this.withClient(async (client) => {
      const result = await client.query<CardRow>(
        `
          INSERT INTO app_board_cards (
            card_id, board_id, column_id, title, description_markdown, kind,
            priority, assignee_actor_id, due_at, blocked_reason, position_key,
            labels, source_key, created_by_actor_id, version, archived_at,
            created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          ON CONFLICT (board_id, source_key) WHERE source_key IS NOT NULL
          DO UPDATE SET board_id = EXCLUDED.board_id
          RETURNING *
        `,
        [
          card.cardId,
          card.boardId,
          card.columnId,
          card.title,
          card.descriptionMarkdown,
          card.kind,
          card.priority,
          card.assigneeActorId,
          card.dueAt,
          card.blockedReason,
          card.positionKey,
          JSON.stringify(card.labels),
          card.sourceKey,
          card.createdByActorId,
          card.version,
          card.archivedAt,
          card.createdAt,
          card.updatedAt,
        ],
      );
      return cardFromRow(requireRow(result.rows, "card", card.cardId));
    });
  }

  async getCard(input: CardScope): Promise<BoardCard | undefined> {
    return this.withClient(async (client) => {
      const result = await client.query<CardRow>(
        `SELECT * FROM app_board_cards WHERE board_id = $1 AND card_id = $2`,
        [input.boardId, input.cardId],
      );
      const row = result.rows[0];
      return row ? cardFromRow(row) : undefined;
    });
  }

  async listCards(
    input: BoardScope & { includeArchived?: boolean },
  ): Promise<BoardCard[]> {
    return this.withClient(async (client) => {
      const result = await client.query<CardRow>(
        `
          SELECT * FROM app_board_cards
          WHERE board_id = $1 AND ($2::boolean OR archived_at IS NULL)
          ORDER BY position_key ASC
        `,
        [input.boardId, Boolean(input.includeArchived)],
      );
      return result.rows.map(cardFromRow);
    });
  }

  async updateCard(
    input: CardScope & VersionedMutation & { patch: CardPatch },
  ): Promise<BoardCard> {
    return this.withVersionedUpdate(
      "card",
      input.cardId,
      input.expectedVersion,
      (client) =>
        client.query<CardRow>(
          `
            UPDATE app_board_cards
            SET title = COALESCE($4, title),
                description_markdown = CASE WHEN $5::boolean THEN $6 ELSE description_markdown END,
                kind = COALESCE($7, kind),
                priority = COALESCE($8, priority),
                assignee_actor_id = CASE WHEN $9::boolean THEN $10 ELSE assignee_actor_id END,
                due_at = CASE WHEN $11::boolean THEN $12 ELSE due_at END,
                blocked_reason = CASE WHEN $13::boolean THEN $14 ELSE blocked_reason END,
                labels = COALESCE($15, labels),
                version = version + 1,
                updated_at = now()
            WHERE board_id = $1 AND card_id = $2 AND version = $3
            RETURNING *
          `,
          [
            input.boardId,
            input.cardId,
            input.expectedVersion,
            input.patch.title ?? null,
            "descriptionMarkdown" in input.patch,
            input.patch.descriptionMarkdown ?? null,
            input.patch.kind ?? null,
            input.patch.priority ?? null,
            "assigneeActorId" in input.patch,
            input.patch.assigneeActorId ?? null,
            "dueAt" in input.patch,
            input.patch.dueAt ?? null,
            "blockedReason" in input.patch,
            input.patch.blockedReason ?? null,
            input.patch.labels ? JSON.stringify(input.patch.labels) : null,
          ],
        ),
      cardFromRow,
    );
  }

  async moveCard(
    input: CardScope &
      VersionedMutation & { toColumnId: string; toPositionKey: string },
  ): Promise<BoardCard> {
    return this.withVersionedUpdate(
      "card",
      input.cardId,
      input.expectedVersion,
      (client) =>
        client.query<CardRow>(
          `
            UPDATE app_board_cards
            SET column_id = $4, position_key = $5, version = version + 1, updated_at = now()
            WHERE board_id = $1 AND card_id = $2 AND version = $3
            RETURNING *
          `,
          [
            input.boardId,
            input.cardId,
            input.expectedVersion,
            input.toColumnId,
            input.toPositionKey,
          ],
        ),
      cardFromRow,
    );
  }

  async archiveCard(input: CardScope & VersionedMutation): Promise<BoardCard> {
    return this.setCardArchived(input, true);
  }

  async restoreCard(input: CardScope & VersionedMutation): Promise<BoardCard> {
    return this.setCardArchived(input, false);
  }

  private async setCardArchived(
    input: CardScope & VersionedMutation,
    archived: boolean,
  ): Promise<BoardCard> {
    return this.withVersionedUpdate(
      "card",
      input.cardId,
      input.expectedVersion,
      (client) =>
        client.query<CardRow>(
          `
            UPDATE app_board_cards
            SET archived_at = CASE WHEN $4::boolean THEN now() ELSE NULL END,
                version = version + 1,
                updated_at = now()
            WHERE board_id = $1 AND card_id = $2 AND version = $3
            RETURNING *
          `,
          [input.boardId, input.cardId, input.expectedVersion, archived],
        ),
      cardFromRow,
    );
  }

  async listChecklistItems(input: CardScope): Promise<ChecklistItem[]> {
    return this.withClient(async (client) => {
      const result = await client.query<ChecklistItemRow>(
        `
          SELECT * FROM app_board_card_checklist_items
          WHERE card_id = $1
          ORDER BY position_key ASC
        `,
        [input.cardId],
      );
      return result.rows.map(checklistItemFromRow);
    });
  }

  async addChecklistItem(
    input: CardScope &
      VersionedMutation & { item: Omit<ChecklistItem, "cardId"> },
  ): Promise<{ item: ChecklistItem; card: BoardCard }> {
    return this.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO app_board_card_checklist_items (
            item_id, card_id, text, done, position_key, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          input.item.itemId,
          input.cardId,
          input.item.text,
          input.item.done,
          input.item.positionKey,
          input.item.createdAt,
          input.item.updatedAt,
        ],
      );
      const card = await this.bumpCardVersionWithClient(client, input);
      return {
        item: { ...input.item, cardId: input.cardId },
        card,
      };
    });
  }

  async updateChecklistItem(
    input: CardScope &
      VersionedMutation & {
        itemId: string;
        patch: { text?: string; done?: boolean; positionKey?: string };
      },
  ): Promise<{ item: ChecklistItem; card: BoardCard }> {
    return this.withTransaction(async (client) => {
      const result = await client.query<ChecklistItemRow>(
        `
          UPDATE app_board_card_checklist_items
          SET text = COALESCE($3, text),
              done = COALESCE($4, done),
              position_key = COALESCE($5, position_key),
              updated_at = now()
          WHERE card_id = $1 AND item_id = $2
          RETURNING *
        `,
        [
          input.cardId,
          input.itemId,
          input.patch.text ?? null,
          input.patch.done ?? null,
          input.patch.positionKey ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        throw new KanbanNotFoundError("checklist item", input.itemId);
      }
      const card = await this.bumpCardVersionWithClient(client, input);
      return { item: checklistItemFromRow(row), card };
    });
  }

  async removeChecklistItem(
    input: CardScope & VersionedMutation & { itemId: string },
  ): Promise<{ card: BoardCard }> {
    return this.withTransaction(async (client) => {
      await client.query(
        `DELETE FROM app_board_card_checklist_items WHERE card_id = $1 AND item_id = $2`,
        [input.cardId, input.itemId],
      );
      const card = await this.bumpCardVersionWithClient(client, input);
      return { card };
    });
  }

  async listCardReferences(input: CardScope): Promise<CardReference[]> {
    return this.withClient(async (client) => {
      const result = await client.query<ReferenceRow>(
        `SELECT * FROM app_board_card_references WHERE card_id = $1`,
        [input.cardId],
      );
      return result.rows.map(referenceFromRow);
    });
  }

  async addCardReference(
    input: CardScope &
      VersionedMutation & { reference: Omit<CardReference, "cardId"> },
  ): Promise<{ reference: CardReference; card: BoardCard }> {
    return this.withTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO app_board_card_references (
            reference_id, card_id, reference_kind, reference_system,
            external_id, url, metadata, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          input.reference.referenceId,
          input.cardId,
          input.reference.referenceKind,
          input.reference.referenceSystem,
          input.reference.externalId,
          input.reference.url,
          JSON.stringify(input.reference.metadata),
          input.reference.createdAt,
        ],
      );
      const card = await this.bumpCardVersionWithClient(client, input);
      return {
        reference: { ...input.reference, cardId: input.cardId },
        card,
      };
    });
  }

  async removeCardReference(
    input: CardScope & VersionedMutation & { referenceId: string },
  ): Promise<{ card: BoardCard }> {
    return this.withTransaction(async (client) => {
      await client.query(
        `DELETE FROM app_board_card_references WHERE card_id = $1 AND reference_id = $2`,
        [input.cardId, input.referenceId],
      );
      const card = await this.bumpCardVersionWithClient(client, input);
      return { card };
    });
  }

  private async bumpCardVersionWithClient(
    client: PgClient,
    input: CardScope & VersionedMutation,
  ): Promise<BoardCard> {
    const result = await client.query<CardRow>(
      `
        UPDATE app_board_cards
        SET version = version + 1, updated_at = now()
        WHERE board_id = $1 AND card_id = $2 AND version = $3
        RETURNING *
      `,
      [input.boardId, input.cardId, input.expectedVersion],
    );
    const row = result.rows[0];
    if (!row) {
      await this.assertExistsOrThrowConflict(
        client,
        "app_board_cards",
        "card_id",
        input.cardId,
        "card",
        input.expectedVersion,
      );
    }
    return cardFromRow(requireRow(result.rows, "card", input.cardId));
  }

  private async withVersionedUpdate<Row, Value>(
    resource: string,
    resourceId: string,
    expectedVersion: number,
    run: (client: PgClient) => Promise<{ rows: Row[] }>,
    fromRow: (row: Row) => Value,
  ): Promise<Value> {
    return this.withClient(async (client) => {
      const result = await run(client);
      const row = result.rows[0];
      if (!row) {
        await this.assertExistsOrThrowConflict(
          client,
          resourceTable(resource),
          resourceIdColumn(resource),
          resourceId,
          resource,
          expectedVersion,
        );
      }
      return fromRow(requireRow(result.rows, resource, resourceId));
    });
  }

  private async assertExistsOrThrowConflict(
    client: PgClient,
    table: string,
    idColumn: string,
    resourceId: string,
    resource: string,
    expectedVersion: number,
  ): Promise<void> {
    const existing = await client.query(
      `SELECT 1 FROM ${table} WHERE ${idColumn} = $1`,
      [resourceId],
    );
    if (existing.rows.length === 0) {
      throw new KanbanNotFoundError(resource, resourceId);
    }
    throw new KanbanConflictError(resource, resourceId, expectedVersion);
  }

  private async withClient<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    const client = await createPgClient(this.databaseUrl);
    await client.connect();
    try {
      return await callback(client);
    } finally {
      await client.end();
    }
  }

  private async withTransaction<T>(
    callback: (client: PgClient) => Promise<T>,
  ): Promise<T> {
    return this.withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
  }
}

function resourceTable(resource: string): string {
  switch (resource) {
    case "board":
      return "app_boards";
    case "column":
      return "app_board_columns";
    case "card":
      return "app_board_cards";
    default:
      throw new Error(`unknown kanban resource "${resource}"`);
  }
}

function resourceIdColumn(resource: string): string {
  switch (resource) {
    case "board":
      return "board_id";
    case "column":
      return "column_id";
    case "card":
      return "card_id";
    default:
      throw new Error(`unknown kanban resource "${resource}"`);
  }
}

function requireRow<T>(rows: T[], resource: string, resourceId: string): T {
  const row = rows[0];
  if (!row) {
    throw new KanbanNotFoundError(resource, resourceId);
  }
  return row;
}

function boardFromRow(row: BoardRow): Board {
  return {
    boardId: row.board_id,
    tenantId: row.tenant_id,
    authorityId: row.authority_id,
    jurisdictionId: row.jurisdiction_id,
    ownerActorId: row.owner_actor_id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    contentLocale: row.content_locale,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    purpose: row.purpose,
    lifecycleStage: row.lifecycle_stage,
    version: row.version,
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function columnFromRow(row: ColumnRow): BoardColumn {
  return {
    columnId: row.column_id,
    boardId: row.board_id,
    title: row.title,
    positionKey: row.position_key,
    version: row.version,
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function cardFromRow(row: CardRow): BoardCard {
  return {
    cardId: row.card_id,
    boardId: row.board_id,
    columnId: row.column_id,
    title: row.title,
    descriptionMarkdown: row.description_markdown,
    kind: row.kind,
    priority: row.priority,
    assigneeActorId: row.assignee_actor_id,
    dueAt: toIsoOrNull(row.due_at),
    blockedReason: row.blocked_reason,
    positionKey: row.position_key,
    labels: row.labels,
    sourceKey: row.source_key,
    createdByActorId: row.created_by_actor_id,
    version: row.version,
    archivedAt: toIsoOrNull(row.archived_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function checklistItemFromRow(row: ChecklistItemRow): ChecklistItem {
  return {
    itemId: row.item_id,
    cardId: row.card_id,
    text: row.text,
    done: row.done,
    positionKey: row.position_key,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function referenceFromRow(row: ReferenceRow): CardReference {
  return {
    referenceId: row.reference_id,
    cardId: row.card_id,
    referenceKind: row.reference_kind,
    referenceSystem: row.reference_system,
    externalId: row.external_id,
    url: row.url,
    metadata: row.metadata,
    createdAt: toIsoString(row.created_at),
  };
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoString(value);
}
