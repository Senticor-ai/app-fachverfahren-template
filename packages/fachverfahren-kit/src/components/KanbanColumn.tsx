// components/KanbanColumn — eine Spalte des Kanban-Boards: Kopf (Titel umbenennbar + Anzahl +
// Menü für Archivieren/Alle-Karten-archivieren), Karten (als `SortableContext`/Drop-Ziel für
// Drag-and-Drop), Quick-Add.
import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Archive, MoreVertical, Plus } from "lucide-react";
import type { BoardCard, BoardColumn, BoardLabel } from "../board-types.js";
import { cn } from "../lib/cn.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { KanbanCard } from "./KanbanCard.js";

export interface KanbanColumnProps<TCardData = Record<string, unknown>> {
  column: BoardColumn;
  cards: BoardCard<TCardData>[];
  labels?: BoardLabel[];
  onQuickAdd: (columnId: string, title: string) => void | Promise<void>;
  onOpenDetail?: (card: BoardCard<TCardData>) => void;
  onRename?: (columnId: string, title: string) => void | Promise<void>;
  onArchive?: (columnId: string) => void | Promise<void>;
  onArchiveAllCards?: (columnId: string) => void | Promise<void>;
}

export function KanbanColumn<TCardData = Record<string, unknown>>({
  column,
  cards,
  labels,
  onQuickAdd,
  onOpenDetail,
  onRename,
  onArchive,
  onArchiveAllCards,
}: KanbanColumnProps<TCardData>): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: column.columnId,
    data: { columnId: column.columnId },
  });
  const [draft, setDraft] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(column.title);
  const [confirmArchiveAll, setConfirmArchiveAll] = React.useState(false);

  React.useEffect(() => {
    setTitleDraft(column.title);
  }, [column.title]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setAdding(true);
    try {
      await onQuickAdd(column.columnId, title);
      setDraft("");
    } finally {
      setAdding(false);
    }
  }

  async function commitRename() {
    const title = titleDraft.trim();
    setRenaming(false);
    if (!title || title === column.title || !onRename) {
      setTitleDraft(column.title);
      return;
    }
    await onRename(column.columnId, title);
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "ps-kanban-column flex h-full w-72 shrink-0 flex-col rounded-lg border border-border bg-secondary/30",
        isOver && "ring-ring/60 ring-2",
      )}
      aria-label={`Spalte ${column.title}`}
    >
      <header className="flex items-center justify-between gap-1 border-b border-border px-3 py-2">
        {renaming ? (
          <Input
            autoFocus
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              }
              if (event.key === "Escape") {
                setTitleDraft(column.title);
                setRenaming(false);
              }
            }}
            aria-label={`Titel der Spalte ${column.title} bearbeiten`}
            className="h-7 text-sm font-semibold"
          />
        ) : (
          <button
            type="button"
            className="truncate rounded px-1 text-left text-sm font-semibold text-foreground outline-none hover:bg-secondary focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            onClick={() => onRename && setRenaming(true)}
            disabled={!onRename}
          >
            {column.title}
          </button>
        )}
        <span className="shrink-0 rounded-full bg-secondary px-1.5 py-px text-xs tabular-nums text-muted-foreground">
          {cards.length}
        </span>
        {(onArchive || onArchiveAllCards) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label={`Aktionen für Spalte ${column.title}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onArchiveAllCards && (
                <DropdownMenuItem
                  disabled={cards.length === 0}
                  onClick={() => setConfirmArchiveAll(true)}
                >
                  <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
                  Alle Karten in dieser Spalte archivieren
                </DropdownMenuItem>
              )}
              {onArchive && (
                <DropdownMenuItem
                  onClick={() => void onArchive(column.columnId)}
                >
                  Spalte archivieren
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <SortableContext
        items={cards.map((card) => card.cardId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {cards.map((card) => (
            <KanbanCard
              key={card.cardId}
              card={card}
              {...(labels ? { labels } : {})}
              {...(onOpenDetail ? { onOpenDetail } : {})}
            />
          ))}
        </div>
      </SortableContext>
      <form onSubmit={handleSubmit} className="border-t border-border p-2">
        <label className="sr-only" htmlFor={`quick-add-${column.columnId}`}>
          Karte zu {column.title} hinzufügen
        </label>
        <div className="flex gap-1.5">
          <Input
            id={`quick-add-${column.columnId}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Karte hinzufügen…"
            disabled={adding}
          />
          <Button
            type="submit"
            variant="secondary"
            size="icon"
            disabled={adding || draft.trim() === ""}
            aria-label="Karte anlegen"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </form>
      {onArchiveAllCards && (
        <ConfirmDialog
          open={confirmArchiveAll}
          onOpenChange={setConfirmArchiveAll}
          title={`${cards.length} ${cards.length === 1 ? "Karte" : "Karten"} in „${column.title}" archivieren?`}
          description="Archivierte Karten verschwinden vom Board, lassen sich aber über die Archiv-Ansicht des Boards wiederherstellen."
          confirmLabel="Archivieren"
          onConfirm={() => void onArchiveAllCards(column.columnId)}
        />
      )}
    </section>
  );
}
