import type { Board, KanbanStore } from "@senticor/app-store-postgres";
import { nextPositionKey } from "@senticor/app-store-postgres";

export const STARTER_TEMPLATE_KEY = "personal-starter-v1";
export const STARTER_TEMPLATE_VERSION = 1;

export interface SeedStarterBoardInput {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  ownerActorId: string;
  contentLocale: string;
  now: Date;
}

export interface StarterBoardIds {
  generateId: (prefix: string) => string;
}

const COLUMN_TITLES = ["Eingang", "In Arbeit", "Review", "Erledigt"] as const;

interface StarterCardSeed {
  sourceKey: string;
  column: (typeof COLUMN_TITLES)[number];
  title: string;
  descriptionMarkdown: string;
}

const CARD_SEEDS: StarterCardSeed[] = [
  {
    sourceKey: "welcome",
    column: "Eingang",
    title: "Willkommen! So funktioniert dieses Board",
    descriptionMarkdown: [
      "## Ihr persönliches Board",
      "",
      "Ziehen Sie Karten zwischen den Spalten, um Ihren Arbeitsstand festzuhalten —",
      "für eigene Aufgaben, Notizen und Verbesserungsideen.",
      "",
      "- [ ] Eine eigene Karte anlegen",
      "- [ ] Diese Karte nach „Erledigt“ ziehen",
    ].join("\n"),
  },
  {
    sourceKey: "team-board",
    column: "Eingang",
    title: "Das Team-Board kennenlernen",
    descriptionMarkdown: [
      "Unter **Boards** finden Sie das gemeinsame „Fachverfahren Discovery Board“ —",
      "dort arbeitet das ganze Team an Anforderungen, Fachkonzept und Umsetzung mit.",
    ].join("\n"),
  },
];

/** Persönliches Starter-Board für JEDES neu angelegte Konto (Feature-Entscheid „Beides"):
 *  vier Workflow-Spalten plus zwei Onboarding-Karten mit stabilen sourceKeys (idempotent
 *  über den Unique-Index (board_id, source_key), Muster wie seedDiscoveryBoard). */
export async function seedPersonalStarterBoard(
  store: KanbanStore,
  input: SeedStarterBoardInput,
  ids: StarterBoardIds,
): Promise<Board> {
  const nowIso = input.now.toISOString();

  const board = await store.createBoard({
    boardId: ids.generateId("board"),
    tenantId: input.tenantId,
    authorityId: input.authorityId,
    jurisdictionId: input.jurisdictionId,
    ownerActorId: input.ownerActorId,
    title: "Mein Board",
    description: "Ihr persönliches Board für eigene Aufgaben und Notizen.",
    visibility: "personal",
    contentLocale: input.contentLocale,
    templateKey: STARTER_TEMPLATE_KEY,
    templateVersion: STARTER_TEMPLATE_VERSION,
    purpose: "personal-tasks",
    lifecycleStage: null,
    version: 1,
    archivedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const columnIdsByTitle = new Map<string, string>();
  let previousColumnKey: string | null = null;
  for (const title of COLUMN_TITLES) {
    const positionKey = nextPositionKey(previousColumnKey, null);
    const column = await store.createColumn({
      columnId: ids.generateId("column"),
      boardId: board.boardId,
      title,
      positionKey,
      version: 1,
      archivedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    columnIdsByTitle.set(title, column.columnId);
    previousColumnKey = positionKey;
  }

  let previousCardKey: string | null = null;
  for (const seed of CARD_SEEDS) {
    const columnId = columnIdsByTitle.get(seed.column);
    if (!columnId) {
      throw new Error(
        `starter board seed references unknown column "${seed.column}"`,
      );
    }
    const positionKey = nextPositionKey(previousCardKey, null);
    previousCardKey = positionKey;
    await store.createCard({
      cardId: ids.generateId("card"),
      boardId: board.boardId,
      columnId,
      title: seed.title,
      descriptionMarkdown: seed.descriptionMarkdown,
      kind: "task",
      priority: "normal",
      assigneeActorId: null,
      dueAt: null,
      blockedReason: null,
      positionKey,
      labels: [],
      sourceKey: seed.sourceKey,
      createdByActorId: input.ownerActorId,
      version: 1,
      archivedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  return board;
}
