// Kanban HTTP surface — materialised view cache over Action+Thing (ADR-0004).
// Durable work items live in ActionStore/ThingStore; cards should use
// sourceKey `action:<actionId>` when projected from Actions.
import { randomUUID } from "node:crypto";
import type {
  AuditEventType,
  AuditStore,
  AuthStore,
  BoardVisibility,
  CardKind,
  CardPriority,
  KanbanStore,
} from "@senticor/app-store-postgres";
import {
  KanbanConflictError,
  KanbanNotFoundError,
  KanbanValidationError,
  nextPositionKey,
} from "@senticor/app-store-postgres";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import "../auth/principal.js";
import { routeAuth } from "../auth/authorization.js";
import { hasWorkspacePermission } from "../auth/workspace-permissions.js";

export interface BoardRouteDeps {
  authStore: AuthStore;
  kanbanStore: KanbanStore;
  auditStore: AuditStore;
  generateId?: (prefix: string) => string;
}

/** Zugriffsstufen auf ein Board: `read` = lesend (auch archiviert — das Restore-UI
 *  braucht Version/Inhalt); `collaborate` = mutierende Spalten-/Karten-Operationen
 *  (Team-Boards: alle Tenant-Mitglieder; archivierte Boards → 409, eingefroren);
 *  `manage` = Board-Operationen (PATCH/archive/restore; Owner oder `boards.manage`). */
type BoardAccess = "read" | "collaborate" | "manage";

function defaultGenerateId(prefix: string): string {
  return `${prefix}.${randomUUID()}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function etagFor(version: number): string {
  return `"${version}"`;
}

function parseIfMatch(request: FastifyRequest): number | undefined {
  const raw = request.headers["if-match"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return undefined;
  }
  const stripped = value.trim().replace(/^"|"$/g, "");
  const parsed = Number(stripped);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Mutating board/column/card routes all follow the same conditional-request
 * contract (kanban plan decision 11): missing `If-Match` → 428, stale
 * version → 412 (via KanbanConflictError below), not found → 404, domain
 * validation failure (e.g. archiving a non-empty column) → 400.
 */
function requireIfMatch(
  request: FastifyRequest,
  reply: FastifyReply,
): number | undefined {
  const version = parseIfMatch(request);
  if (version === undefined) {
    reply.code(428).send({ error: "If-Match header is required" });
    return undefined;
  }
  return version;
}

async function handleStoreErrors(
  reply: FastifyReply,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof KanbanConflictError) {
      await reply.code(412).send({ error: error.message });
      return;
    }
    if (error instanceof KanbanNotFoundError) {
      await reply.code(404).send({ error: error.message });
      return;
    }
    if (error instanceof KanbanValidationError) {
      await reply.code(400).send({ error: error.message });
      return;
    }
    throw error;
  }
}

export function registerBoardRoutes(
  app: FastifyInstance,
  deps: BoardRouteDeps,
): void {
  // Härtung (K2): die Boards-API ist Team-Arbeitsfläche — JEDE Route verlangt
  // boards.collaborate, „eingeloggt" reicht nicht (citizen-Konten haben keine
  // Workspace-Permissions). Policy + Durchsetzung aus EINER Quelle (routeAuth).
  const boardsCollaborate = routeAuth(
    { kind: "permission", action: "boards.collaborate" },
    deps,
  );
  const generateId = deps.generateId ?? defaultGenerateId;
  const store = deps.kanbanStore;

  async function loadAccessibleBoard(
    request: FastifyRequest,
    reply: FastifyReply,
    boardId: string,
    access: BoardAccess = "collaborate",
  ) {
    const principal = request.principal;
    if (!principal) {
      await reply.code(401).send({ error: "authentication required" });
      return undefined;
    }
    const board = await store.getBoard({
      tenantId: principal.tenantId,
      boardId,
    });
    const isOwner = board?.ownerActorId === principal.actorId;
    // Nicht sichtbar (weder eigenes noch Team-Board) → 404 statt 403: die Existenz
    // fremder persönlicher Boards wird maskiert (bestehende Semantik).
    if (!board || (!isOwner && board.visibility !== "team")) {
      await reply.code(404).send({ error: `board "${boardId}" not found` });
      return undefined;
    }
    if (access === "manage" && !isOwner) {
      const user = await deps.authStore.getUserById({
        tenantId: principal.tenantId,
        actorId: principal.actorId,
      });
      if (!user || !hasWorkspacePermission(user.role, "boards.manage")) {
        await reply.code(403).send({
          error: "only the board owner or an admin can manage this board",
        });
        return undefined;
      }
    }
    // Archivierte Boards sind eingefroren: mutierende Kollaboration wird abgelehnt,
    // bis ein Restore erfolgt (Codex-Review PR #27, Runde 2). Lesen (`read`) und
    // Board-Verwaltung (`manage`, insb. restore) bleiben möglich.
    if (access === "collaborate" && board.archivedAt !== null) {
      await reply.code(409).send({ error: `board "${boardId}" is archived` });
      return undefined;
    }
    return { principal, board };
  }

  // Audit-Events gehören in den Tenant des handelnden Principals (Codex-Review PR #27).
  async function audit(
    eventType: AuditEventType,
    tenantId: string,
    actorId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await deps.auditStore.appendEvent({
        id: generateId("audit"),
        tenantId,
        actorId,
        eventType,
        occurredAt: nowIso(),
        metadata,
      });
    } catch (error) {
      app.log.error({ err: error, eventType }, "audit event write failed");
    }
  }

  app.get("/api/v1/boards", boardsCollaborate, async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      return reply.code(401).send({ error: "authentication required" });
    }
    const boards = await store.listBoards({
      tenantId: principal.tenantId,
      actorId: principal.actorId,
    });
    return reply.send(boards);
  });

  app.post<{
    Body: { title?: unknown; description?: unknown; visibility?: unknown };
  }>("/api/v1/boards", boardsCollaborate, async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      return reply.code(401).send({ error: "authentication required" });
    }
    const body = request.body ?? {};
    if (typeof body.title !== "string" || body.title.trim() === "") {
      return reply.code(400).send({ error: "title is required" });
    }
    const visibility: BoardVisibility =
      body.visibility === "team" ? "team" : "personal";
    const timestamp = nowIso();
    const board = await store.createBoard({
      boardId: generateId("board"),
      tenantId: principal.tenantId,
      authorityId: principal.authorityId,
      jurisdictionId: principal.jurisdictionId,
      ownerActorId: principal.actorId,
      title: body.title,
      description:
        typeof body.description === "string" ? body.description : null,
      visibility,
      contentLocale: "de",
      templateKey: null,
      templateVersion: null,
      purpose: null,
      lifecycleStage: null,
      version: 1,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await audit("BOARD_CREATED", principal.tenantId, principal.actorId, {
      boardId: board.boardId,
      visibility: board.visibility,
    });
    return reply.code(201).header("etag", etagFor(board.version)).send(board);
  });

  app.get<{ Params: { boardId: string } }>(
    "/api/v1/boards/:boardId",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
        "read",
      );
      if (!loaded) {
        return;
      }
      const [columns, cards] = await Promise.all([
        store.listColumns({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
        }),
        store.listCards({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
        }),
      ]);
      return reply
        .header("etag", etagFor(loaded.board.version))
        .send({ board: loaded.board, columns, cards });
    },
  );

  app.patch<{
    Params: { boardId: string };
    Body: { title?: unknown; description?: unknown; visibility?: unknown };
  }>("/api/v1/boards/:boardId", boardsCollaborate, async (request, reply) => {
    const loaded = await loadAccessibleBoard(
      request,
      reply,
      request.params.boardId,
      "manage",
    );
    if (!loaded) {
      return;
    }
    const expectedVersion = requireIfMatch(request, reply);
    if (expectedVersion === undefined) {
      return;
    }
    const body = request.body ?? {};
    await handleStoreErrors(reply, async () => {
      const updated = await store.updateBoard({
        tenantId: loaded.principal.tenantId,
        boardId: loaded.board.boardId,
        expectedVersion,
        patch: {
          ...(typeof body.title === "string" ? { title: body.title } : {}),
          ...(typeof body.description === "string"
            ? { description: body.description }
            : {}),
          ...(body.visibility === "team" || body.visibility === "personal"
            ? { visibility: body.visibility }
            : {}),
        },
      });
      if (updated.visibility !== loaded.board.visibility) {
        // "BOARD_SHARED"/Entzug der Team-Sichtbarkeit — sicherheitsrelevant, weil sich
        // der Leserkreis ändert.
        await audit(
          "BOARD_VISIBILITY_CHANGED",
          loaded.principal.tenantId,
          loaded.principal.actorId,
          {
            boardId: updated.boardId,
            visibility: updated.visibility,
          },
        );
      }
      await reply.header("etag", etagFor(updated.version)).send(updated);
    });
  });

  app.post<{ Params: { boardId: string } }>(
    "/api/v1/boards/:boardId/archive",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
        "manage",
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      await handleStoreErrors(reply, async () => {
        const archived = await store.archiveBoard({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          expectedVersion,
        });
        await audit(
          "BOARD_ARCHIVED",
          loaded.principal.tenantId,
          loaded.principal.actorId,
          { boardId: archived.boardId },
        );
        await reply.header("etag", etagFor(archived.version)).send(archived);
      });
    },
  );

  app.post<{ Params: { boardId: string } }>(
    "/api/v1/boards/:boardId/restore",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
        "manage",
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      await handleStoreErrors(reply, async () => {
        const restored = await store.restoreBoard({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          expectedVersion,
        });
        // Restore öffnet ein eingefrorenes (Team-)Board wieder für alle Mitglieder —
        // genauso sicherheitsrelevant wie das Archivieren (Codex-Review PR #27, Runde 5).
        await audit(
          "BOARD_RESTORED",
          loaded.principal.tenantId,
          loaded.principal.actorId,
          { boardId: restored.boardId },
        );
        await reply.header("etag", etagFor(restored.version)).send(restored);
      });
    },
  );

  // ─── Columns ─────────────────────────────────────────────────────────

  app.post<{ Params: { boardId: string }; Body: { title?: unknown } }>(
    "/api/v1/boards/:boardId/columns",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const body = request.body ?? {};
      if (typeof body.title !== "string" || body.title.trim() === "") {
        return reply.code(400).send({ error: "title is required" });
      }
      const existingColumns = await store.listColumns({
        tenantId: loaded.principal.tenantId,
        boardId: loaded.board.boardId,
        includeArchived: true,
      });
      const lastKey = existingColumns.at(-1)?.positionKey ?? null;
      const timestamp = nowIso();
      const column = await store.createColumn({
        columnId: generateId("column"),
        boardId: loaded.board.boardId,
        title: body.title,
        positionKey: nextPositionKey(lastKey, null),
        version: 1,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return reply
        .code(201)
        .header("etag", etagFor(column.version))
        .send(column);
    },
  );

  app.patch<{
    Params: { boardId: string; columnId: string };
    Body: { title?: unknown };
  }>(
    "/api/v1/boards/:boardId/columns/:columnId",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      const body = request.body ?? {};
      await handleStoreErrors(reply, async () => {
        const updated = await store.updateColumn({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          columnId: request.params.columnId,
          expectedVersion,
          patch: {
            ...(typeof body.title === "string" ? { title: body.title } : {}),
          },
        });
        await reply.header("etag", etagFor(updated.version)).send(updated);
      });
    },
  );

  app.post<{ Params: { boardId: string; columnId: string } }>(
    "/api/v1/boards/:boardId/columns/:columnId/archive",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      await handleStoreErrors(reply, async () => {
        const archived = await store.archiveColumn({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          columnId: request.params.columnId,
          expectedVersion,
        });
        await reply.header("etag", etagFor(archived.version)).send(archived);
      });
    },
  );

  app.post<{ Params: { boardId: string; columnId: string } }>(
    "/api/v1/boards/:boardId/columns/:columnId/restore",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      await handleStoreErrors(reply, async () => {
        const restored = await store.restoreColumn({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          columnId: request.params.columnId,
          expectedVersion,
        });
        await reply.header("etag", etagFor(restored.version)).send(restored);
      });
    },
  );

  // ─── Cards ───────────────────────────────────────────────────────────

  // Ziel-Spalte gehört zum geladenen Board? Weder Route noch Schema erzwingen das sonst
  // (FK zeigt nur auf app_board_columns.column_id) — eine fremde columnId würde eine Karte
  // erzeugen, die in keiner Spalte dieses Boards rendert und am Lebenszyklus des fremden
  // Boards hängt. Gilt für Anlegen UND Verschieben; archivierte Spalten sind kein Ziel.
  async function requireBoardColumn(
    reply: FastifyReply,
    scope: { tenantId: string; boardId: string },
    columnId: string,
  ): Promise<boolean> {
    const columns = await store.listColumns(scope);
    if (!columns.some((column) => column.columnId === columnId)) {
      await reply
        .code(400)
        .send({ error: `column "${columnId}" does not belong to this board` });
      return false;
    }
    return true;
  }

  app.get<{ Params: { boardId: string } }>(
    "/api/v1/boards/:boardId/cards/archived",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
        "read",
      );
      if (!loaded) {
        return;
      }
      const cards = await store.listCards({
        tenantId: loaded.principal.tenantId,
        boardId: loaded.board.boardId,
        includeArchived: true,
      });
      return reply.send(cards.filter((card) => card.archivedAt !== null));
    },
  );

  app.post<{
    Params: { boardId: string };
    Body: {
      columnId?: unknown;
      title?: unknown;
      kind?: unknown;
      priority?: unknown;
      descriptionMarkdown?: unknown;
    };
  }>(
    "/api/v1/boards/:boardId/cards",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const body = request.body ?? {};
      if (typeof body.columnId !== "string") {
        return reply.code(400).send({ error: "columnId is required" });
      }
      if (typeof body.title !== "string" || body.title.trim() === "") {
        return reply.code(400).send({ error: "title is required" });
      }
      const columnScope = {
        tenantId: loaded.principal.tenantId,
        boardId: loaded.board.boardId,
      };
      if (!(await requireBoardColumn(reply, columnScope, body.columnId))) {
        return;
      }
      const existingCards = await store.listCards({
        tenantId: loaded.principal.tenantId,
        boardId: loaded.board.boardId,
        includeArchived: true,
      });
      const lastKeyInColumn = existingCards
        .filter((card) => card.columnId === body.columnId)
        .at(-1)?.positionKey;
      const timestamp = nowIso();
      const kind: CardKind = isCardKind(body.kind) ? body.kind : "task";
      const priority: CardPriority = isCardPriority(body.priority)
        ? body.priority
        : "normal";
      const card = await store.createCard({
        cardId: generateId("card"),
        boardId: loaded.board.boardId,
        columnId: body.columnId,
        title: body.title,
        descriptionMarkdown:
          typeof body.descriptionMarkdown === "string"
            ? body.descriptionMarkdown
            : null,
        kind,
        priority,
        assigneeActorId: null,
        dueAt: null,
        blockedReason: null,
        positionKey: nextPositionKey(lastKeyInColumn ?? null, null),
        labels: [],
        sourceKey: null,
        createdByActorId: loaded.principal.actorId,
        version: 1,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return reply.code(201).header("etag", etagFor(card.version)).send(card);
    },
  );

  app.patch<{
    Params: { boardId: string; cardId: string };
    Body: Record<string, unknown>;
  }>(
    "/api/v1/boards/:boardId/cards/:cardId",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      const body = request.body ?? {};
      await handleStoreErrors(reply, async () => {
        const updated = await store.updateCard({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          cardId: request.params.cardId,
          expectedVersion,
          patch: buildCardPatch(body),
        });
        await reply.header("etag", etagFor(updated.version)).send(updated);
      });
    },
  );

  app.post<{
    Params: { boardId: string; cardId: string };
    Body: { toColumnId?: unknown; toPositionKey?: unknown };
  }>(
    "/api/v1/boards/:boardId/cards/:cardId/move",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      const body = request.body ?? {};
      if (typeof body.toColumnId !== "string") {
        return reply.code(400).send({ error: "toColumnId is required" });
      }
      const moveScope = {
        tenantId: loaded.principal.tenantId,
        boardId: loaded.board.boardId,
      };
      if (!(await requireBoardColumn(reply, moveScope, body.toColumnId))) {
        return;
      }
      let toPositionKey: string;
      if (typeof body.toPositionKey === "string") {
        toPositionKey = body.toPositionKey;
      } else {
        const cardsInTarget = await store.listCards({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          includeArchived: true,
        });
        const lastKey = cardsInTarget
          .filter((card) => card.columnId === body.toColumnId)
          .at(-1)?.positionKey;
        toPositionKey = nextPositionKey(lastKey ?? null, null);
      }
      await handleStoreErrors(reply, async () => {
        const moved = await store.moveCard({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          cardId: request.params.cardId,
          expectedVersion,
          toColumnId: body.toColumnId as string,
          toPositionKey,
        });
        await reply.header("etag", etagFor(moved.version)).send(moved);
      });
    },
  );

  app.post<{ Params: { boardId: string; cardId: string } }>(
    "/api/v1/boards/:boardId/cards/:cardId/archive",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      await handleStoreErrors(reply, async () => {
        const archived = await store.archiveCard({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          cardId: request.params.cardId,
          expectedVersion,
        });
        await reply.header("etag", etagFor(archived.version)).send(archived);
      });
    },
  );

  app.post<{ Params: { boardId: string; cardId: string } }>(
    "/api/v1/boards/:boardId/cards/:cardId/restore",
    boardsCollaborate,
    async (request, reply) => {
      const loaded = await loadAccessibleBoard(
        request,
        reply,
        request.params.boardId,
      );
      if (!loaded) {
        return;
      }
      const expectedVersion = requireIfMatch(request, reply);
      if (expectedVersion === undefined) {
        return;
      }
      await handleStoreErrors(reply, async () => {
        const restored = await store.restoreCard({
          tenantId: loaded.principal.tenantId,
          boardId: loaded.board.boardId,
          cardId: request.params.cardId,
          expectedVersion,
        });
        await reply.header("etag", etagFor(restored.version)).send(restored);
      });
    },
  );
}

function isCardKind(value: unknown): value is CardKind {
  return (
    typeof value === "string" &&
    [
      "question",
      "hypothesis",
      "research",
      "decision",
      "feature",
      "task",
      "risk",
      "defect",
    ].includes(value)
  );
}

function isCardPriority(value: unknown): value is CardPriority {
  return (
    typeof value === "string" &&
    ["low", "normal", "high", "critical"].includes(value)
  );
}

function buildCardPatch(body: Record<string, unknown>) {
  const patch: Parameters<KanbanStore["updateCard"]>[0]["patch"] = {};
  if (typeof body["title"] === "string") {
    patch.title = body["title"];
  }
  if (typeof body["descriptionMarkdown"] === "string") {
    patch.descriptionMarkdown = body["descriptionMarkdown"];
  }
  if (isCardKind(body["kind"])) {
    patch.kind = body["kind"];
  }
  if (isCardPriority(body["priority"])) {
    patch.priority = body["priority"];
  }
  if (
    typeof body["assigneeActorId"] === "string" ||
    body["assigneeActorId"] === null
  ) {
    patch.assigneeActorId = body["assigneeActorId"] as string | null;
  }
  if (typeof body["dueAt"] === "string" || body["dueAt"] === null) {
    patch.dueAt = body["dueAt"] as string | null;
  }
  if (
    typeof body["blockedReason"] === "string" ||
    body["blockedReason"] === null
  ) {
    patch.blockedReason = body["blockedReason"] as string | null;
  }
  if (Array.isArray(body["labels"])) {
    patch.labels = body["labels"] as string[];
  }
  return patch;
}
