import type { TenantScope, VersionedMutation } from "./common.js";

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
  purpose: string | null;
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

export interface BoardScope extends TenantScope {
  boardId: string;
}

export interface CardScope extends BoardScope {
  cardId: string;
}

/**
 * Materialised Kanban cache / view persistence.
 *
 * System of record for work is ActionStore (+ ThingStore for objects).
 * Kanban columns/cards are a UX projection of Actions (see
 * `projectActionsToBoardView` in `@senticor/fachverfahren-domain`).
 * Prefer `sourceKey = action:<actionId>` and CardReference rows of kinds
 * `Action` / `Thing`. Do not dual-write domain rules into this store.
 *
 * Implementations: Postgres, InMemory, Unavailable; later CHOS may skip
 * materialisation and serve BoardPort directly from ActionStore.
 */
export interface KanbanStore {
  createBoard(board: Board): Promise<Board>;
  getBoard(input: BoardScope): Promise<Board | undefined>;
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
