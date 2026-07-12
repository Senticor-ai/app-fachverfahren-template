// board-client — die produktive `BoardPort`-Implementierung gegen `/api/v1/boards*`. Dieselbe
// Schnittstelle wie `createBoardStore` (DEV/Storybook), jetzt über echtes HTTP mit Session-Cookie.
import {
  BoardConflictError,
  type Board,
  type BoardCard,
  type BoardColumn,
  type BoardPort,
  type CardPatch,
  type CreateBoardInput,
  type CreateCardInput,
  type CreateColumnInput,
} from "@senticor/fachverfahren-kit";

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ body: T; etag: string | null }> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 412) {
    throw new BoardConflictError("resource", path);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`request to ${path} failed (${response.status}): ${text}`);
  }
  if (response.status === 204) {
    return { body: undefined as T, etag: null };
  }
  const body = (await response.json()) as T;
  return { body, etag: response.headers.get("etag") };
}

function ifMatch(version: number): Record<string, string> {
  return { "if-match": `"${version}"` };
}

export function createBoardClient(): BoardPort {
  return {
    async listBoards() {
      const { body } = await request<Board[]>("/api/v1/boards");
      return body;
    },

    async getBoard(boardId) {
      try {
        const { body } = await request<{
          board: Board;
          columns: BoardColumn[];
          cards: BoardCard[];
        }>(`/api/v1/boards/${boardId}`);
        return body;
      } catch {
        return undefined;
      }
    },

    async createBoard(input: CreateBoardInput) {
      const { body } = await request<Board>("/api/v1/boards", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return body;
    },

    async createColumn(boardId, input: CreateColumnInput) {
      const { body } = await request<BoardColumn>(
        `/api/v1/boards/${boardId}/columns`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return body;
    },

    async archiveColumn(boardId, columnId, expectedVersion) {
      const { body } = await request<BoardColumn>(
        `/api/v1/boards/${boardId}/columns/${columnId}/archive`,
        { method: "POST", headers: ifMatch(expectedVersion) },
      );
      return body;
    },

    async createCard(boardId, input: CreateCardInput) {
      const { body } = await request<BoardCard>(
        `/api/v1/boards/${boardId}/cards`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return body;
    },

    async updateCard(boardId, cardId, expectedVersion, patch: CardPatch) {
      const { body } = await request<BoardCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}`,
        {
          method: "PATCH",
          headers: ifMatch(expectedVersion),
          body: JSON.stringify(patch),
        },
      );
      return body;
    },

    async moveCard(
      boardId,
      cardId,
      expectedVersion,
      toColumnId,
      toPositionKey,
    ) {
      const { body } = await request<BoardCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}/move`,
        {
          method: "POST",
          headers: ifMatch(expectedVersion),
          body: JSON.stringify({
            toColumnId,
            ...(toPositionKey ? { toPositionKey } : {}),
          }),
        },
      );
      return body;
    },

    async archiveCard(boardId, cardId, expectedVersion) {
      const { body } = await request<BoardCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}/archive`,
        { method: "POST", headers: ifMatch(expectedVersion) },
      );
      return body;
    },

    async restoreCard(boardId, cardId, expectedVersion) {
      const { body } = await request<BoardCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}/restore`,
        { method: "POST", headers: ifMatch(expectedVersion) },
      );
      return body;
    },
  };
}
