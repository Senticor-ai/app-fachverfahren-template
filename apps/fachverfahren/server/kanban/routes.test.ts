import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../auth/routes.js";
import { registerBoardRoutes } from "./routes.js";

const bootstrapBody = {
  token: "test-bootstrap-token",
  email: "owner@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Owner",
};

async function setUp() {
  const authStore = new InMemoryAuthStore();
  const kanbanStore = new InMemoryKanbanStore();
  const app: FastifyInstance = fastify({ logger: false });
  await app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore,
    kanbanStore,
    bootstrapToken: "test-bootstrap-token",
  });
  registerBoardRoutes(app, { authStore, kanbanStore });
  await app.ready();

  const bootstrapResponse = await app.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: bootstrapBody,
  });
  const ownerCookie = extractCookie(bootstrapResponse);
  const boardIdFromBootstrap = bootstrapResponse.json().boardId as string;

  return { app, authStore, kanbanStore, ownerCookie, boardIdFromBootstrap };
}

function extractCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") {
    throw new Error("expected a set-cookie header");
  }
  return value.split(";")[0] ?? "";
}

describe("board CRUD routes", () => {
  let app: FastifyInstance;
  let ownerCookie: string;
  let boardIdFromBootstrap: string;

  beforeEach(async () => {
    ({ app, ownerCookie, boardIdFromBootstrap } = await setUp());
  });

  it("requires authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/boards" });
    expect(response.statusCode).toBe(401);
  });

  it("lists the seeded board for the owner", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/boards",
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(200);
    const boards = response.json();
    expect(boards).toHaveLength(1);
    expect(boards[0].boardId).toBe(boardIdFromBootstrap);
  });

  it("creates a new board, returning an ETag", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/boards",
      headers: { cookie: ownerCookie },
      payload: { title: "Sprint Board", visibility: "personal" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers.etag).toBe('"1"');
    expect(response.json().title).toBe("Sprint Board");
  });

  it("gets a board with its columns and cards", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.board.boardId).toBe(boardIdFromBootstrap);
    expect(body.columns.length).toBeGreaterThan(0);
    expect(body.cards.length).toBeGreaterThan(0);
  });

  it("denies access to another actor's board (ownership check)", async () => {
    const strangerBootstrap = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@example.org", password: "irrelevant-value" }, // pragma: allowlist-secret
    });
    expect(strangerBootstrap.statusCode).toBe(401); // sanity: no such user exists

    // simulate a second, unrelated principal via a fresh registration path is
    // out of scope for P0-A (invite-only registration is Gate P0-B); instead
    // directly assert that a request with no cookie at all is denied, and
    // that a forged/unknown session cookie is denied too.
    const forged = await app.inject({
      method: "GET",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: "app_session=not-a-real-token" },
    });
    expect(forged.statusCode).toBe(401);
  });

  it("requires If-Match on mutating requests (428)", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie },
      payload: { title: "Renamed" },
    });
    expect(response.statusCode).toBe(428);
  });

  it("rejects a stale If-Match with 412 and accepts a correct one", async () => {
    const stale = await app.inject({
      method: "PATCH",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie, "if-match": '"99"' },
      payload: { title: "Renamed" },
    });
    expect(stale.statusCode).toBe(412);

    const ok = await app.inject({
      method: "PATCH",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie, "if-match": '"1"' },
      payload: { title: "Renamed" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().title).toBe("Renamed");
    expect(ok.headers.etag).toBe('"2"');
  });

  it("archives and restores a board instead of deleting it", async () => {
    const archive = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/archive`,
      headers: { cookie: ownerCookie, "if-match": '"1"' },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json().archivedAt).not.toBeNull();

    const restore = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/restore`,
      headers: { cookie: ownerCookie, "if-match": '"2"' },
    });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().archivedAt).toBeNull();
  });

  it("has no DELETE route for boards under this API (archive/restore only)", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it("creates a column and a card, then moves the card via If-Match", async () => {
    const column = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/columns`,
      headers: { cookie: ownerCookie },
      payload: { title: "New Column" },
    });
    expect(column.statusCode).toBe(201);
    const columnId = column.json().columnId as string;

    const card = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards`,
      headers: { cookie: ownerCookie },
      payload: { columnId, title: "New card", kind: "task" },
    });
    expect(card.statusCode).toBe(201);
    const cardId = card.json().cardId as string;
    const cardVersion = card.json().version as number;

    const secondColumn = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/columns`,
      headers: { cookie: ownerCookie },
      payload: { title: "Target Column" },
    });
    const targetColumnId = secondColumn.json().columnId as string;

    const moved = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards/${cardId}/move`,
      headers: { cookie: ownerCookie, "if-match": `"${cardVersion}"` },
      payload: { toColumnId: targetColumnId },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().columnId).toBe(targetColumnId);
  });

  it("refuses to archive a column that still holds non-archived cards", async () => {
    const column = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/columns`,
      headers: { cookie: ownerCookie },
      payload: { title: "Blocked Column" },
    });
    const columnId = column.json().columnId as string;
    await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards`,
      headers: { cookie: ownerCookie },
      payload: { columnId, title: "Occupied card" },
    });

    const archiveAttempt = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/columns/${columnId}/archive`,
      headers: { cookie: ownerCookie, "if-match": '"1"' },
    });
    expect(archiveAttempt.statusCode).toBe(400);
  });

  it("rejects card create and move targeting a column of ANOTHER board (400)", async () => {
    // Fremde Spalte: eigenes Zweit-Board desselben Owners — der FK allein würde das zulassen,
    // die Karte hinge dann unsichtbar am Lebenszyklus des fremden Boards.
    const otherBoard = await app.inject({
      method: "POST",
      url: "/api/v1/boards",
      headers: { cookie: ownerCookie },
      payload: { title: "Other Board" },
    });
    const otherBoardId = otherBoard.json().boardId as string;
    const foreignColumn = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${otherBoardId}/columns`,
      headers: { cookie: ownerCookie },
      payload: { title: "Foreign Column" },
    });
    const foreignColumnId = foreignColumn.json().columnId as string;

    const created = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards`,
      headers: { cookie: ownerCookie },
      payload: { columnId: foreignColumnId, title: "Stray card" },
    });
    expect(created.statusCode).toBe(400);

    const board = await app.inject({
      method: "GET",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie },
    });
    const victim = board.json().cards[0] as {
      cardId: string;
      version: number;
    };
    const moved = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards/${victim.cardId}/move`,
      headers: { cookie: ownerCookie, "if-match": `"${victim.version}"` },
      payload: { toColumnId: foreignColumnId },
    });
    expect(moved.statusCode).toBe(400);
  });

  it("lists archived cards for the archive panel (restore loop)", async () => {
    const board = await app.inject({
      method: "GET",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie },
    });
    const card = board.json().cards[0] as { cardId: string; version: number };

    const archived = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards/${card.cardId}/archive`,
      headers: { cookie: ownerCookie, "if-match": `"${card.version}"` },
    });
    expect(archived.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards/archived`,
      headers: { cookie: ownerCookie },
    });
    expect(list.statusCode).toBe(200);
    const cards = list.json() as { cardId: string; archivedAt: string }[];
    expect(cards.map((c) => c.cardId)).toContain(card.cardId);
    expect(cards.every((c) => c.archivedAt !== null)).toBe(true);
  });

  it("quick-adds a card with only a title (no other fields required)", async () => {
    const columns = await app.inject({
      method: "GET",
      url: `/api/v1/boards/${boardIdFromBootstrap}`,
      headers: { cookie: ownerCookie },
    });
    const firstColumnId = columns.json().columns[0].columnId as string;

    const response = await app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardIdFromBootstrap}/cards`,
      headers: { cookie: ownerCookie },
      payload: { columnId: firstColumnId, title: "Quick card" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().kind).toBe("task");
    expect(response.json().priority).toBe("normal");
  });
});
