// fachverfahren-kit/ui/combobox — durchsuchbarer Single-Select (generisch, token-getrieben).
//
// Trigger-Button + Popover mit Filter-Input und Optionsliste. Vollständige Tastatur-Bedienung
// (Pfeiltasten/Home/End/Enter/Esc), Listbox-Muster mit `aria-activedescendant` (kein DOM-Fokus-Roving,
// damit der Filter-Input fokussiert bleibt), `aria-expanded`/`aria-controls` am Trigger.
//
// GENERISCH: keine Domänen-Literale — Optionen/Wert/onChange kommen ausschließlich als Props.
// A11y BITV/WCAG 2.2 AA: Labels/aria, Tastatur, sichtbarer Fokus, Zielgröße ≥ 24px, motion-reduce,
// Auswahl nicht allein über Farbe (Häkchen-Icon).
"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover.js";
import { Input } from "../ui/input.js";

export interface ComboboxOption {
  /** Eindeutiger, stabiler Wert der Option. */
  value: string;
  /** Sichtbares Label. */
  label: string;
  /** Deaktivierte Option ist nicht auswählbar (bleibt aber sichtbar). */
  disabled?: boolean;
}

export interface ComboboxProps {
  /** Auswahl-Optionen (generisch — keine Domänen-Annahmen). */
  options: ReadonlyArray<ComboboxOption>;
  /** Aktuell ausgewählter Wert; leer/undefiniert = keine Auswahl. */
  value?: string;
  /** Meldet die neue Auswahl. */
  onChange: (value: string) => void;
  /** Text im Trigger, solange nichts ausgewählt ist. */
  placeholder?: string;
  /** Platzhalter im Filter-Eingabefeld. */
  searchPlaceholder?: string;
  /** Anzeige, wenn der Filter keine Treffer liefert. */
  emptyText?: string;
  /** Zugängliches Label, falls kein sichtbares `<label>` per `id` verknüpft ist. */
  ariaLabel?: string;
  /** Verknüpfung zu einem externen `<label htmlFor>`-Element. */
  id?: string;
  disabled?: boolean;
  className?: string;
}

/** Filtert Optionen case-/diakritika-tolerant nach dem Suchbegriff. */
function matches(option: ComboboxOption, query: string): boolean {
  if (query.trim() === "") return true;
  const norm = (s: string) =>
    s.toLocaleLowerCase("de-DE").normalize("NFD").replace(/[̀-ͯ]/g, "");
  return (
    norm(option.label).includes(norm(query)) ||
    norm(option.value).includes(norm(query))
  );
}

/** Durchsuchbarer Single-Select nach dem ARIA-Combobox-/Listbox-Muster. */
export const Combobox: React.FC<ComboboxProps> = ({
  options,
  value,
  onChange,
  placeholder = "Auswählen…",
  searchPlaceholder = "Suchen…",
  emptyText = "Keine Treffer.",
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

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const filtered = React.useMemo(
    () => options.filter((o) => matches(o, query)),
    [options, query],
  );

  const selected = React.useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // Beim Öffnen den aktiven Index auf die aktuelle Auswahl (oder den ersten Treffer) setzen.
  React.useEffect(() => {
    if (!open) return;
    const selIdx = filtered.findIndex((o) => o.value === value);
    const firstEnabled = filtered.findIndex((o) => !o.disabled);
    setActiveIndex(selIdx >= 0 ? selIdx : Math.max(0, firstEnabled));
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open, value, filtered]);

  // Aktiven Index in Sicht halten.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(optionId(activeIndex))}`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function closeAndFocusTrigger() {
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function commit(index: number) {
    const opt = filtered[index];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    closeAndFocusTrigger();
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
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => nextEnabled(i, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => nextEnabled(i, -1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(nextEnabled(-1, 1));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(nextEnabled(0, -1));
        break;
      case "Enter":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        closeAndFocusTrigger();
        break;
      case "Tab":
        // Tab schließt ohne Auswahl, Fokus wandert natürlich weiter.
        setOpen(false);
        setQuery("");
        break;
      default:
        break;
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  const activeDescendant =
    open && activeIndex >= 0 && activeIndex < filtered.length
      ? optionId(activeIndex)
      : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverAnchor asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-haspopup="listbox"
          aria-label={ariaLabel ?? undefined}
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex h-9 min-h-[2.25rem] w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-sm",
            "transition-colors duration-150 ease-out motion-reduce:transition-none",
            "hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </button>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[12rem] p-0"
        onOpenAutoFocus={(e) => {
          // Fokus selbst auf den Filter-Input setzen (nicht auf das erste Element).
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            id={inputId}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeDescendant}
            aria-label={searchPlaceholder}
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ?? placeholder}
          className="max-h-64 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <li
              role="presentation"
              className="px-3 py-6 text-center text-sm text-muted-foreground"
            >
              {emptyText}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const isSelected = opt.value === value;
              const isActive = i === activeIndex;
              return (
                <li
                  key={opt.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled || undefined}
                  onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                  onMouseDown={(e) => {
                    // mousedown statt click — verhindert Fokus-Verlust des Inputs vor dem Commit.
                    e.preventDefault();
                    commit(i);
                  }}
                  className={cn(
                    "flex min-h-[2rem] cursor-pointer select-none items-center gap-2 rounded-sm px-3 py-1.5 text-sm",
                    "transition-colors duration-150 ease-out motion-reduce:transition-none",
                    isActive &&
                      !opt.disabled &&
                      "bg-accent text-accent-foreground",
                    opt.disabled && "cursor-not-allowed opacity-50",
                  )}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden="true"
                  />
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

Combobox.displayName = "Combobox";
