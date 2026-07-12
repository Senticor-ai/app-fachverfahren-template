// components/MoveCardMenu — die BARRIEREFREIE Verschieben-Interaktion (Kanban-Plan Entscheidung 8).
// Immer sichtbarer Button + fokussierter Dialog statt reinem Drag-and-Drop: Spalte wählen, Position
// (Anfang/Ende), bestätigen. Sagt das Ergebnis über useStatusRegion an und gibt den Fokus zurück.
import * as React from "react";
import type { BoardCard, BoardColumn } from "../board-types.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import { Button } from "../ui/button.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface MoveCardMenuProps<TCardData = Record<string, unknown>> {
  card: BoardCard<TCardData> | null;
  columns: BoardColumn[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: {
    cardId: string;
    toColumnId: string;
    toStart: boolean;
  }) => void | Promise<void>;
}

export function MoveCardMenu<TCardData = Record<string, unknown>>({
  card,
  columns,
  open,
  onOpenChange,
  onConfirm,
}: MoveCardMenuProps<TCardData>): React.ReactElement {
  const { announce } = useStatusRegion();
  const [targetColumnId, setTargetColumnId] = React.useState<string>("");
  const [position, setPosition] = React.useState<"start" | "end">("end");

  React.useEffect(() => {
    if (card) {
      setTargetColumnId(card.columnId);
      setPosition("end");
    }
  }, [card]);

  if (!card) {
    return <></>;
  }

  const targetColumn = columns.find(
    (column) => column.columnId === targetColumnId,
  );

  async function handleConfirm() {
    if (!card || !targetColumnId) return;
    await onConfirm({
      cardId: card.cardId,
      toColumnId: targetColumnId,
      toStart: position === "start",
    });
    announce(
      `Karte „${card.title}" nach Spalte „${targetColumn?.title ?? ""}" verschoben`,
      "polite",
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Karte verschieben</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            „{card.title}" verschieben nach:
          </p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Spalte</span>
            <Select value={targetColumnId} onValueChange={setTargetColumnId}>
              <SelectTrigger aria-label="Zielspalte wählen">
                <SelectValue placeholder="Spalte wählen" />
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column.columnId} value={column.columnId}>
                    {column.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Position</span>
            <Select
              value={position}
              onValueChange={(value) => setPosition(value as "start" | "end")}
            >
              <SelectTrigger aria-label="Position wählen">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">An den Anfang</SelectItem>
                <SelectItem value="end">Ans Ende</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!targetColumnId}
          >
            Verschieben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
