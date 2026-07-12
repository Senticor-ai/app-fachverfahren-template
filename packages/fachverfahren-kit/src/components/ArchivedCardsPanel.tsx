// components/ArchivedCardsPanel — schließt die Archivieren-Schleife: Liste archivierter Karten
// eines Boards mit „Wiederherstellen" je Karte. Optional (an `port.listArchivedCards` gebunden) —
// ohne diese Server-Fähigkeit erscheint der auslösende Button gar nicht erst (siehe KanbanBoard).
import * as React from "react";
import { ArchiveRestore } from "lucide-react";
import type { BoardCard, BoardPort } from "../board-types.js";
import { Button } from "../ui/button.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet.js";
import { EmptyState } from "./EmptyState.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface ArchivedCardsPanelProps<TCardData = Record<string, unknown>> {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  port: BoardPort<TCardData>;
  onChanged: () => void;
}

export function ArchivedCardsPanel<TCardData = Record<string, unknown>>({
  boardId,
  open,
  onOpenChange,
  port,
  onChanged,
}: ArchivedCardsPanelProps<TCardData>): React.ReactElement {
  const { announce } = useStatusRegion();
  const [cards, setCards] = React.useState<BoardCard<TCardData>[] | null>(null);

  const reload = React.useCallback(async () => {
    if (!port.listArchivedCards) return;
    setCards(await port.listArchivedCards(boardId));
  }, [boardId, port]);

  React.useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  async function handleRestore(card: BoardCard<TCardData>) {
    await port.restoreCard(boardId, card.cardId, card.version);
    await reload();
    onChanged();
    announce(`Karte „${card.title}" wiederhergestellt`, "polite");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm">
        <SheetHeader className="text-left">
          <SheetTitle>Archivierte Karten</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto px-1 py-2">
          {!cards || cards.length === 0 ? (
            <EmptyState
              icon={ArchiveRestore}
              title="Keine archivierten Karten"
              description="Archivierte Karten dieses Boards erscheinen hier."
            />
          ) : (
            cards.map((card) => (
              <div
                key={card.cardId}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5"
              >
                <span className="text-sm text-foreground">{card.title}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRestore(card)}
                >
                  <ArchiveRestore
                    className="mr-1.5 h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  Wiederherstellen
                </Button>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
