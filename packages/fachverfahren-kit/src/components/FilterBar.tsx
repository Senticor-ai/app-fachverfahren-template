// components/FilterBar — die GENERISCHE Filter-/Suchleiste für Listen-/Tabellen-Ansichten.
//
// Kombiniert ein beschriftetes Such-Input (mit führendem Lupen-Icon + Löschen-Knopf), beliebige
// Filter-Slots (Chips, Select-Trigger, Toggles — kommen ausschließlich als `filters`-Children herein),
// einen Ergebnis-Zähler und einen „Zurücksetzen"-Knopf, der nur erscheint, wenn etwas aktiv ist.
// Vollständig dep-frei: nur React + Tailwind + lucide + die vorhandenen ui-Primitive (Button). KEIN
// Domänen-Literal — alle Texte/Slots kommen über props.
//
// Barrierefreiheit (BITV 2.0 / WCAG 2.2 AA):
//  - role="search" als Landmark, das Input ist über ein verstecktes <label> beschriftet (htmlFor/id)
//  - Tastatur: Esc im Input leert die Suche; Löschen-Knopf ist ein echter Button (Tab erreichbar)
//  - der Ergebnis-Zähler liegt in einer aria-live="polite"-Region → Screenreader hören die neue Anzahl
//  - EIN kanonischer Fokus-Ring überall (Spec 3.2: focus-visible:border-ring ring-ring/50 ring-[3px])
//  - das Icon ist rein dekorativ → aria-hidden; Farbe ist nie alleiniger Bedeutungsträger
//  - jede Animation respektiert prefers-reduced-motion (motion-reduce:transition-none)
import * as React from "react";
import { Search, X } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

export interface FilterBarProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "onChange"
> {
  /** Aktueller Suchbegriff (kontrolliert). */
  value: string;
  /** Wird mit dem neuen Suchbegriff gerufen (auch beim Leeren über das X / Esc / Zurücksetzen). */
  onValueChange: (value: string) => void;
  /** Platzhaltertext des Such-Inputs. */
  placeholder?: string;
  /** Unsichtbares Label des Such-Inputs (für Screenreader). Default: „Suchen". */
  searchLabel?: string;
  /**
   * Optionale Filter-Slots — Chips, Select-Trigger, Toggles o. Ä. Sie werden rechts neben dem
   * Such-Input ausgerichtet. Vollständig generisch: die Leiste kennt deren Inhalt nicht.
   */
  filters?: React.ReactNode;
  /**
   * Anzahl der aktuell sichtbaren Ergebnisse. Wird — falls gesetzt — in einer Live-Region angezeigt.
   * `undefined` blendet den Zähler aus.
   */
  resultCount?: number;
  /** Optionale Gesamtanzahl (vor Filter). Wird als „X von Y" gerendert, falls gesetzt. */
  totalCount?: number;
  /**
   * Beschriftet den Zähler. Bekommt die gefilterte (und optional die Gesamt-)Anzahl und liefert den
   * vollständigen Text. Default: „N Ergebnisse" bzw. „N von M Ergebnissen".
   */
  formatResultLabel?: (count: number, total?: number) => string;
  /**
   * Ob aktuell Filter aktiv sind (steuert die Sichtbarkeit des „Zurücksetzen"-Knopfs zusätzlich zur
   * Suche). Default: aus dem Suchbegriff abgeleitet.
   */
  hasActiveFilters?: boolean;
  /** Wird beim Klick auf „Zurücksetzen" gerufen — die Suche wird zusätzlich automatisch geleert. */
  onReset?: () => void;
  /** Beschriftung des Zurücksetzen-Knopfs. Default: „Zurücksetzen". */
  resetLabel?: string;
}

/** Standard-Formatierung des Ergebnis-Zählers — sprachlich neutral, ohne Domänenbezug. */
function defaultResultLabel(count: number, total?: number): string {
  const ergebnis = count === 1 ? "Ergebnis" : "Ergebnisse";
  if (typeof total === "number" && total !== count) {
    return `${count} von ${total} ${ergebnis}`;
  }
  return `${count} ${ergebnis}`;
}

/**
 * Generische Filter-/Suchleiste. Kontrolliert (value + onValueChange); alle fachlichen Filter kommen als
 * `filters`-Slot. Der Ergebnis-Zähler ist eine Live-Region, der Zurücksetzen-Knopf erscheint nur bei
 * aktiver Suche/aktiven Filtern.
 */
export const FilterBar = React.forwardRef<HTMLDivElement, FilterBarProps>(
  (
    {
      value,
      onValueChange,
      placeholder = "Suchen …",
      searchLabel = "Suchen",
      filters,
      resultCount,
      totalCount,
      formatResultLabel = defaultResultLabel,
      hasActiveFilters,
      onReset,
      resetLabel = "Zurücksetzen",
      className,
      ...props
    },
    ref,
  ) => {
    const inputId = React.useId();
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // „aktiv" = Suchbegriff vorhanden ODER explizit von außen als aktiv markiert.
    const aktiv = hasActiveFilters ?? value.trim().length > 0;
    const zeigeReset = aktiv && typeof onReset === "function";
    const zeigeZaehler = typeof resultCount === "number";

    const leereSuche = React.useCallback(() => {
      onValueChange("");
      inputRef.current?.focus();
    }, [onValueChange]);

    const handleReset = React.useCallback(() => {
      onValueChange("");
      onReset?.();
    }, [onValueChange, onReset]);

    const handleKeyDown = React.useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        // Esc leert die Suche (statt z. B. ein umgebendes Popover zu schließen).
        if (e.key === "Escape" && value.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          leereSuche();
        }
      },
      [value, leereSuche],
    );

    return (
      <div
        ref={ref}
        role="search"
        className={cn("flex flex-col gap-3", className)}
        {...props}
      >
        {/* Reihe 1: Such-Input (+ Löschen) und die Filter-Slots. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            {/* Unsichtbares, aber vorhandenes Label — Screenreader-tauglich, ohne sichtbare Beschriftung. */}
            <label htmlFor={inputId} className="sr-only">
              {searchLabel}
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                // Feld-Muster (Spec 4.1): h-10 default, klare Feldfläche (bg-input-bg), weiche Elevation.
                "h-10 w-full rounded-md border border-input bg-input-bg pl-9 pr-9 text-sm text-foreground shadow-xs",
                "placeholder:text-muted-foreground transition-colors ease-out motion-reduce:transition-none",
                // Kanonisches Fokus-Rezept (Spec 3.2): EIN Rezept, 3px weicher Ring.
                "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                // Native Such-Lösch-Kreuze ausblenden — wir liefern einen eigenen, barrierefreien Knopf.
                "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none",
              )}
            />
            {value.length > 0 && (
              <button
                type="button"
                onClick={leereSuche}
                aria-label="Suche leeren"
                className={cn(
                  "absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground",
                  "transition-colors ease-out hover:bg-accent hover:text-accent-foreground motion-reduce:transition-none",
                  "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                )}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {filters && (
            <div className="flex flex-wrap items-center gap-2">{filters}</div>
          )}
        </div>

        {/* Reihe 2: Ergebnis-Zähler (Live-Region) + Zurücksetzen. Nur rendern, wenn etwas zu zeigen ist. */}
        {(zeigeZaehler || zeigeReset) && (
          <div className="flex items-center justify-between gap-3">
            <p
              aria-live="polite"
              aria-atomic="true"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {zeigeZaehler
                ? formatResultLabel(resultCount as number, totalCount)
                : ""}
            </p>
            {zeigeReset && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="shrink-0"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {resetLabel}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  },
);
FilterBar.displayName = "FilterBar";
