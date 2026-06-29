// fachverfahren-kit/ui/multi-select — Mehrfachauswahl mit entfernbaren Chips (generisch, token-getrieben).
//
// Ausgewählte Werte erscheinen als entfernbare Chips/Tags; ein Filter-Input öffnet ein Popover mit der
// Optionsliste (Mehrfachauswahl per Klick/Enter, Häkchen markiert Auswahl). Tastatur: Backspace im leeren
// Input entfernt den letzten Chip; Pfeiltasten/Home/End/Enter/Esc steuern die Liste
// (`aria-activedescendant`-Muster, Input behält den Fokus). `aria-expanded`/`aria-controls` am Input.
//
// GENERISCH: keine Domänen-Literale — Optionen/Werte/onChange kommen ausschließlich als Props.
// A11y BITV/WCAG 2.2 AA: Labels/aria, Tastatur, sichtbarer Fokus, Zielgröße ≥ 24px, motion-reduce,
// Auswahl nicht allein über Farbe (Häkchen + Chip-Text).
"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover.js";
import { Input } from "../ui/input.js";

export interface MultiSelectOption {
  /** Eindeutiger, stabiler Wert der Option. */
  value: string;
  /** Sichtbares Label. */
  label: string;
  /** Deaktivierte Option ist nicht auswählbar (bleibt aber sichtbar). */
  disabled?: boolean;
}

export interface MultiSelectProps {
  /** Auswahl-Optionen (generisch — keine Domänen-Annahmen). */
  options: ReadonlyArray<MultiSelectOption>;
  /** Aktuell ausgewählte Werte. */
  value: ReadonlyArray<string>;
  /** Meldet die neue Werte-Liste. */
  onChange: (value: string[]) => void;
  /** Text, solange nichts ausgewählt ist. */
  placeholder?: string;
  /** Platzhalter im Filter-Eingabefeld. */
  searchPlaceholder?: string;
  /** Anzeige, wenn der Filter keine Treffer liefert. */
  emptyText?: string;
  /** Optionales Limit der gleichzeitig wählbaren Werte. */
  maxSelected?: number;
  /** Zugängliches Label für das Eingabefeld. */
  ariaLabel?: string;
  /** Verknüpfung zu einem externen `<label htmlFor>`-Element. */
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Filtert Optionen case-/diakritika-tolerant nach dem Suchbegriff. */
function matches(option: MultiSelectOption, query: string): boolean {
  if (query.trim() === "") return true;
  const norm = (s: string) =>
    s
      .toLocaleLowerCase("de-DE")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  return norm(option.label).includes(norm(query)) || norm(option.value).includes(norm(query));
}

/** Mehrfachauswahl mit Chips nach dem ARIA-Combobox-/Listbox-Muster. */
export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Auswählen…",
  searchPlaceholder = "Suchen…",
  emptyText = "Keine Treffer.",
  maxSelected,
  ariaLabel,
  id,
  disabled = false,
  className,
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  const reactId = React.useId();
  const listboxId = `${reactId}-listbox`;
  const inputId = `${reactId}-input`;
  const optionId = (i: number) => `${reactId}-opt-${i}`;

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selectedSet = React.useMemo(() => new Set(value), [value]);

  const filtered = React.useMemo(
    () => options.filter((o) => matches(o, query)),
    [options, query],
  );

  // Ausgewählte Optionen in der Reihenfolge von `value` (für die Chip-Anzeige) auflösen.
  const selectedOptions = React.useMemo(
    () =>
      value
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is MultiSelectOption => o !== undefined),
    [value, options],
  );

  const atLimit = maxSelected !== undefined && value.length >= maxSelected;

  React.useEffect(() => {
    if (!open) return;
    const firstEnabled = filtered.findIndex((o) => !o.disabled);
    setActiveIndex(Math.max(0, firstEnabled));
  }, [open, filtered]);

  // Aktiven Index in Sicht halten.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(activeIndex))}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function toggle(optValue: string) {
    if (selectedSet.has(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      if (atLimit) return;
      onChange([...value, optValue]);
    }
  }

  function commit(index: number) {
    const opt = filtered[index];
    if (!opt || opt.disabled) return;
    if (!selectedSet.has(opt.value) && atLimit) return;
    toggle(opt.value);
    setQuery("");
    focusInput();
  }

  function removeAt(optValue: string) {
    onChange(value.filter((v) => v !== optValue));
    focusInput();
  }

  function removeLast() {
    const last = value[value.length - 1];
    if (last !== undefined) onChange(value.slice(0, -1));
  }

  /** Nächsten auswählbaren Index in Richtung `dir` finden (überspringt deaktivierte). */
  function nextEnabled(from: number, dir: 1 | -1): number {
    if (filtered.length === 0) return -1;
    let i = from;
    for (let step = 0; step < filtered.length; step++) {
      i = (i + dir + filtered.length) % filtered.length;
      if (!filtered[i]?.disabled) return i;
    }
    return from;
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "Backspace":
        if (query === "" && value.length > 0) {
          e.preventDefault();
          removeLast();
        }
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => nextEnabled(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => nextEnabled(i, -1));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(nextEnabled(-1, 1));
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(nextEnabled(0, -1));
        }
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          commit(activeIndex);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setQuery("");
        }
        break;
      default:
        break;
    }
  }

  const activeDescendant =
    open && activeIndex >= 0 && activeIndex < filtered.length ? optionId(activeIndex) : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverAnchor asChild>
        <div
          onMouseDown={(e) => {
            // Klick auf den Container (nicht auf einen Chip-Button) fokussiert den Input und öffnet.
            if (disabled) return;
            if ((e.target as HTMLElement).closest("button")) return;
            e.preventDefault();
            inputRef.current?.focus();
            setOpen(true);
          }}
          className={cn(
            "flex min-h-[2.25rem] w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm",
            "transition-colors duration-150 ease-out motion-reduce:transition-none",
            "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
            disabled && "cursor-not-allowed opacity-50",
            className,
          )}
        >
          {selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary py-0.5 pl-2 pr-0.5 text-xs text-secondary-foreground"
            >
              <span className="truncate">{opt.label}</span>
              <button
                type="button"
                tabIndex={-1}
                disabled={disabled}
                onClick={() => removeAt(opt.value)}
                aria-label={`"${opt.label}" entfernen`}
                className={cn(
                  // Zielgröße ≥ 24px (WCAG 2.2 AA SC 2.5.8): 24×24px Trefferfläche, Icon bleibt klein.
                  "inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground",
                  "transition-colors duration-150 ease-out motion-reduce:transition-none",
                  "hover:bg-destructive hover:text-destructive-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            id={id ?? inputId}
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            onFocus={() => !disabled && setOpen(true)}
            placeholder={selectedOptions.length === 0 ? placeholder : ""}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            aria-label={ariaLabel ?? placeholder}
            className={cn(
              "h-7 min-w-[6rem] flex-1 bg-transparent px-1 text-sm outline-none",
              "placeholder:text-muted-foreground disabled:cursor-not-allowed",
            )}
          />

          <ChevronsUpDown
            className="ml-auto h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-0"
        onOpenAutoFocus={(e) => {
          // Fokus beim Eingabefeld belassen — der Input steuert die Liste.
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            aria-label={searchPlaceholder}
            aria-controls={listboxId}
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {maxSelected !== undefined && (
          <p className="px-3 pt-2 text-xs text-muted-foreground" aria-live="polite">
            {value.length} von {maxSelected} ausgewählt
          </p>
        )}

        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel ?? placeholder}
          className="max-h-64 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <li role="presentation" className="px-3 py-6 text-center text-sm text-muted-foreground">
              {emptyText}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = selectedSet.has(opt.value);
              const isActive = i === activeIndex;
              const blockedByLimit = !isSelected && atLimit;
              const effectivelyDisabled = opt.disabled || blockedByLimit;
              return (
                <li
                  key={opt.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={effectivelyDisabled || undefined}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(i);
                  }}
                  className={cn(
                    "flex min-h-[2rem] cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm",
                    "transition-colors duration-150 ease-out motion-reduce:transition-none",
                    isActive && !effectivelyDisabled && "bg-accent text-accent-foreground",
                    effectivelyDisabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border",
                    )}
                    aria-hidden="true"
                  >
                    <Check className={cn("h-3 w-3", isSelected ? "opacity-100" : "opacity-0")} />
                  </span>
                  <span className="truncate">{opt.label}</span>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

MultiSelect.displayName = "MultiSelect";
