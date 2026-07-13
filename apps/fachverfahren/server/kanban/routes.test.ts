import fastifyCookie from "@fastify/cookie";
import {
  InMemoryAuditStore,
  InMemoryAuthStore,
  InMemoryKanbanStore,
} from "@senticor/app-store-postgres";
import fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAuthRoutes } from "../auth/routes.js";
import { registerUserRoutes } from "../users/routes.js";
import { registerBoardRoutes } from "./routes.js";

const bootstrapBody = {
  token: "test-bootstrap-token",
  email: "owner@example.org",
  password: "correct horse battery staple", // pragma: allowlist-secret
  displayName: "Owner",
};

const memberBody = {
  email: "member@example.org",
  displayName: "Mitglied",
  initialPassword: "initial member password", // pragma: allowlist-secret
};

async function setUp() {
  const authStore = new InMemoryAuthStore();
  const kanbanStore = new InMemoryKanbanStore();
  const auditStore = new InMemoryAuditStore();
  const app: FastifyInstance = fastify({ logger: false });
  await app.register(fastifyCookie);
  registerAuthRoutes(app, {
    authStore,
    kanbanStore,
    auditStore,
    bootstrapToken: "test-bootstrap-token",
  });
  registerUserRoutes(app, { authStore, kanbanStore, auditStore });
  registerBoardRoutes(app, { authStore, kanbanStore, auditStore });
  await app.ready();

  const bootstrapResponse = await app.inject({
    method: "POST",
    url: "/auth/bootstrap",
    payload: bootstrapBody,
  });
  const ownerCookie = extractCookie(bootstrapResponse);
  const boardIdFromBootstrap = bootstrapResponse.json().boardId as string;

  return {
    app,
    authStore,
    kanbanStore,
    auditStore,
    ownerCookie,
    boardIdFromBootstrap,
  };
}

/** Legt via Admin-API ein Member-Konto an und liefert dessen Session-Cookie —
 *  der echte Zwei-Personen-Pfad (das alte „Gate P0-B"-Provisorium ist Geschichte). */
async function createMemberSession(
  app: FastifyInstance,
  adminCookie: string,
): Promise<{ cookie: string; actorId: string }> {
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/users",
    headers: { cookie: adminCookie },
    payload: memberBody,
  });
  expect(created.statusCode).toBe(201);
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: memberBody.email, password: memberBody.initialPassword },
  });
  expect(login.statusCode).toBe(200);
  return {
    cookie: extractCookie(login),
    actorId: created.json().actorId as string,
  };
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

  it("denies a forged/unknown session cookie", async () => {
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

describe("team board access", () => {
  let ctx: Awaited<ReturnType<typeof setUp>>;
  let member: { cookie: string; actorId: string };

  beforeEach(async () => {
    ctx = await setUp();
    member = await createMemberSession(ctx.app, ctx.ownerCookie);
  });

  it("lists the team discovery board alongside the member's own starter board", async () => {
    const response = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/boards",
      headers: { cookie: member.cookie },
    });
    expect(response.statusCode).toBe(200);
    const boards = response.json() as Array<Record<string, unknown>>;
    const titles = boards.map((board) => board["title"]).sort();
    expect(titles).toEqual(["Fachverfahren Discovery Board", "Mein Board"]);
  });

  it("lets a member read and collaborate on the team board (card create)", async () => {
    const detail = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}`,
      headers: { cookie: member.cookie },
    });
    expect(detail.statusCode).toBe(200);
    const firstColumnId = detail.json().columns[0].columnId as string;

    const card = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}/cards`,
      headers: { cookie: member.cookie },
      payload: { columnId: firstColumnId, title: "Beitrag des Mitglieds" },
    });
    expect(card.statusCode).toBe(201);
  });

  it("refuses board management (PATCH/archive) for members on the team board", async () => {
    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}`,
      headers: { cookie: member.cookie, "if-match": '"1"' },
      payload: { title: "Umbenannt" },
    });
    expect(patch.statusCode).toBe(403);

    const archive = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}/archive`,
      headers: { cookie: member.cookie, "if-match": '"1"' },
    });
    expect(archive.statusCode).toBe(403);
  });

  it("lets an admin manage a team board they do not own (boards.manage permission)", async () => {
    // Member legt ein EIGENES Team-Board an …
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/boards",
      headers: { cookie: member.cookie },
      payload: { title: "Team-Thema", visibility: "team" },
    });
    expect(created.statusCode).toBe(201);
    const boardId = created.json().boardId as string;

    // … und der Admin (nicht Owner) darf es verwalten.
    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/boards/${boardId}`,
      headers: { cookie: ctx.ownerCookie, "if-match": '"1"' },
      payload: { title: "Team-Thema (kuratiert)" },
    });
    expect(patch.statusCode).toBe(200);
  });

  it("keeps foreign personal boards invisible (list AND detail 404)", async () => {
    // Das Starter-Board des Members taucht in der Owner-Liste nicht auf …
    const list = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/boards",
      headers: { cookie: ctx.ownerCookie },
    });
    const boards = list.json() as Array<Record<string, unknown>>;
    expect(boards.map((board) => board["title"])).not.toContain("Mein Board");

    // … und der direkte Zugriff wird als 404 maskiert.
    const memberBoards = await ctx.app.inject({
      method: "GET",
      url: "/api/v1/boards",
      headers: { cookie: member.cookie },
    });
    const starterBoard = (
      memberBoards.json() as Array<Record<string, unknown>>
    ).find((board) => board["title"] === "Mein Board");
    const detail = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/boards/${starterBoard?.["boardId"]}`,
      headers: { cookie: ctx.ownerCookie },
    });
    expect(detail.statusCode).toBe(404);
  });

  it("freezes archived boards: reading stays possible, collaboration is rejected until restore", async () => {
    // Archivierte Team-Boards dürfen mit gespeicherter URL nicht weiter mutierbar sein
    // (Codex-Review PR #27, Runde 2); Lesen bleibt möglich (Restore-UI braucht die Version).
    const detailBefore = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}`,
      headers: { cookie: member.cookie },
    });
    const firstColumnId = detailBefore.json().columns[0].columnId as string;

    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}/archive`,
      headers: { cookie: ctx.ownerCookie, "if-match": '"1"' },
    });

    const read = await ctx.app.inject({
      method: "GET",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}`,
      headers: { cookie: member.cookie },
    });
    expect(read.statusCode).toBe(200);

    const card = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}/cards`,
      headers: { cookie: member.cookie },
      payload: { columnId: firstColumnId, title: "Nachzügler" },
    });
    expect(card.statusCode).toBe(409);

    // Owner darf nach dem Restore wieder kollaborieren.
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}/restore`,
      headers: { cookie: ctx.ownerCookie, "if-match": '"2"' },
    });
    const afterRestore = await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${ctx.boardIdFromBootstrap}/cards`,
      headers: { cookie: member.cookie },
      payload: { columnId: firstColumnId, title: "Wieder offen" },
    });
    expect(afterRestore.statusCode).toBe(201);
  });

  it("audits board creation, visibility changes, and archiving", async () => {
    const created = await ctx.app.inject({
      method: "POST",
      url: "/api/v1/boards",
      headers: { cookie: member.cookie },
      payload: { title: "Audit-Board", visibility: "personal" },
    });
    const boardId = created.json().boardId as string;

    await ctx.app.inject({
      method: "PATCH",
      url: `/api/v1/boards/${boardId}`,
      headers: { cookie: member.cookie, "if-match": '"1"' },
      payload: { visibility: "team" },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardId}/archive`,
      headers: { cookie: member.cookie, "if-match": '"2"' },
    });
    await ctx.app.inject({
      method: "POST",
      url: `/api/v1/boards/${boardId}/restore`,
      headers: { cookie: member.cookie, "if-match": '"3"' },
    });

    const events = await ctx.auditStore.listEvents({ tenantId: "default" });
    const types = events.map((event) => event.eventType);
    expect(types).toContain("BOARD_CREATED");
    expect(types).toContain("BOARD_VISIBILITY_CHANGED");
    expect(types).toContain("BOARD_ARCHIVED");
    // Wer ein eingefrorenes Board wieder öffnet, muss im Trail sichtbar sein.
    expect(types).toContain("BOARD_RESTORED");
  });
});
