// components/KanbanBoard — der GENERISCHE Kanban-Board-Bildschirm. Data-driven über `BoardPort`,
// kein Domänen-Literal. Zwei gleichwertige Wege, eine Karte zu verschieben (Kanban-Plan
// Entscheidung 8): Ziehen per Maus/Touch/Tastatur (`@dnd-kit`, Zeiger- UND Tastatur-Sensor im
// selben `DndContext`, Ziehgriff je Karte) sowie „Karte öffnen → Verschieben" in der
// Detailansicht — die Kartenfläche selbst trägt bewusst nur den Griff, keinen zweiten Button.
// Lade-/Leer-/Fehlerzustand + Konflikt-Hinweis bei einem Versions-Konflikt.
import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { AlertTriangle, Archive, LayoutGrid, Plus } from "lucide-react";
import type {
  Board,
  BoardCard,
  BoardColumn,
  BoardPort,
} from "../board-types.js";
import { BoardConflictError } from "../board-types.js";
import { nextPositionKey } from "../lib/position.js";
import { EmptyState } from "./EmptyState.js";
import { ErrorState } from "./ErrorState.js";
import { SkeletonCard } from "../ui/skeleton.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { KanbanCardPreview } from "./KanbanCard.js";
import { KanbanColumn } from "./KanbanColumn.js";
import { BoardCardDetail } from "./BoardCardDetail.js";
import { ArchivedCardsPanel } from "./ArchivedCardsPanel.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface KanbanBoardProps<TCardData = Record<string, unknown>> {
  boardId: string;
  port: BoardPort<TCardData>;
}

interface BoardData<TCardData> {
  board: Board;
  columns: BoardColumn[];
  cards: BoardCard<TCardData>[];
}

export function KanbanBoard<TCardData = Record<string, unknown>>({
  boardId,
  port,
}: KanbanBoardProps<TCardData>): React.ReactElement {
  const { announce } = useStatusRegion();
  const [data, setData] = React.useState<BoardData<TCardData> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [detailCard, setDetailCard] =
    React.useState<BoardCard<TCardData> | null>(null);
  const [activeCard, setActiveCard] =
    React.useState<BoardCard<TCardData> | null>(null);
  const [addingColumn, setAddingColumn] = React.useState(false);
  const [newColumnTitle, setNewColumnTitle] = React.useState("");
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await port.getBoard(boardId);
      if (!result) {
        setError("Board nicht gefunden.");
        setData(null);
        return;
      }
      setData(result);
    } catch {
      setError("Board konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [boardId, port]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  async function moveCardTo(
    card: BoardCard<TCardData>,
    toColumnId: string,
    toPositionKey?: string,
  ) {
    try {
      setConflict(null);
      await port.moveCard(
        boardId,
        card.cardId,
        card.version,
        toColumnId,
        toPositionKey,
      );
      await reload();
    } catch (moveError) {
      if (moveError instanceof BoardConflictError) {
        setConflict(
          `„${card.title}" wurde inzwischen von jemand anderem geändert — die Ansicht wurde aktualisiert.`,
        );
        await reload();
        return;
      }
      throw moveError;
    }
  }

  async function handleQuickAdd(columnId: string, title: string) {
    await port.createCard(boardId, { columnId, title });
    await reload();
    announce(`Karte „${title}" hinzugefügt`, "polite");
  }

  function handleDragStart(event: DragStartEvent) {
    const card = data?.cards.find((c) => c.cardId === event.active.id);
    setActiveCard(card ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !data) return;

    const card = data.cards.find((c) => c.cardId === active.id);
    if (!card) return;

    const overCard = data.cards.find((c) => c.cardId === over.id);
    const targetColumnId = overCard ? overCard.columnId : String(over.id);
    const targetColumn = data.columns.find(
      (c) => c.columnId === targetColumnId,
    );
    if (!targetColumn) return;

    const siblings = data.cards
      .filter((c) => c.columnId === targetColumnId && c.cardId !== card.cardId)
      .sort((a, b) => a.positionKey.localeCompare(b.positionKey));

    let toPositionKey: string;
    if (overCard && overCard.cardId !== card.cardId) {
      const overIndex = siblings.findIndex((c) => c.cardId === overCard.cardId);
      const before =
        overIndex > 0 ? (siblings[overIndex - 1]?.positionKey ?? null) : null;
      toPositionKey = nextPositionKey(before, overCard.positionKey);
    } else {
      toPositionKey = nextPositionKey(
        siblings.at(-1)?.positionKey ?? null,
        null,
      );
    }

    if (
      card.columnId === targetColumnId &&
      card.positionKey === toPositionKey
    ) {
      return;
    }
    await moveCardTo(card, targetColumnId, toPositionKey);
    if (card.columnId !== targetColumnId) {
      announce(
        `Karte „${card.title}" nach Spalte „${targetColumn.title}" verschoben`,
        "polite",
      );
    }
  }

  async function handleRenameColumn(columnId: string, title: string) {
    if (!port.updateColumn || !data) return;
    const column = data.columns.find((c) => c.columnId === columnId);
    if (!column) return;
    await port.updateColumn(boardId, columnId, column.version, { title });
    await reload();
  }

  async function handleArchiveColumn(columnId: string) {
    if (!data) return;
    const column = data.columns.find((c) => c.columnId === columnId);
    if (!column) return;
    try {
      await port.archiveColumn(boardId, columnId, column.version);
      await reload();
      announce(`Spalte „${column.title}" archiviert`, "polite");
    } catch {
      announce(
        `Spalte „${column.title}" hat noch aktive Karten und kann nicht archiviert werden`,
        "assertive",
      );
    }
  }

  async function handleArchiveAllCards(columnId: string) {
    if (!data) return;
    const column = data.columns.find((c) => c.columnId === columnId);
    const cardsInColumn = data.cards.filter((c) => c.columnId === columnId);
    await Promise.all(
      cardsInColumn.map((card) =>
        port.archiveCard(boardId, card.cardId, card.version),
      ),
    );
    await reload();
    announce(
      `${cardsInColumn.length} ${cardsInColumn.length === 1 ? "Karte" : "Karten"} in Spalte „${column?.title ?? ""}" archiviert`,
      "polite",
    );
  }

  async function handleAddColumn(event: React.FormEvent) {
    event.preventDefault();
    const title = newColumnTitle.trim();
    if (!title) return;
    await port.createColumn(boardId, { title });
    setNewColumnTitle("");
    setAddingColumn(false);
    await reload();
  }

  if (loading) {
    return (
      <div
        className="flex gap-3 p-4"
        role="status"
        aria-label="Board wird geladen"
      >
        {Array.from({ length: 3 }, (_, index) => (
          <SkeletonCard key={index} className="h-64 w-72 shrink-0" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Board konnte nicht geladen werden"
        description={error}
        onRetry={() => void reload()}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Kein Board ausgewählt"
        description="Wählen Sie ein Board aus der Übersicht."
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between border-b border-border px-4 py-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {data.board.title}
          </h1>
          {data.board.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {data.board.description}
            </p>
          )}
        </div>
        {port.listArchivedCards && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setArchiveOpen(true)}
          >
            <Archive className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Archiv
          </Button>
        )}
      </header>
      {conflict && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 border-b border-status-warn/40 bg-status-warn/10 px-4 py-2 text-sm text-status-warn"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {conflict}
        </div>
      )}
      {data.columns.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Noch keine Spalten"
          description="Dieses Board hat noch keine Spalten."
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={(event) => void handleDragEnd(event)}
        >
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
            {data.columns.map((column) => (
              <KanbanColumn
                key={column.columnId}
                column={column}
                cards={data.cards.filter(
                  (card) => card.columnId === column.columnId,
                )}
                {...(data.board.labels ? { labels: data.board.labels } : {})}
                onQuickAdd={handleQuickAdd}
                onOpenDetail={setDetailCard}
                {...(port.updateColumn ? { onRename: handleRenameColumn } : {})}
                onArchive={handleArchiveColumn}
                onArchiveAllCards={handleArchiveAllCards}
              />
            ))}
            <div className="w-72 shrink-0">
              {addingColumn ? (
                <form
                  onSubmit={handleAddColumn}
                  className="rounded-lg border border-border bg-secondary/30 p-2"
                >
                  <Input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(event) => setNewColumnTitle(event.target.value)}
                    onBlur={() => {
                      if (!newColumnTitle.trim()) setAddingColumn(false);
                    }}
                    placeholder="Spaltentitel…"
                    aria-label="Titel der neuen Spalte"
                  />
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!newColumnTitle.trim()}
                    >
                      Hinzufügen
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingColumn(false);
                        setNewColumnTitle("");
                      }}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => setAddingColumn(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Spalte hinzufügen
                </Button>
              )}
            </div>
          </div>
          <DragOverlay>
            {activeCard ? (
              <div className="w-72 rotate-2">
                <KanbanCardPreview
                  card={activeCard}
                  {...(data.board.labels ? { labels: data.board.labels } : {})}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
      <BoardCardDetail
        card={detailCard}
        board={data.board}
        columns={data.columns}
        open={detailCard !== null}
        onOpenChange={(open) => {
          if (!open) setDetailCard(null);
        }}
        port={port}
        onChanged={() => void reload()}
      />
      {port.listArchivedCards && (
        <ArchivedCardsPanel
          boardId={boardId}
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          port={port}
          onChanged={() => void reload()}
        />
      )}
    </section>
  );
}
