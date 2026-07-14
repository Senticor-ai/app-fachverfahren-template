// fachverfahren-kit/components/DescriptionList — generisches, token-getriebenes Label/Wert-Primitiv
// (semantisches dl/dt/dd). Ersetzt das kit-weit inline duplizierte dt/dd-Muster (VorgangDetail,
// ReviewWorkspace, BescheidView, FourEyesReview, Postfach, KiAssistPanel, EPaymentPanel, MapView,
// ImageCropper). GENERISCH & vendor-/domänen-neutral: konsumiert nur durchgereichte Inhalte, KEINE
// verfahrensspezifischen Literale.
//
// Setzt den kanonischen UX/UI-Vertrag um:
// - Typo-Skala (Abschnitt 2): Label = `text-sm font-medium text-foreground` (volle Tinte, primäre
//   Information), Wert = `text-sm text-foreground`; Meta/Label-Variante `compact` = `text-xs`
//   (12px Minimum) statt roher Ad-hoc-Größen.
// - Fokus-Rezept (Abschnitt 3.2) über die kanonische `Button`-Komponente (link/ghost) für die
//   optionale „Ändern"-Aktion je Zeile.
// - Motion (4.7): keine eigene Animation; Aktion erbt die Button-Transitions inkl. reduced-motion.
// - Nur semantische Tokens, kein rohes Hex/px.
import * as React from "react";
import { Pencil } from "lucide-react";

import { Button } from "../ui/button.js";
import { cn } from "../lib/utils.js";

/** Eine Zeile der Beschreibungsliste (Label/Wert-Paar). */
export interface DescriptionListItem {
  /** Beschriftung (dt). Primäre Information — volle Tinte. */
  label: React.ReactNode;
  /** Wert (dd). */
  value: React.ReactNode;
  /** Optionale „Ändern"-Aktion für diese Zeile (z. B. Sprung zum passenden Antragsschritt). */
  onEdit?: () => void;
  /**
   * Zeile ausblenden, wenn der Wert leer ist (null/undefined/leerer String).
   * Default: true — leere Werte werden ausgeblendet.
   */
  hideWhenEmpty?: boolean;
  /** Barrierefreies Label für die „Ändern"-Aktion, falls das sichtbare Label nicht ausreicht. */
  editLabel?: string;
}

export interface DescriptionListProps {
  /** Die Label/Wert-Paare. */
  items: DescriptionListItem[];
  /**
   * Layout-Variante:
   * - `two-column` (Default): Label/Wert nebeneinander ab `sm`, darunter gestapelt (responsiv).
   * - `stacked`: Label über Wert, immer gestapelt.
   * - `compact`: dichte Variante, Label in `text-xs` (Meta-Rhythmus).
   */
  layout?: "two-column" | "stacked" | "compact";
  className?: string;
}

/** Prüft, ob ein Wert als „leer" gilt (null/undefined/leerer oder Whitespace-String). */
function isEmptyValue(value: React.ReactNode): boolean {
  if (value === null || value === undefined || value === false) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

/** Layout-abhängige Klassen — EINE Wahrheit je Layout, keine Ad-hoc-Werte in Konsumenten. */
const LAYOUT_META: Record<
  NonNullable<DescriptionListProps["layout"]>,
  { list: string; row: string; term: string; detail: string }
> = {
  "two-column": {
    list: "space-y-3",
    // Label/Wert nebeneinander ab sm; darunter gestapelt → läuft in keinem Container über.
    row: "sm:grid sm:grid-cols-[minmax(8rem,12rem)_1fr] sm:gap-4",
    term: "text-sm font-medium text-foreground",
    detail: "mt-0.5 text-sm text-foreground sm:mt-0",
  },
  stacked: {
    list: "space-y-3",
    row: "",
    term: "text-sm font-medium text-foreground",
    detail: "mt-0.5 text-sm text-foreground",
  },
  compact: {
    list: "space-y-2",
    row: "sm:grid sm:grid-cols-[minmax(7rem,10rem)_1fr] sm:gap-3",
    // Meta-Minimum ist text-xs (12px) — ersetzt rohe Ad-hoc-Größen.
    term: "text-xs font-medium text-muted-foreground",
    detail: "mt-0.5 text-sm text-foreground sm:mt-0",
  },
};

/**
 * Token-getriebene Beschreibungsliste (dl/dt/dd). Rein präsentierend, dependency-frei
 * (React + Tailwind + lucide-react + kanonischer Button).
 */
export function DescriptionList({
  items,
  layout = "two-column",
  className,
}: DescriptionListProps) {
  const meta = LAYOUT_META[layout];

  const visible = items.filter((item) => {
    const hide = item.hideWhenEmpty ?? true;
    return !(hide && isEmptyValue(item.value));
  });

  if (visible.length === 0) return null;

  return (
    <dl className={cn(meta.list, className)}>
      {visible.map((item, index) => (
        <div key={index} className={cn(meta.row, "min-w-0")}>
          <dt className={cn(meta.term, "min-w-0 break-words")}>{item.label}</dt>
          <dd
            className={cn(
              meta.detail,
              "flex min-w-0 items-start justify-between gap-2",
            )}
          >
            <span className="min-w-0 break-words">{item.value}</span>
            {item.onEdit && (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={item.onEdit}
                aria-label={item.editLabel}
                className="h-auto shrink-0 px-0 py-0"
              >
                <Pencil aria-hidden="true" />
                Ändern
              </Button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
