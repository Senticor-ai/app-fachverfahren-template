// KanbanBoard.browser.test.tsx — echte Browser-Tests (Playwright/Chromium via vitest-browser-react).
// jsdom kann `@dnd-kit`s PointerSensor nicht korrekt simulieren (echte PointerEvent-Sequenzen mit
// Bewegungs-Schwellwert) — diese Suite beweist die kritischen Workflows (Drag-and-Drop, Tastatur-
// Verschieben über den Menü-Pfad, Archivieren/Wiederherstellen) tatsächlich in einem echten Browser,
// nicht nur per Code-Review.
import { page, userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { createBoardStore } from "../board-store.js";
import type { Board, BoardCard, BoardColumn } from "../board-types.js";
import { nextPositionKey } from "../lib/position.js";
import { KanbanBoard } from "./KanbanBoard.js";
import { StatusRegionProvider } from "./StatusRegion.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(async () => {
  // `cleanup()` ist async — ungeawaitet lief das Unmounten des Vortests noch, während der
  // nächste Test schon `render()` aufrief.
  await cleanup();
  // `@dnd-kit/core`s `AbstractPointerSensor.detach()` lässt einen dokumentweiten, capture-phase
  // `click`-Listener (mit `stopPropagation`) bewusst 50ms nachwirken, um den „Geister-Klick" zu
  // schlucken, den der Browser nach einer echten Ziehgeste auslöst — dieser Listener hängt am
  // `document`, nicht an der React-Baum-Instanz, überlebt also `cleanup()` unverändert. Landet
  // der erste Klick des NÄCHSTEN Tests innerhalb dieses Fensters, wird er lautlos verschluckt
  // (Playwright meldet den Klick trotzdem als erfolgreich) — real gegen Chromium reproduziert im
  // Test „verschiebt eine Karte über den Verschieben-Dialog", der direkt auf den Pointer-Drag-
  // and-Drop-Test folgt. Warten, bis dnd-kits eigener Timer abgelaufen ist.
  await wait(75);
});

// `positionKey` MUSS über `nextPositionKey` (fractional-indexing) erzeugt werden, nie als
// Literal wie "a"/"b" — die Bibliothek validiert ihr eigenes Format streng und wirft bei
// nicht-konformen Schlüsseln, sobald ein echtes Drag-and-Drop eine neue Position relativ zu
// einem bestehenden Schlüssel berechnet (genau das hat dieser Test aufgedeckt).
function seed(): { board: Board; columns: BoardColumn[]; cards: BoardCard[] } {
  const now = new Date().toISOString();
  const board: Board = {
    boardId: "board.browser",
    title: "Browser-Test-Board",
    description: null,
    visibility: "personal",
    contentLocale: "de",
    version: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    labels: [],
    members: [],
  };
  const todoKey = nextPositionKey(null, null);
  const doneKey = nextPositionKey(todoKey, null);
  const columns: BoardColumn[] = [
    {
      columnId: "col.todo",
      boardId: board.boardId,
      title: "Offen",
      positionKey: todoKey,
      version: 1,
      archivedAt: null,
    },
    {
      columnId: "col.done",
      boardId: board.boardId,
      title: "Fertig",
      positionKey: doneKey,
      version: 1,
      archivedAt: null,
    },
  ];
  const cardAKey = nextPositionKey(null, null);
  const cardBKey = nextPositionKey(cardAKey, null);
  const cards: BoardCard[] = [
    {
      cardId: "card.a",
      boardId: board.boardId,
      columnId: "col.todo",
      title: "Karte A",
      descriptionMarkdown: null,
      kind: "task",
      priority: "normal",
      assigneeActorId: null,
      dueAt: null,
      blockedReason: null,
      positionKey: cardAKey,
      labelIds: [],
      checklist: [],
      comments: [],
      version: 1,
      archivedAt: null,
    },
    {
      cardId: "card.b",
      boardId: board.boardId,
      columnId: "col.todo",
      title: "Karte B",
      descriptionMarkdown: null,
      kind: "task",
      priority: "normal",
      assigneeActorId: null,
      dueAt: null,
      blockedReason: null,
      positionKey: cardBKey,
      labelIds: [],
      checklist: [],
      comments: [],
      version: 1,
      archivedAt: null,
    },
  ];
  return { board, columns, cards };
}

function renderBoard() {
  const { board, columns, cards } = seed();
  const port = createBoardStore({ boards: [board], columns, cards });
  render(
    <StatusRegionProvider>
      <div style={{ height: "600px" }}>
        <KanbanBoard boardId={board.boardId} port={port} />
      </div>
    </StatusRegionProvider>,
  );
  return { board, columns, cards, port };
}

describe("KanbanBoard — echter Browser", () => {
  it("legt per Quick-Add eine neue Karte in der richtigen Spalte an", async () => {
    renderBoard();

    await expect
      .element(page.getByRole("heading", { name: "Browser-Test-Board" }))
      .toBeVisible();

    const todoColumn = page.getByRole("region", { name: "Spalte Offen" });
    const quickAdd = todoColumn.getByLabelText("Karte zu Offen hinzufügen");
    await quickAdd.fill("Neue Karte per Tastatur");
    await todoColumn.getByRole("button", { name: "Karte anlegen" }).click();

    await expect
      .element(page.getByText("Neue Karte per Tastatur"))
      .toBeVisible();
  });

  it("verschiebt eine Karte per echtem Pointer-Drag-and-Drop in eine andere Spalte", async () => {
    renderBoard();

    const handle = page.getByRole("button", {
      name: /Karte A greifen und mit Pfeiltasten verschieben/,
    });
    const targetColumn = page.getByRole("region", { name: "Spalte Fertig" });

    // Vorbedingung: Karte A ist noch nicht in der Zielspalte.
    await expect
      .element(targetColumn.getByText("Karte A"))
      .not.toBeInTheDocument();

    // `steps` erzwingt mehrere interpolierte `mousemove`-Ereignisse zwischen Greifen und Ablegen
    // (Playwright-Default ist 1 — ein einzelner Sprung ans Ziel). `@dnd-kit`s Kollisionserkennung
    // (`closestCorners`) berechnet bei jedem Pointer-Move neu; ohne Zwischenschritte bleibt der
    // reale Drag hängen, obwohl der Aktivierungs-Schwellwert (distance: 6) technisch überschritten wäre.
    await userEvent.dragAndDrop(handle, targetColumn, { steps: 20 });

    await expect.element(targetColumn.getByText("Karte A")).toBeVisible();
  });

  it('verschiebt eine Karte über den „Verschieben"-Dialog in der Kartendetailansicht (Tastatur-Pfad)', async () => {
    renderBoard();

    await page.getByRole("button", { name: "Karte B öffnen" }).click();
    await expect.element(page.getByRole("dialog")).toBeInTheDocument();

    await page.getByRole("button", { name: "Verschieben" }).click();
    const moveDialog = page.getByRole("dialog", { name: "Karte verschieben" });
    await expect.element(moveDialog).toBeVisible();

    await moveDialog.getByLabelText("Zielspalte wählen").click();
    await page.getByRole("option", { name: "Fertig" }).click();
    await moveDialog.getByRole("button", { name: "Verschieben" }).click();

    // Die Kartendetailansicht (Sheet) bleibt nach dem Verschieben bewusst offen (Trello-artig),
    // blendet das Board darunter aber per `aria-hidden` aus (Radix-Dialog-Verhalten) — für die
    // Prüfung des Board-Zustands muss sie erst geschlossen werden.
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    const targetColumn = page.getByRole("region", { name: "Spalte Fertig" });
    await expect.element(targetColumn.getByText("Karte B")).toBeVisible();
  });

  it("archiviert eine einzelne Karte aus der Detailansicht (mit Bestätigung)", async () => {
    renderBoard();

    await page.getByRole("button", { name: "Karte A öffnen" }).click();
    await page.getByRole("button", { name: "Archivieren" }).click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect.element(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Archivieren" }).click();

    await expect.element(page.getByText("Karte A")).not.toBeInTheDocument();
  });

  it("archiviert alle Karten einer Spalte gesammelt und erlaubt Wiederherstellen über das Archiv", async () => {
    renderBoard();

    const columnMenu = page.getByRole("button", {
      name: "Aktionen für Spalte Offen",
    });
    await columnMenu.click();
    await page
      .getByRole("menuitem", {
        name: /Alle Karten in dieser Spalte archivieren/,
      })
      .click();

    const confirmDialog = page.getByRole("alertdialog");
    await confirmDialog.getByRole("button", { name: "Archivieren" }).click();

    await expect.element(page.getByText("Karte A")).not.toBeInTheDocument();
    await expect.element(page.getByText("Karte B")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Archiv" }).click();
    const archivePanel = page.getByRole("dialog", {
      name: "Archivierte Karten",
    });
    await expect.element(archivePanel).toBeVisible();

    const restoreButtons = archivePanel.getByRole("button", {
      name: "Wiederherstellen",
    });
    await restoreButtons.first().click();

    // Das Archiv-Panel (Sheet) bleibt nach dem Wiederherstellen bewusst offen (weitere Karten
    // können folgen), blendet das Board darunter aber per `aria-hidden` aus — erst schließen,
    // dann den Board-Zustand prüfen.
    await userEvent.keyboard("{Escape}");
    await expect.element(archivePanel).not.toBeInTheDocument();

    // Nach dem Wiederherstellen ist mindestens eine der beiden Karten wieder auf dem Board sichtbar.
    const todoColumn = page.getByRole("region", { name: "Spalte Offen" });
    await expect.element(todoColumn.getByText(/Karte (A|B)/)).toBeVisible();
  });
});
