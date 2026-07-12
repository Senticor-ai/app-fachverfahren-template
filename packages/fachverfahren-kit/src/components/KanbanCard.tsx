// components/KanbanCard — die GENERISCHE Kartenansicht des Kanban-Boards. Kein Domänen-Literal:
// Kartendaten kommen ausschließlich aus `card`. Status/Kind/Priorität nie nur über Farbe (Icon+Text).
// Ziehbar über einen dedizierten Griff (nicht die ganze Karte) — verhindert versehentliches Ziehen
// beim Öffnen der Detailansicht und hält Pointer- und Tastatur-Interaktion sauber getrennt
// (Kanban-Plan Entscheidung 8). Der Griff ist die EINZIGE Verschieben-Affordanz auf der Karte
// selbst — der vollständige „Verschieben"-Dialog mit Spalten-/Positionswahl lebt in der
// Kartendetailansicht (`BoardCardDetail`), nicht auf der Karte, um die Kartenfläche ruhig zu halten.
import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  CircleHelp,
  FlaskConical,
  GripVertical,
  Lightbulb,
  ListTodo,
  MessageSquare,
  ShieldAlert,
  Sparkles,
  SquareCheck,
} from "lucide-react";
import type {
  BoardCard,
  BoardLabel,
  CardKind,
  CardPriority,
  LabelColor,
} from "../board-types.js";
import { cn } from "../lib/cn.js";
import { Badge } from "../ui/badge.js";

const KIND_META: Record<CardKind, { label: string; icon: React.ElementType }> =
  {
    question: { label: "Frage", icon: CircleHelp },
    hypothesis: { label: "Hypothese", icon: Lightbulb },
    research: { label: "Recherche", icon: FlaskConical },
    decision: { label: "Entscheidung", icon: Sparkles },
    feature: { label: "Feature", icon: ListTodo },
    task: { label: "Aufgabe", icon: ListTodo },
    risk: { label: "Risiko", icon: ShieldAlert },
    defect: { label: "Fehler", icon: AlertTriangle },
  };

const PRIORITY_LABEL: Record<CardPriority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  critical: "Kritisch",
};

/** Trello-artige Label-Farben — reine Tag-Kennzeichnung, kein System-Status (bewusst NICHT die
 *  semantischen `--color-status-*`-Tokens: das sind unterschiedliche Konzepte). */
export const LABEL_COLOR_CLASS: Record<LabelColor, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  orange: "bg-orange-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  blue: "bg-blue-500",
  sky: "bg-sky-400",
  lime: "bg-lime-500",
  pink: "bg-pink-500",
  black: "bg-slate-700",
};

export interface KanbanCardProps<TCardData = Record<string, unknown>> {
  card: BoardCard<TCardData>;
  labels?: BoardLabel[];
  onOpenDetail?: (card: BoardCard<TCardData>) => void;
}

export function KanbanCard<TCardData = Record<string, unknown>>({
  card,
  labels,
  onOpenDetail,
}: KanbanCardProps<TCardData>): React.ReactElement {
  const kindMeta = KIND_META[card.kind];
  const KindIcon = kindMeta.icon;
  const cardLabels = (labels ?? []).filter((label) =>
    card.labelIds.includes(label.labelId),
  );
  const doneCount = card.checklist.filter((item) => item.done).length;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.cardId, data: { columnId: card.columnId } });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className="ps-kanban-card rounded-md border border-border bg-card p-3 shadow-sm"
      aria-label={`Karte ${card.title}`}
    >
      {cardLabels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1" aria-hidden="true">
          {cardLabels.map((label) => (
            <span
              key={label.labelId}
              title={label.name}
              className={cn(
                "h-2 w-8 rounded-full",
                LABEL_COLOR_CLASS[label.color],
              )}
            />
          ))}
        </div>
      )}
      {cardLabels.length > 0 && (
        <span className="sr-only">
          Labels: {cardLabels.map((label) => label.name).join(", ")}
        </span>
      )}
      <div className="flex items-start gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-ring/50 focus-visible:ring-[3px] active:cursor-grabbing"
          aria-label={`Karte ${card.title} greifen und mit Pfeiltasten verschieben (Alternative: Karte öffnen und „Verschieben" wählen)`}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="block flex-1 text-left"
          onClick={() => onOpenDetail?.(card)}
          aria-label={`Karte ${card.title} öffnen`}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {kindMeta.label}
          </span>
          <span className="mt-1 block text-sm font-medium text-foreground">
            {card.title}
          </span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge
          tone={
            card.priority === "critical" || card.priority === "high"
              ? "warn"
              : "neu"
          }
        >
          {PRIORITY_LABEL[card.priority]}
        </Badge>
        {card.blockedReason && (
          <Badge tone="block">
            <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
            Blockiert
          </Badge>
        )}
        {card.checklist.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <SquareCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {doneCount}/{card.checklist.length}
          </span>
        )}
        {card.comments.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            {card.comments.length}
          </span>
        )}
        {card.dueAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(card.dueAt).toLocaleDateString("de-DE")}
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * Statische, hook-freie Vorschau für `DragOverlay` — `KanbanCard` selbst ruft `useSortable` auf
 * und darf deshalb nicht als zweite Instanz mit derselben `card.cardId` in der Overlay-Ebene
 * gerendert werden (doppelte Sortable-Registrierung). Rein visuell, ohne Interaktion.
 */
export function KanbanCardPreview<TCardData = Record<string, unknown>>({
  card,
  labels,
}: {
  card: BoardCard<TCardData>;
  labels?: BoardLabel[];
}): React.ReactElement {
  const kindMeta = KIND_META[card.kind];
  const KindIcon = kindMeta.icon;
  const cardLabels = (labels ?? []).filter((label) =>
    card.labelIds.includes(label.labelId),
  );

  return (
    <article
      className="ps-kanban-card rounded-md border border-border bg-card p-3 shadow-lg"
      aria-hidden="true"
    >
      {cardLabels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {cardLabels.map((label) => (
            <span
              key={label.labelId}
              className={cn(
                "h-2 w-8 rounded-full",
                LABEL_COLOR_CLASS[label.color],
              )}
            />
          ))}
        </div>
      )}
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <KindIcon className="h-3.5 w-3.5" />
        {kindMeta.label}
      </span>
      <span className="mt-1 block text-sm font-medium text-foreground">
        {card.title}
      </span>
    </article>
  );
}
