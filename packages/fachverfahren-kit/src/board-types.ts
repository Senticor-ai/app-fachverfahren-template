// fachverfahren-kit/board-types — der generische Vertrag der Kanban-Workspace-Oberfläche.
//
// Gleiche Entkopplung wie `VorgangPort<T>` in types.ts: die UI kennt nur `BoardPort`, nie den
// konkreten REST-Client oder die In-Memory-Implementierung. DEV/Storybook = `createBoardStore`
// (In-Memory), PROD = ein REST-Client gegen `/api/v1/boards*` — dieselbe Schnittstelle, zwei
// Laufzeiten. Anders als `VorgangPort` ist `BoardPort` bewusst ASYNCHRON: die produktive
// Implementierung spricht über echtes HTTP mit dem Server, nicht mit einem synchronen Zustand-Store.
//
// Trello-artige Funktionen (Labels, Checkliste, Kommentare, Spalten-Umbenennen) sind als OPTIONALE
// `BoardPort`-Methoden modelliert — dasselbe Muster wie optionale `LeistungConfig`-Felder
// ("NUR setzen, wenn das Fachkonzept es vorsieht"). Das lässt die UX-Arbeit in Storybook/DEV
// vorangehen, ohne die produktive REST-Anbindung sofort mitziehen zu müssen; `board-client.ts`
// kann diese Methoden nachreichen, sobald die Server-Routen existieren.

export type BoardVisibility = "personal" | "team";

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

/** Trello-artige Label-Palette — feste, benannte Farb-Tokens statt freier Hex-Werte. */
export type LabelColor =
  | "green"
  | "yellow"
  | "orange"
  | "red"
  | "purple"
  | "blue"
  | "sky"
  | "lime"
  | "pink"
  | "black";

export interface BoardLabel {
  labelId: string;
  name: string;
  color: LabelColor;
}

export interface ChecklistItem {
  itemId: string;
  text: string;
  done: boolean;
}

export interface CardComment {
  commentId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface BoardMember {
  actorId: string;
  displayName: string;
}

export interface Board {
  boardId: string;
  title: string;
  description: string | null;
  visibility: BoardVisibility;
  contentLocale: string;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Label-Registry des Boards — Karten referenzieren Labels über `labelId`. */
  labels?: BoardLabel[];
  /** Zuweisbare Mitglieder (vereinfacht — echte Mitgliedschaft/Rollen sind Gate P0-B). */
  members?: BoardMember[];
}

export interface BoardColumn {
  columnId: string;
  boardId: string;
  title: string;
  positionKey: string;
  version: number;
  archivedAt: string | null;
}

export interface BoardCard<TCardData = Record<string, unknown>> {
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
  labelIds: string[];
  checklist: ChecklistItem[];
  comments: CardComment[];
  version: number;
  archivedAt: string | null;
  data?: TCardData;
}

export interface CreateBoardInput {
  title: string;
  description?: string;
  visibility?: BoardVisibility;
}

export interface CreateColumnInput {
  title: string;
}

export interface UpdateColumnInput {
  title?: string;
  positionKey?: string;
}

export interface CreateCardInput {
  columnId: string;
  title: string;
  kind?: CardKind;
  priority?: CardPriority;
  descriptionMarkdown?: string;
}

export interface CardPatch {
  title?: string;
  descriptionMarkdown?: string | null;
  kind?: CardKind;
  priority?: CardPriority;
  assigneeActorId?: string | null;
  dueAt?: string | null;
  blockedReason?: string | null;
  labelIds?: string[];
}

/** Thrown by a `BoardPort` when a mutation's `expectedVersion` no longer matches the server. */
export class BoardConflictError extends Error {
  constructor(
    public readonly resource: string,
    public readonly resourceId: string,
  ) {
    super(`"${resource}" "${resourceId}" wurde inzwischen geändert`);
    this.name = "BoardConflictError";
  }
}

export interface BoardPort<TCardData = Record<string, unknown>> {
  listBoards(): Promise<Board[]>;
  getBoard(boardId: string): Promise<
    | {
        board: Board;
        columns: BoardColumn[];
        cards: BoardCard<TCardData>[];
      }
    | undefined
  >;
  createBoard(input: CreateBoardInput): Promise<Board>;

  createColumn(boardId: string, input: CreateColumnInput): Promise<BoardColumn>;
  archiveColumn(
    boardId: string,
    columnId: string,
    expectedVersion: number,
  ): Promise<BoardColumn>;
  /** Umbenennen/Neupositionieren einer Spalte — optional, bis die Server-Route existiert. */
  updateColumn?(
    boardId: string,
    columnId: string,
    expectedVersion: number,
    patch: UpdateColumnInput,
  ): Promise<BoardColumn>;

  createCard(
    boardId: string,
    input: CreateCardInput,
  ): Promise<BoardCard<TCardData>>;
  updateCard(
    boardId: string,
    cardId: string,
    expectedVersion: number,
    patch: CardPatch,
  ): Promise<BoardCard<TCardData>>;
  moveCard(
    boardId: string,
    cardId: string,
    expectedVersion: number,
    toColumnId: string,
    toPositionKey?: string,
  ): Promise<BoardCard<TCardData>>;
  archiveCard(
    boardId: string,
    cardId: string,
    expectedVersion: number,
  ): Promise<BoardCard<TCardData>>;
  restoreCard(
    boardId: string,
    cardId: string,
    expectedVersion: number,
  ): Promise<BoardCard<TCardData>>;

  /** Neues Board-Label anlegen (Trello-artig: Label-Verwaltung lebt im Label-Picker der Karte). */
  createLabel?(
    boardId: string,
    input: { name: string; color: LabelColor },
  ): Promise<BoardLabel>;

  addChecklistItem?(
    boardId: string,
    cardId: string,
    text: string,
  ): Promise<BoardCard<TCardData>>;
  toggleChecklistItem?(
    boardId: string,
    cardId: string,
    itemId: string,
  ): Promise<BoardCard<TCardData>>;
  removeChecklistItem?(
    boardId: string,
    cardId: string,
    itemId: string,
  ): Promise<BoardCard<TCardData>>;

  addComment?(
    boardId: string,
    cardId: string,
    body: string,
  ): Promise<BoardCard<TCardData>>;

  /** Archivierte Karten des Boards — schließt die Archivieren-Schleife (Wiederherstellen via
   *  `restoreCard`). Optional, bis die Server-Route existiert. */
  listArchivedCards?(boardId: string): Promise<BoardCard<TCardData>[]>;
}
