// Date-Picker — Button (mit Datum) öffnet Popover mit Calendar.
// DatePicker (single) für Antrags-Datumsfelder, DateRangePicker für Report-Zeiträume.
// Generisch: alle Beschriftungen via props; keine Domänen-Literale.
// Formatierung mit date-fns (deutsche Locale).
"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale/de";
import type { DateRange } from "react-day-picker";

import { cn } from "../lib/utils.js";
import { Button } from "./button.js";
import { Calendar } from "./calendar.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";

/** Datums-Anteile, die DayPicker als Auswahl-Beschränkung versteht. */
type CalendarRestProps = Omit<
  React.ComponentProps<typeof Calendar>,
  "mode" | "selected" | "onSelect" | "locale"
>;

export interface DatePickerProps {
  /** Aktuell gewählter Tag (kontrolliert). */
  value?: Date;
  /** Callback bei Auswahl; `undefined`, wenn die Auswahl aufgehoben wird. */
  onChange?: (date: Date | undefined) => void;
  /** Platzhalter, solange kein Datum gewählt ist. */
  placeholder?: string;
  /** date-fns Formatmuster für die Anzeige (Default: "PPP" → 1. Januar 2025). */
  displayFormat?: string;
  /** Zugängliche Beschriftung des Auslöse-Buttons (aria-label), z. B. ein Feldname. */
  ariaLabel?: string;
  /** Deaktiviert das gesamte Feld. */
  disabled?: boolean;
  /** Klassen für den Auslöse-Button. */
  className?: string;
  /** ID für Verknüpfung mit einem externen <label htmlFor>. */
  id?: string;
  /** Auswahl-Beschränkungen an den Calendar durchreichen (z. B. disabled/min/max). */
  calendarProps?: CalendarRestProps;
}

/**
 * Einzel-Datum für Antragsfelder. Der Button zeigt das formatierte Datum
 * (oder den Platzhalter) und öffnet ein Popover mit dem Kalender.
 * Vollständig tastaturbedienbar; Fokus, aria und Locale liefert der Kalender.
 */
function DatePicker({
  value,
  onChange,
  placeholder = "Datum wählen",
  displayFormat = "PPP",
  ariaLabel,
  disabled = false,
  className,
  id,
  calendarProps,
}: DatePickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  const handleSelect = React.useCallback(
    (next: Date | undefined) => {
      onChange?.(next);
      if (next) setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          data-empty={value ? undefined : true}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 text-left font-normal",
            "transition-colors duration-150 ease-out motion-reduce:transition-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            value ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate">
            {value ? format(value, displayFormat, { locale: de }) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleSelect}
          autoFocus
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  );
}
DatePicker.displayName = "DatePicker";

export interface DateRangePickerProps {
  /** Aktuell gewählter Zeitraum (kontrolliert). */
  value?: DateRange;
  /** Callback bei Auswahl; `undefined`, wenn der Zeitraum aufgehoben wird. */
  onChange?: (range: DateRange | undefined) => void;
  /** Platzhalter, solange kein Zeitraum gewählt ist. */
  placeholder?: string;
  /** date-fns Formatmuster für die Anzeige (Default: "dd.MM.yyyy"). */
  displayFormat?: string;
  /** Trenner zwischen Von- und Bis-Datum. */
  separator?: string;
  /** Zugängliche Beschriftung des Auslöse-Buttons (aria-label). */
  ariaLabel?: string;
  /** Anzahl gleichzeitig sichtbarer Monate (Default: 2 für Zeiträume). */
  numberOfMonths?: number;
  /** Deaktiviert das gesamte Feld. */
  disabled?: boolean;
  /** Klassen für den Auslöse-Button. */
  className?: string;
  /** ID für Verknüpfung mit einem externen <label htmlFor>. */
  id?: string;
  /** Auswahl-Beschränkungen an den Calendar durchreichen. */
  calendarProps?: CalendarRestProps;
}

/** Formatiert einen Zeitraum als "von – bis"; offene Enden bleiben leer. */
function formatRange(
  range: DateRange | undefined,
  pattern: string,
  separator: string,
): string | null {
  if (!range?.from) return null;
  const from = format(range.from, pattern, { locale: de });
  if (!range.to) return from;
  const to = format(range.to, pattern, { locale: de });
  return `${from}${separator}${to}`;
}

/**
 * Datums-Zeitraum für Report-Zeiträume. Zeigt "von – bis" und öffnet ein
 * Popover mit einem Mehrmonats-Kalender im Range-Modus.
 */
function DateRangePicker({
  value,
  onChange,
  placeholder = "Zeitraum wählen",
  displayFormat = "dd.MM.yyyy",
  separator = " – ",
  ariaLabel,
  numberOfMonths = 2,
  disabled = false,
  className,
  id,
  calendarProps,
}: DateRangePickerProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  const handleSelect = React.useCallback(
    (next: DateRange | undefined) => {
      onChange?.(next);
      if (next?.from && next?.to) setOpen(false);
    },
    [onChange],
  );

  const label = formatRange(value, displayFormat, separator);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          data-empty={label ? undefined : true}
          className={cn(
            "h-9 w-full justify-start gap-2 px-3 text-left font-normal",
            "transition-colors duration-150 ease-out motion-reduce:transition-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            label ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <CalendarDays
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="truncate">{label ?? placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={value}
          onSelect={handleSelect}
          numberOfMonths={numberOfMonths}
          autoFocus
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  );
}
DateRangePicker.displayName = "DateRangePicker";

export { DatePicker, DateRangePicker };
