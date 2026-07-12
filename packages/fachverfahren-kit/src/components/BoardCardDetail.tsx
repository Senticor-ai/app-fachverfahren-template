// components/BoardCardDetail — die Detailansicht einer Karte (Sheet): Titel, Art/Priorität, Labels,
// Zuweisung, Fälligkeit, Blockiert-Status, Beschreibung, Checkliste, Kommentare — UND die primäre
// Verschieben-/Archivieren-Aktionen (Kanban-Plan Entscheidung 8: die Kartenfläche selbst trägt nur
// den Ziehgriff, der vollständige „Verschieben"-Dialog mit Spalten-/Positionswahl sowie Archivieren
// leben hier). Labels/Checkliste/Kommentare sind über OPTIONALE `BoardPort`-Methoden angebunden
// (Storybook-UX geht der Server-Anbindung voran) — fehlt eine Methode, blendet die Sektion sich
// selbst aus.
import * as React from "react";
import { Archive, MessageSquare, Move, Plus, X } from "lucide-react";
import type {
  Board,
  BoardCard,
  BoardColumn,
  BoardPort,
  CardKind,
  CardPriority,
  LabelColor,
} from "../board-types.js";
import { cn } from "../lib/cn.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet.js";
import { Input } from "../ui/input.js";
import { Textarea } from "../ui/textarea.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { MoveCardMenu } from "./MoveCardMenu.js";
import { useStatusRegion } from "./StatusRegion.js";

const KIND_OPTIONS: { value: CardKind; label: string }[] = [
  { value: "question", label: "Frage" },
  { value: "hypothesis", label: "Hypothese" },
  { value: "research", label: "Recherche" },
  { value: "decision", label: "Entscheidung" },
  { value: "feature", label: "Feature" },
  { value: "task", label: "Aufgabe" },
  { value: "risk", label: "Risiko" },
  { value: "defect", label: "Fehler" },
];

const PRIORITY_OPTIONS: { value: CardPriority; label: string }[] = [
  { value: "low", label: "Niedrig" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
  { value: "critical", label: "Kritisch" },
];

const LABEL_COLOR_OPTIONS: { value: LabelColor; class: string }[] = [
  { value: "green", class: "bg-green-500" },
  { value: "yellow", class: "bg-yellow-400" },
  { value: "orange", class: "bg-orange-500" },
  { value: "red", class: "bg-red-500" },
  { value: "purple", class: "bg-purple-500" },
  { value: "blue", class: "bg-blue-500" },
  { value: "sky", class: "bg-sky-400" },
  { value: "lime", class: "bg-lime-500" },
  { value: "pink", class: "bg-pink-500" },
  { value: "black", class: "bg-slate-700" },
];

export interface BoardCardDetailProps<TCardData = Record<string, unknown>> {
  card: BoardCard<TCardData> | null;
  board: Board | null;
  columns: BoardColumn[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  port: BoardPort<TCardData>;
  onChanged: () => void;
}

export function BoardCardDetail<TCardData = Record<string, unknown>>({
  card,
  board,
  columns,
  open,
  onOpenChange,
  port,
  onChanged,
}: BoardCardDetailProps<TCardData>): React.ReactElement {
  const { announce } = useStatusRegion();
  const [local, setLocal] = React.useState<BoardCard<TCardData> | null>(card);
  const [titleDraft, setTitleDraft] = React.useState("");
  const [descriptionDraft, setDescriptionDraft] = React.useState("");
  const [checklistDraft, setChecklistDraft] = React.useState("");
  const [commentDraft, setCommentDraft] = React.useState("");
  const [newLabelName, setNewLabelName] = React.useState("");
  const [newLabelColor, setNewLabelColor] = React.useState<LabelColor>("blue");
  const [addingLabel, setAddingLabel] = React.useState(false);
  const [moveOpen, setMoveOpen] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLocal(card);
    setTitleDraft(card?.title ?? "");
    setDescriptionDraft(card?.descriptionMarkdown ?? "");
    setError(null);
    setAddingLabel(false);
  }, [card]);

  if (!local || !board) {
    return <Sheet open={open} onOpenChange={onOpenChange} />;
  }

  const boardLabels = board.labels ?? [];
  const boardMembers = board.members ?? [];

  async function runMutation<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (!local) return undefined;
    try {
      setError(null);
      const result = await fn();
      onChanged();
      return result;
    } catch {
      setError(
        "Änderung konnte nicht gespeichert werden — die Karte wurde möglicherweise inzwischen von jemand anderem geändert.",
      );
      return undefined;
    }
  }

  async function commitTitle() {
    if (!local || titleDraft.trim() === "" || titleDraft === local.title)
      return;
    const updated = await runMutation(() =>
      port.updateCard(local.boardId, local.cardId, local.version, {
        title: titleDraft.trim(),
      }),
    );
    if (updated) setLocal(updated);
  }

  async function commitDescription() {
    if (!local || descriptionDraft === (local.descriptionMarkdown ?? ""))
      return;
    const updated = await runMutation(() =>
      port.updateCard(local.boardId, local.cardId, local.version, {
        descriptionMarkdown: descriptionDraft || null,
      }),
    );
    if (updated) setLocal(updated);
  }

  async function updateField(
    patch: Parameters<BoardPort<TCardData>["updateCard"]>[3],
  ) {
    if (!local) return;
    const updated = await runMutation(() =>
      port.updateCard(local.boardId, local.cardId, local.version, patch),
    );
    if (updated) setLocal(updated);
  }

  async function toggleLabel(labelId: string) {
    if (!local) return;
    const next = local.labelIds.includes(labelId)
      ? local.labelIds.filter((id) => id !== labelId)
      : [...local.labelIds, labelId];
    await updateField({ labelIds: next });
  }

  async function handleCreateLabel() {
    if (!port.createLabel || newLabelName.trim() === "") return;
    const label = await runMutation(() =>
      port.createLabel!(local!.boardId, {
        name: newLabelName.trim(),
        color: newLabelColor,
      }),
    );
    if (label) {
      setNewLabelName("");
      setAddingLabel(false);
      await toggleLabel(label.labelId);
    }
  }

  async function handleAddChecklistItem(event: React.FormEvent) {
    event.preventDefault();
    if (!port.addChecklistItem || !local || checklistDraft.trim() === "")
      return;
    const updated = await runMutation(() =>
      port.addChecklistItem!(
        local.boardId,
        local.cardId,
        checklistDraft.trim(),
      ),
    );
    if (updated) {
      setLocal(updated);
      setChecklistDraft("");
    }
  }

  async function handleToggleChecklistItem(itemId: string) {
    if (!port.toggleChecklistItem || !local) return;
    const updated = await runMutation(() =>
      port.toggleChecklistItem!(local.boardId, local.cardId, itemId),
    );
    if (updated) setLocal(updated);
  }

  async function handleRemoveChecklistItem(itemId: string) {
    if (!port.removeChecklistItem || !local) return;
    const updated = await runMutation(() =>
      port.removeChecklistItem!(local.boardId, local.cardId, itemId),
    );
    if (updated) setLocal(updated);
  }

  async function handleAddComment(event: React.FormEvent) {
    event.preventDefault();
    if (!port.addComment || !local || commentDraft.trim() === "") return;
    const updated = await runMutation(() =>
      port.addComment!(local.boardId, local.cardId, commentDraft.trim()),
    );
    if (updated) {
      setLocal(updated);
      setCommentDraft("");
      announce("Kommentar hinzugefügt", "polite");
    }
  }

  async function handleMoveConfirm(input: {
    cardId: string;
    toColumnId: string;
    toStart: boolean;
  }) {
    if (!local) return;
    const targetColumn = columns.find((c) => c.columnId === input.toColumnId);
    const updated = await runMutation(() =>
      port.moveCard(
        local.boardId,
        local.cardId,
        local.version,
        input.toColumnId,
        // Grobe Positionierung genügt hier — die genaue Reihenfolge lässt sich anschließend
        // per Drag-and-Drop auf dem Board feinjustieren.
        input.toStart ? "" : undefined,
      ),
    );
    if (updated) {
      setLocal(updated);
      announce(
        `Karte „${local.title}" nach Spalte „${targetColumn?.title ?? ""}" verschoben`,
        "polite",
      );
    }
  }

  async function handleArchive() {
    if (!local) return;
    const updated = await runMutation(() =>
      port.archiveCard(local.boardId, local.cardId, local.version),
    );
    if (updated) {
      announce(`Karte „${local.title}" archiviert`, "polite");
      onOpenChange(false);
    }
  }

  const doneCount = local.checklist.filter((item) => item.done).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="text-left">
          <Input
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void commitTitle();
              }
            }}
            aria-label="Kartentitel"
            className="text-base font-semibold"
          />
          <SheetTitle className="sr-only">Kartendetails</SheetTitle>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMoveOpen(true)}
            >
              <Move className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Verschieben
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmArchive(true)}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Archivieren
            </Button>
          </div>
        </SheetHeader>

        {error && (
          <p role="alert" className="mx-4 mt-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-5 px-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Art
              </span>
              <Select
                value={local.kind}
                onValueChange={(value) =>
                  void updateField({ kind: value as CardKind })
                }
              >
                <SelectTrigger aria-label="Kartenart wählen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Priorität
              </span>
              <Select
                value={local.priority}
                onValueChange={(value) =>
                  void updateField({ priority: value as CardPriority })
                }
              >
                <SelectTrigger aria-label="Priorität wählen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Labels
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {boardLabels.map((label) => {
                const active = local.labelIds.includes(label.labelId);
                const colorClass =
                  LABEL_COLOR_OPTIONS.find((c) => c.value === label.color)
                    ?.class ?? "bg-slate-400";
                return (
                  // Farbpunkt + neutraler Text statt Weiß-auf-Farbfläche: die gesättigten
                  // Label-Farben (und erst recht opacity-gedimmte Inaktiv-Zustände) reißen
                  // die 4.5:1-Kontrastgrenze — die Farbe bleibt als redundante Dekoration,
                  // der Name trägt die Information (axe color-contrast, WCAG 1.4.3/1.4.1).
                  <button
                    key={label.labelId}
                    type="button"
                    onClick={() => void toggleLabel(label.labelId)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                      active
                        ? "border-transparent bg-secondary text-secondary-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary/50",
                    )}
                  >
                    <span
                      className={cn("h-2.5 w-2.5 rounded-full", colorClass)}
                      aria-hidden="true"
                    />
                    {label.name}
                  </button>
                );
              })}
              {port.createLabel && !addingLabel && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingLabel(true)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Label
                </Button>
              )}
            </div>
            {addingLabel && (
              <div className="flex items-center gap-1.5 pt-1">
                <Input
                  value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateLabel();
                    }
                    if (event.key === "Escape") {
                      setAddingLabel(false);
                      setNewLabelName("");
                    }
                  }}
                  placeholder="Name"
                  autoFocus
                  className="h-8"
                />
                <div className="flex gap-1">
                  {LABEL_COLOR_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-label={`Farbe ${option.value}`}
                      aria-pressed={newLabelColor === option.value}
                      onClick={() => setNewLabelColor(option.value)}
                      className={cn(
                        "h-5 w-5 rounded-full outline-none",
                        option.class,
                        newLabelColor === option.value &&
                          "ring-ring ring-2 ring-offset-1",
                      )}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleCreateLabel()}
                >
                  Anlegen
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Zugewiesen
              </span>
              <Select
                value={local.assigneeActorId ?? "none"}
                onValueChange={(value) =>
                  void updateField({
                    assigneeActorId: value === "none" ? null : value,
                  })
                }
              >
                <SelectTrigger aria-label="Zuweisung wählen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nicht zugewiesen</SelectItem>
                  {boardMembers.map((member) => (
                    <SelectItem key={member.actorId} value={member.actorId}>
                      {member.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Fällig
              </span>
              <Input
                type="date"
                value={local.dueAt ? local.dueAt.slice(0, 10) : ""}
                onChange={(event) =>
                  void updateField({
                    dueAt: event.target.value
                      ? new Date(event.target.value).toISOString()
                      : null,
                  })
                }
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Blockiert (Grund, leer = nicht blockiert)
            </span>
            <Input
              value={local.blockedReason ?? ""}
              onChange={(event) =>
                setLocal({
                  ...local,
                  blockedReason: event.target.value || null,
                })
              }
              onBlur={() =>
                void updateField({ blockedReason: local.blockedReason })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void updateField({ blockedReason: local.blockedReason });
                }
              }}
              placeholder="z. B. Wartet auf Rückmeldung der Aufsicht"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Beschreibung
            </span>
            <Textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              onBlur={() => void commitDescription()}
              rows={4}
              placeholder="Markdown wird unterstützt…"
            />
          </label>

          {port.addChecklistItem && (
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Checkliste
                {local.checklist.length > 0 &&
                  ` (${doneCount}/${local.checklist.length})`}
              </span>
              <ul className="space-y-1.5">
                {local.checklist.map((item) => (
                  <li key={item.itemId} className="flex items-center gap-2">
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={() =>
                        void handleToggleChecklistItem(item.itemId)
                      }
                      aria-label={item.text}
                    />
                    <span
                      className={cn(
                        "flex-1 text-sm",
                        item.done && "text-muted-foreground line-through",
                      )}
                    >
                      {item.text}
                    </span>
                    {port.removeChecklistItem && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={`„${item.text}" entfernen`}
                        onClick={() =>
                          void handleRemoveChecklistItem(item.itemId)
                        }
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <form onSubmit={handleAddChecklistItem} className="flex gap-1.5">
                <Input
                  value={checklistDraft}
                  onChange={(event) => setChecklistDraft(event.target.value)}
                  placeholder="Punkt hinzufügen…"
                  aria-label="Checklistenpunkt hinzufügen"
                  className="h-8"
                />
                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  aria-label="Punkt hinzufügen"
                  disabled={checklistDraft.trim() === ""}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </form>
            </div>
          )}

          {port.addComment && (
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Kommentare
              </span>
              <ul className="space-y-2">
                {local.comments.map((comment) => (
                  <li
                    key={comment.commentId}
                    className="rounded-md border border-border bg-card p-2 text-sm"
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {comment.authorName}
                      </span>
                      <span>
                        {new Date(comment.createdAt).toLocaleString("de-DE")}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{comment.body}</p>
                  </li>
                ))}
              </ul>
              <form onSubmit={handleAddComment} className="space-y-1.5">
                <Textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  placeholder="Kommentar schreiben…"
                  aria-label="Kommentar schreiben"
                  rows={2}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={commentDraft.trim() === ""}
                >
                  Kommentieren
                </Button>
              </form>
            </div>
          )}
        </div>
      </SheetContent>

      <MoveCardMenu
        card={local}
        columns={columns}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onConfirm={handleMoveConfirm}
      />
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={`Karte „${local.title}" archivieren?`}
        description="Die Karte verschwindet vom Board, lässt sich aber über die Archiv-Ansicht des Boards wiederherstellen."
        confirmLabel="Archivieren"
        onConfirm={() => void handleArchive()}
      />
    </Sheet>
  );
}
