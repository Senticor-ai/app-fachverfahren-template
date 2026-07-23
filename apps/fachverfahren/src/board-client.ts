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
  type UpdateColumnInput,
} from "@senticor/fachverfahren-kit";

/** Nicht-OK-Antworten mit Status — `getBoard` unterscheidet damit 404 (Board existiert nicht)
 *  von 401/5xx/Netzfehlern, die NICHT als „nicht gefunden" maskiert werden dürfen. */
export class BoardRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BoardRequestError";
  }
}

// Die API-Basis-Auflösung (Auslieferungs-Präfix vs. VITE_API_BASE für getrennte Deploys) liegt in der EINEN
// Wahrheit `api-base.ts`; hier importiert (interne Nutzung) UND re-exportiert, damit bestehende Importe
// (`from "./board-client.js"`) gültig bleiben.
import { apiPath } from "./api-base.js";
export { apiPath };

/** Karten-DTO des Servers (`@senticor/app-store-postgres`): `labels` statt `labelIds`,
 *  Checkliste/Kommentare leben in eigenen Tabellen und sind NICHT Teil der Karten-Antwort. */
interface ServerCard extends Omit<
  BoardCard,
  "labelIds" | "checklist" | "comments"
> {
  labels?: string[];
}

// Server-Karten VOR dem Rendern auf die Kit-Form normalisieren: `KanbanCard`/`BoardCardDetail`
// lesen `checklist`/`comments`/`labelIds` synchron — eine rohe Server-Karte würde crashen.
function toKitCard(card: ServerCard): BoardCard {
  const { labels, ...rest } = card;
  return { ...rest, labelIds: labels ?? [], checklist: [], comments: [] };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ body: T; etag: string | null }> {
  const response = await fetch(apiPath(path), {
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
    throw new BoardRequestError(
      response.status,
      `request to ${path} failed (${response.status}): ${text}`,
    );
  }
  if (response.status === 204) {
    return { body: undefined as T, etag: null };
  }
  // Nicht-JSON trotz 2xx = die Antwort kam NICHT von der Runtime (SPA-Fallback ohne Dev-Proxy,
  // falsch konfigurierter Reverse-Proxy). Ein diagnostizierbarer Fehler statt einer nackten
  // SyntaxError aus response.json().
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new BoardRequestError(
      response.status,
      `request to ${path} returned "${contentType || "unknown"}" instead of JSON — is the API server running (dev proxy target)?`,
    );
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
          cards: ServerCard[];
        }>(`/api/v1/boards/${boardId}`);
        return { ...body, cards: body.cards.map(toKitCard) };
      } catch (error) {
        // NUR 404 heißt „Board existiert nicht" — 401/5xx/Netzfehler müssen propagieren,
        // damit die UI einen Fehler-/Re-Login-Zustand statt „nicht gefunden" zeigen kann.
        if (error instanceof BoardRequestError && error.status === 404) {
          return undefined;
        }
        throw error;
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

    async updateColumn(
      boardId,
      columnId,
      expectedVersion,
      patch: UpdateColumnInput,
    ) {
      const { body } = await request<BoardColumn>(
        `/api/v1/boards/${boardId}/columns/${columnId}`,
        {
          method: "PATCH",
          headers: ifMatch(expectedVersion),
          body: JSON.stringify(patch),
        },
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
      const { body } = await request<ServerCard>(
        `/api/v1/boards/${boardId}/cards`,
        { method: "POST", body: JSON.stringify(input) },
      );
      return toKitCard(body);
    },

    async updateCard(boardId, cardId, expectedVersion, patch: CardPatch) {
      // Kit-Patch spricht `labelIds`, der Server `labels` — auf dem Draht übersetzen.
      const { labelIds, ...rest } = patch;
      const { body } = await request<ServerCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}`,
        {
          method: "PATCH",
          headers: ifMatch(expectedVersion),
          body: JSON.stringify({
            ...rest,
            ...(labelIds ? { labels: labelIds } : {}),
          }),
        },
      );
      return toKitCard(body);
    },

    async moveCard(
      boardId,
      cardId,
      expectedVersion,
      toColumnId,
      toPositionKey,
    ) {
      const { body } = await request<ServerCard>(
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
      return toKitCard(body);
    },

    async archiveCard(boardId, cardId, expectedVersion) {
      const { body } = await request<ServerCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}/archive`,
        { method: "POST", headers: ifMatch(expectedVersion) },
      );
      return toKitCard(body);
    },

    async restoreCard(boardId, cardId, expectedVersion) {
      const { body } = await request<ServerCard>(
        `/api/v1/boards/${boardId}/cards/${cardId}/restore`,
        { method: "POST", headers: ifMatch(expectedVersion) },
      );
      return toKitCard(body);
    },

    async listArchivedCards(boardId) {
      const { body } = await request<ServerCard[]>(
        `/api/v1/boards/${boardId}/cards/archived`,
      );
      return body.map(toKitCard);
    },
  };
}
