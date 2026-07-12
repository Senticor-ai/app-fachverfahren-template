import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  expect,
  screen,
  userEvent,
  waitForElementToBeRemoved,
  within,
} from "storybook/test";
import { BoardList } from "../components/BoardList.js";
import { BoardCardDetail } from "../components/BoardCardDetail.js";
import { KanbanBoard } from "../components/KanbanBoard.js";
import { MoveCardMenu } from "../components/MoveCardMenu.js";
import { createBoardStore } from "../board-store.js";
import type {
  Board,
  BoardCard,
  BoardColumn,
  BoardLabel,
  BoardPort,
} from "../board-types.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { nextPositionKey } from "../lib/position.js";

// `positionKey` MUSS über `nextPositionKey` (fractional-indexing) erzeugt werden — die
// Bibliothek validiert ihr eigenes Format streng und lehnt handgeschriebene Literale wie "a"/"b"
// ab, sobald eine echte Operation (z. B. Drag-and-Drop) eine neue Position relativ dazu berechnet.
function sequentialKeys(count: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    keys.push(nextPositionKey(keys[i - 1] ?? null, null));
  }
  return keys;
}

// Kanban-Boards — Storybook-driven review (siehe docs/ux-ui/screen-contracts/boards-list.yaml,
// board-detail.yaml). Default/Loading/Empty/Error je Screen, plus dedizierte Stories für
// Drag-and-Drop, Labels, Spalten-Verwaltung und die Kartendetailansicht (Kommentare, Zuweisung,
// Checkliste) — alles zunächst gegen den In-Memory-`BoardPort`, bevor die Server-Anbindung
// nachgezogen wird (siehe optionale Methoden in `board-types.ts`).

const NOW = "2026-07-11T09:00:00.000Z";

const LABELS: BoardLabel[] = [
  { labelId: "label.blocker", name: "Blocker", color: "red" },
  { labelId: "label.legal", name: "Rechtlich", color: "purple" },
  { labelId: "label.ux", name: "UX", color: "pink" },
  { labelId: "label.nice", name: "Nice-to-have", color: "sky" },
];

function seededBoard(): {
  board: Board;
  columns: BoardColumn[];
  cards: BoardCard[];
} {
  const board: Board = {
    boardId: "board.demo",
    title: "Build the Fachverfahren",
    description:
      "Definieren, validieren, bauen und betreiben Sie die richtige Fachverfahren-Anwendung.",
    visibility: "personal",
    contentLocale: "de",
    version: 1,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    labels: LABELS,
    members: [
      { actorId: "actor.owner", displayName: "Alex Owner" },
      { actorId: "actor.mira", displayName: "Mira Sachbearbeitung" },
    ],
  };
  const [inboxKey, understandKey, decideKey, readyKey] = sequentialKeys(4);
  const columns: BoardColumn[] = [
    {
      columnId: "col.inbox",
      boardId: board.boardId,
      title: "Inbox / Fragen",
      positionKey: inboxKey!,
      version: 1,
      archivedAt: null,
    },
    {
      columnId: "col.understand",
      boardId: board.boardId,
      title: "Verstehen",
      positionKey: understandKey!,
      version: 1,
      archivedAt: null,
    },
    {
      columnId: "col.decide",
      boardId: board.boardId,
      title: "Entscheiden",
      positionKey: decideKey!,
      version: 1,
      archivedAt: null,
    },
    {
      columnId: "col.ready",
      boardId: board.boardId,
      title: "Bereit",
      positionKey: readyKey!,
      version: 1,
      archivedAt: null,
    },
  ];
  const [card1Key] = sequentialKeys(1);
  const [card2Key] = sequentialKeys(1);
  const [card3Key, card4Key] = sequentialKeys(2);
  const cards: BoardCard[] = [
    {
      cardId: "card.1",
      boardId: board.boardId,
      columnId: "col.inbox",
      title: "Leistungsziel und Zielgruppe definieren",
      descriptionMarkdown: null,
      kind: "question",
      priority: "normal",
      assigneeActorId: null,
      dueAt: null,
      blockedReason: null,
      positionKey: card1Key!,
      labelIds: ["label.ux"],
      checklist: [],
      comments: [],
      version: 1,
      archivedAt: null,
    },
    {
      cardId: "card.2",
      boardId: board.boardId,
      columnId: "col.understand",
      title: "Rechtsgrundlage identifizieren",
      descriptionMarkdown:
        "Welche Norm(en)/Satzung tragen diese Leistung? Gibt es kommunale Spielräume?",
      kind: "research",
      priority: "high",
      assigneeActorId: "actor.mira",
      dueAt: "2026-07-20T00:00:00.000Z",
      blockedReason: null,
      positionKey: card2Key!,
      labelIds: ["label.legal"],
      checklist: [
        { itemId: "item.1", text: "Satzung Musterstadt prüfen", done: true },
        { itemId: "item.2", text: "Rückfrage Rechtsamt stellen", done: false },
      ],
      comments: [
        {
          commentId: "comment.1",
          authorName: "Mira Sachbearbeitung",
          body: "Rechtsamt hat Rückfrage erhalten, Antwort bis Freitag zugesagt.",
          createdAt: "2026-07-10T14:30:00.000Z",
        },
      ],
      version: 1,
      archivedAt: null,
    },
    {
      cardId: "card.3",
      boardId: board.boardId,
      columnId: "col.decide",
      title: "Authentifizierung und Vertrauensniveau festlegen",
      descriptionMarkdown: null,
      kind: "decision",
      priority: "critical",
      assigneeActorId: "actor.owner",
      dueAt: null,
      blockedReason: "Wartet auf Rückmeldung der Aufsicht",
      positionKey: card3Key!,
      labelIds: ["label.blocker", "label.legal"],
      checklist: [
        {
          itemId: "item.3",
          text: "Vertrauensniveau-Optionen auflisten",
          done: true,
        },
        { itemId: "item.4", text: "Aufsicht konsultieren", done: false },
        { itemId: "item.5", text: "Entscheidung dokumentieren", done: false },
      ],
      comments: [],
      version: 1,
      archivedAt: null,
    },
    {
      cardId: "card.4",
      boardId: board.boardId,
      columnId: "col.decide",
      title: "MVP-Hypothesen und Erfolgskriterien festlegen",
      descriptionMarkdown: null,
      kind: "hypothesis",
      priority: "normal",
      assigneeActorId: null,
      dueAt: null,
      blockedReason: null,
      positionKey: card4Key!,
      labelIds: ["label.nice"],
      checklist: [],
      comments: [],
      version: 1,
      archivedAt: null,
    },
  ];
  return { board, columns, cards };
}

function createSeededPort(): BoardPort {
  const { board, columns, cards } = seededBoard();
  return createBoardStore({ boards: [board], columns, cards });
}

function createNeverResolvingPort(): BoardPort {
  return new Proxy({} as BoardPort, {
    get: () => () => new Promise(() => undefined),
  });
}

function createFailingPort(): BoardPort {
  return new Proxy({} as BoardPort, {
    get: () => async () => {
      throw new Error("network error");
    },
  });
}

const meta = {
  title: "Kanban/Übersicht",
  decorators: [
    (Story) => (
      <StatusRegionProvider>
        <Story />
      </StatusRegionProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Screen Contract: docs/ux-ui/screen-contracts/boards-list.yaml ──────────

export const BoardsListDefault: Story = {
  name: "BoardList — Default",
  render: () => (
    <BoardList port={createSeededPort()} onOpen={() => undefined} />
  ),
};

export const BoardsListLoading: Story = {
  name: "BoardList — Loading",
  render: () => (
    <BoardList port={createNeverResolvingPort()} onOpen={() => undefined} />
  ),
};

export const BoardsListEmpty: Story = {
  name: "BoardList — Empty",
  render: () => (
    <BoardList port={createBoardStore()} onOpen={() => undefined} />
  ),
};

export const BoardsListError: Story = {
  name: "BoardList — Error",
  render: () => (
    <BoardList port={createFailingPort()} onOpen={() => undefined} />
  ),
};

// ── Screen Contract: docs/ux-ui/screen-contracts/board-detail.yaml ─────────

export const BoardDetailDefault: Story = {
  name: "KanbanBoard — Default (Labels, Checkliste, Kommentare, Zuweisung)",
  parameters: {
    docs: {
      description: {
        story:
          "Karten ziehen und ablegen — per Maus/Touch (Ziehgriff links an jeder Karte) oder per Tastatur: Tab zum Griff, Leertaste zum Greifen, Pfeiltasten zum Bewegen, Leertaste zum Ablegen. Spalten lassen sich rechts über „Spalte hinzufügen“ ergänzen, über das ⋮-Menü im Spaltenkopf archivieren, und per Klick auf den Titel umbenennen. Klick auf eine Karte öffnet die Detailansicht.",
      },
    },
  },
  render: () => (
    <div style={{ height: "700px" }}>
      <KanbanBoard boardId="board.demo" port={createSeededPort()} />
    </div>
  ),
};

export const BoardDetailLoading: Story = {
  name: "KanbanBoard — Loading",
  render: () => (
    <div style={{ height: "600px" }}>
      <KanbanBoard boardId="board.demo" port={createNeverResolvingPort()} />
    </div>
  ),
};

export const BoardDetailEmpty: Story = {
  name: "KanbanBoard — Empty (board without columns)",
  render: () => {
    const board: Board = {
      boardId: "board.empty",
      title: "Neues Board",
      description: null,
      visibility: "personal",
      contentLocale: "de",
      version: 1,
      archivedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      labels: [],
      members: [],
    };
    const port = createBoardStore({ boards: [board] });
    return (
      <div style={{ height: "600px" }}>
        <KanbanBoard boardId="board.empty" port={port} />
      </div>
    );
  },
};

export const BoardDetailError: Story = {
  name: "KanbanBoard — Error",
  render: () => (
    <div style={{ height: "600px" }}>
      <KanbanBoard boardId="board.demo" port={createFailingPort()} />
    </div>
  ),
};

export const BoardDetailNoOptionalFeatures: Story = {
  name: "KanbanBoard — Ohne optionale Server-Fähigkeiten (Labels/Checkliste/Kommentare aus)",
  parameters: {
    docs: {
      description: {
        story:
          "Simuliert den heutigen echten `board-client.ts`: Labels-Anlage, Checkliste und Kommentare sind optionale `BoardPort`-Methoden und noch nicht serverseitig gebaut — die entsprechenden Abschnitte blenden sich in der Detailansicht selbst aus, der Rest bleibt voll funktionsfähig.",
      },
    },
  },
  render: () => {
    const { board, columns, cards } = seededBoard();
    const full = createBoardStore({ boards: [board], columns, cards });
    const limited: BoardPort = {
      listBoards: full.listBoards,
      getBoard: full.getBoard,
      createBoard: full.createBoard,
      createColumn: full.createColumn,
      archiveColumn: full.archiveColumn,
      createCard: full.createCard,
      updateCard: full.updateCard,
      moveCard: full.moveCard,
      archiveCard: full.archiveCard,
      restoreCard: full.restoreCard,
    };
    return (
      <div style={{ height: "700px" }}>
        <KanbanBoard boardId="board.demo" port={limited} />
      </div>
    );
  },
};

// ── A11y: "Karte per Tastatur verschieben" (Kanban-Plan Entscheidung 8) ─────

export const MoveCardMenuKeyboard: Story = {
  name: "MoveCardMenu — Karte per Tastatur verschieben (redundanter Pfad)",
  parameters: {
    docs: {
      description: {
        story:
          "Der immer sichtbare „Verschieben“-Button bleibt zusätzlich zum Drag-and-Drop bestehen — schneller bei vielen Spalten und ein verlässlicher Pfad für alle, die keine Ziehgeste nutzen möchten.",
      },
    },
  },
  render: () => {
    const { columns, cards } = seededBoard();
    return <MoveCardMenuDemo columns={columns} card={cards[0] ?? null} />;
  },
};

function MoveCardMenuDemo({
  columns,
  card,
}: {
  columns: BoardColumn[];
  card: BoardCard | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <p style={{ padding: "1rem" }}>
        Tab zum Öffnen erneut fokussieren, Enter bestätigt die Auswahl. Alle
        Steuerelemente sind ohne Zeigegerät bedienbar.
      </p>
      <MoveCardMenu
        card={card}
        columns={columns}
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => undefined}
      />
    </>
  );
}

// ── Kartendetailansicht: Labels, Zuweisung, Fälligkeit, Checkliste, Kommentare ──

export const CardDetailDefault: Story = {
  name: "BoardCardDetail — Karte mit Labels, Checkliste und Kommentaren",
  render: () => {
    const { board, columns, cards } = seededBoard();
    const port = createBoardStore({ boards: [board], columns, cards });
    return (
      <CardDetailDemo
        board={board}
        columns={columns}
        card={cards[1] ?? null}
        port={port}
      />
    );
  },
};

export const CardDetailEmptyCard: Story = {
  name: "BoardCardDetail — Neue, leere Karte",
  render: () => {
    const { board, cards, columns } = seededBoard();
    const port = createBoardStore({ boards: [board], columns, cards });
    return (
      <CardDetailDemo
        board={board}
        columns={columns}
        card={cards[0] ?? null}
        port={port}
      />
    );
  },
};

function CardDetailDemo({
  board,
  columns,
  card,
  port,
}: {
  board: Board;
  columns: BoardColumn[];
  card: BoardCard | null;
  port: BoardPort;
}) {
  const [open, setOpen] = useState(true);
  return (
    <BoardCardDetail
      card={card}
      board={board}
      columns={columns}
      open={open}
      onOpenChange={setOpen}
      port={port}
      onChanged={() => undefined}
    />
  );
}

// ── Storybook-Testdaten für Skala/Performance — NIE in einen echten Bootstrap
//    seeden (Kanban-Plan Entscheidung 14: getrennt von `fachverfahren-discovery-v1`). ──

export const BoardDetailBusyFixture: Story = {
  name: "KanbanBoard — kanban-busy-fixture (viele Karten, alle Spalten)",
  parameters: {
    docs: {
      description: {
        story:
          "Nur für Storybook/visuelle Regression/Performance — dieses dicht befüllte Board wird NIE in einen echten Bootstrap geseedet (siehe Kanban-Plan Entscheidung 14).",
      },
    },
  },
  render: () => {
    const board: Board = {
      ...seededBoard().board,
      boardId: "board.busy",
      title: "kanban-busy-fixture",
    };
    const columns = seededBoard().columns.map((column) => ({
      ...column,
      boardId: board.boardId,
    }));
    const cardKeys = sequentialKeys(6);
    const cards: BoardCard[] = columns.flatMap((column, columnIndex) =>
      Array.from({ length: 6 }, (_, cardIndex) => ({
        cardId: `card.busy.${columnIndex}.${cardIndex}`,
        boardId: board.boardId,
        columnId: column.columnId,
        title: `Karte ${columnIndex + 1}.${cardIndex + 1}`,
        descriptionMarkdown: null,
        kind: (["task", "decision", "risk", "research"] as const)[
          cardIndex % 4
        ]!,
        priority: (["low", "normal", "high", "critical"] as const)[
          cardIndex % 4
        ]!,
        assigneeActorId: cardIndex % 2 === 0 ? "actor.owner" : null,
        dueAt: null,
        blockedReason: null,
        positionKey: cardKeys[cardIndex]!,
        labelIds: cardIndex % 3 === 0 ? ["label.blocker"] : [],
        checklist: [],
        comments: [],
        version: 1,
        archivedAt: null,
      })),
    );
    const port = createBoardStore({ boards: [board], columns, cards });
    return (
      <div style={{ height: "700px" }}>
        <KanbanBoard boardId={board.boardId} port={port} />
      </div>
    );
  },
};

// ── Workflows als `play`-Funktionen — die kritischen Interaktionen laufen automatisch ab,
//    sobald die Story geöffnet wird (lebende Dokumentation, kein passiver Screenshot). Spiegelt
//    dieselben Szenarien wie die echten Browser-Tests (`KanbanBoard.browser.test.tsx`), aber
//    innerhalb von Storybook selbst. Radix-Portale (Sheet/Dialog/AlertDialog/Select-Dropdown)
//    rendern außerhalb von `canvasElement` — dafür wird `screen` (ganzes Dokument) statt
//    `within(canvasElement)` verwendet, exakt wie `page` vs. gescopte Locators im Browser-Test. ──

export const WorkflowQuickAdd: Story = {
  name: "Workflow — Karte per Schnell-Hinzufügen anlegen",
  render: () => (
    <div style={{ height: "700px" }}>
      <KanbanBoard boardId="board.demo" port={createSeededPort()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const inboxColumn = canvas.getByRole("region", {
      name: "Spalte Inbox / Fragen",
    });
    const quickAdd = within(inboxColumn).getByLabelText(
      "Karte zu Inbox / Fragen hinzufügen",
    );
    await userEvent.type(quickAdd, "Per Storybook angelegte Karte");
    await userEvent.click(
      within(inboxColumn).getByRole("button", { name: "Karte anlegen" }),
    );
    await expect(
      within(inboxColumn).getByText("Per Storybook angelegte Karte"),
    ).toBeInTheDocument();
  },
};

export const WorkflowDragAndDrop: Story = {
  name: "Workflow — Karte per Pointer-Drag-and-Drop verschieben",
  parameters: {
    docs: {
      description: {
        story:
          'Bewusst OHNE `play`-Funktion: Ziehen Sie „Leistungsziel und Zielgruppe definieren" per Maus am Ziehgriff von „Inbox / Fragen" nach „Verstehen", um den Ablauf manuell zu prüfen. `@dnd-kit`s Drag-Erkennung basiert auf `PointerEvent.setPointerCapture`, das nur VERTRAUENSWÜRDIGE (echte) Pointer-Ereignisse akzeptiert — weder `userEvent.pointer()` noch manuell per `dispatchEvent` erzeugte `PointerEvent`s (beide `isTrusted: false`) lösen die Drag-Erkennung aus, real geprüft mit identischen Koordinaten, die über Playwrights CDP-gestütztes `page.mouse` zuverlässig funktionieren. Die automatisierte Abdeckung für genau dieses Verhalten liegt entsprechend im echten Browser-Test (`KanbanBoard.browser.test.tsx`, Szenario „verschiebt eine Karte per echtem Pointer-Drag-and-Drop"), nicht in Storybook.',
      },
    },
  },
  render: () => (
    <div style={{ height: "700px" }}>
      <KanbanBoard boardId="board.demo" port={createSeededPort()} />
    </div>
  ),
};

export const WorkflowKeyboardMove: Story = {
  name: 'Workflow — Karte per „Verschieben"-Dialog bewegen (Tastatur-Pfad)',
  render: () => (
    <div style={{ height: "700px" }}>
      <KanbanBoard boardId="board.demo" port={createSeededPort()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Karte MVP-Hypothesen und Erfolgskriterien festlegen öffnen",
      }),
    );
    // `findBy*` statt `getBy*` + `expect(...).toBeInTheDocument()`: Radix' Portal-Mount und
    // Fokus-Scope-Setup laufen über einen eigenen Effekt-/rAF-Zyklus nach dem Klick — `findBy*`
    // pollt darauf, während `getBy*` nur den Zustand im selben Tick liest (real als Storybook-
    // spezifische Racebedingung beobachtet, im echten Browser-Test mit `expect.element` unauffällig,
    // weil das dort ebenfalls pollt).
    const sheet = await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Verschieben" }));
    const moveDialog = await screen.findByRole("dialog", {
      name: "Karte verschieben",
    });

    await userEvent.click(
      within(moveDialog).getByLabelText("Zielspalte wählen"),
    );
    await screen.findByRole("option", { name: "Bereit" });
    await userEvent.click(screen.getByRole("option", { name: "Bereit" }));
    // Das Radix-Select-Dropdown ist selbst ein weiterer Portal-Layer und hebt beim Schließen
    // vorübergehend `aria-hidden` auf dem darunterliegenden Dialog auf — erst warten, bis die
    // Listbox wirklich aus dem Baum entfernt ist, dann den Bestätigen-Button suchen (sonst greift
    // die Suche mitten in die Schließ-Transition und findet den Dialog noch als „versteckt" vor).
    await waitForElementToBeRemoved(() => screen.queryByRole("listbox"));
    await userEvent.click(
      within(moveDialog).getByRole("button", { name: "Verschieben" }),
    );
    // Bis das MoveCardMenu-Dialog seine eigene Exit-Transition abgeschlossen hat, markiert Radix
    // die darunterliegende Kartendetailansicht (Sheet) weiter als `aria-hidden` — erst danach ist
    // deren Schließen-Button wieder abfragbar.
    await waitForElementToBeRemoved(() =>
      screen.queryByRole("dialog", { name: "Karte verschieben" }),
    );

    // Klick auf den sichtbaren Schließen-Button statt einer synthetischen Escape-Taste: Radix'
    // Escape-Handler in dieser Umgebung reagiert nur auf VERTRAUENSWÜRDIGE (echte) Tastaturereignisse
    // — `userEvent.keyboard("{Escape}")` (untrusted, per JS ausgelöst) ließ den Dialog real
    // beobachtet logisch offen (`data-state="open"`), während ein Klick zuverlässig schließt.
    await userEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    // Radix animiert das Schließen (200ms) und hält `aria-hidden` auf dem Board darunter bis zum
    // Ende der Exit-Transition — `findByRole` pollt, bis das Board wieder abfragbar ist.
    const targetColumn = await canvas.findByRole("region", {
      name: "Spalte Bereit",
    });
    await within(targetColumn).findByText(
      "MVP-Hypothesen und Erfolgskriterien festlegen",
    );
  },
};

export const WorkflowArchiveCard: Story = {
  name: "Workflow — Einzelne Karte aus der Detailansicht archivieren",
  render: () => (
    <div style={{ height: "700px" }}>
      <KanbanBoard boardId="board.demo" port={createSeededPort()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Karte Rechtsgrundlage identifizieren öffnen",
      }),
    );
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Archivieren" }));

    const confirmDialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Archivieren" }),
    );

    await expect(
      canvas.queryByText("Rechtsgrundlage identifizieren"),
    ).not.toBeInTheDocument();
  },
};

export const WorkflowBatchArchiveAndRestore: Story = {
  name: "Workflow — Spalte gesammelt archivieren und über das Archiv wiederherstellen",
  render: () => (
    <div style={{ height: "700px" }}>
      <KanbanBoard boardId="board.demo" port={createSeededPort()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Aktionen für Spalte Entscheiden" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", {
        name: /Alle Karten in dieser Spalte archivieren/,
      }),
    );

    const confirmDialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(confirmDialog).getByRole("button", { name: "Archivieren" }),
    );

    await expect(
      canvas.queryByText("Authentifizierung und Vertrauensniveau festlegen"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByText("MVP-Hypothesen und Erfolgskriterien festlegen"),
    ).not.toBeInTheDocument();

    // `findByRole` statt `getByRole`: Das AlertDialog animiert seine Exit-Transition, und
    // `aria-hidden` auf dem Board darunter wird erst danach entfernt — pollen statt einmalig lesen.
    await userEvent.click(
      await canvas.findByRole("button", { name: "Archiv" }),
    );
    const archivePanel = await screen.findByRole("dialog", {
      name: "Archivierte Karten",
    });

    const restoredRow = (
      await within(archivePanel).findByText(
        "MVP-Hypothesen und Erfolgskriterien festlegen",
      )
    ).closest("div")!;
    await userEvent.click(
      within(restoredRow).getByRole("button", { name: "Wiederherstellen" }),
    );

    await expect(
      within(archivePanel).queryByText(
        "MVP-Hypothesen und Erfolgskriterien festlegen",
      ),
    ).not.toBeInTheDocument();
    await expect(
      within(archivePanel).getByText(
        "Authentifizierung und Vertrauensniveau festlegen",
      ),
    ).toBeInTheDocument();
  },
};
