// shadcn/ui Calendar — react-day-picker v10 DayPicker, token-getrieben.
// Generisch: keine Domänen-Literale; deutsche Locale via date-fns/locale/de.
// Tastatur/aria/Fokus liefert DayPicker selbst (WCAG 2.2 AA, BITV).
"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DayPicker,
  getDefaultClassNames,
  type DayPickerProps,
} from "react-day-picker";
import { de } from "date-fns/locale/de";

import { cn } from "../lib/utils.js";
import { buttonVariants } from "./button.js";

export type CalendarProps = DayPickerProps;

/**
 * Token-gestylter Kalender auf Basis von react-day-picker (v9).
 * - Deutsche Locale (Wochenstart Montag, Monats-/Tagesnamen aus date-fns/de).
 * - Navigation als seriöse Ghost-Buttons mit lucide-Chevrons.
 * - Zielgröße der Tageszellen ≥ 36px (> 24px Mindestgröße), Status nicht nur über Farbe:
 *   ausgewählter Tag erhält zusätzlich Hintergrund + Rahmen, heute eine Akzent-Markierung.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps): React.ReactElement {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      locale={de}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: cn(defaults.root, "w-fit text-foreground"),
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-4",
        month_caption: "flex h-9 items-center justify-center px-9",
        caption_label: "text-sm font-semibold",
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-8 w-8 p-0 text-muted-foreground hover:text-foreground",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-8 w-8 p-0 text-muted-foreground hover:text-foreground",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 flex-1 text-center text-xs font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: cn(
          "relative flex-1 p-0 text-center text-sm",
          "[&:has([aria-selected])]:bg-accent",
          "[&:has([aria-selected].day-range-start)]:rounded-l-md",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md",
          "first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
        ),
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "mx-auto flex h-9 w-9 items-center justify-center p-0 font-normal",
          "aria-selected:opacity-100",
          "transition-colors ease-out motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        ),
        selected: cn(
          "rounded-md bg-primary text-primary-foreground",
          "[&>button]:bg-primary [&>button]:text-primary-foreground",
          "[&>button:hover]:bg-primary/90 [&>button:hover]:text-primary-foreground",
          "[&>button:focus-visible]:bg-primary [&>button:focus-visible]:text-primary-foreground",
        ),
        range_start: "day-range-start rounded-l-md",
        range_end: "day-range-end rounded-r-md",
        range_middle: cn(
          "rounded-none bg-accent",
          "[&>button]:bg-transparent [&>button]:text-foreground",
          "[&>button:hover]:bg-accent [&>button:hover]:text-foreground",
        ),
        today: cn(
          "rounded-md border border-border",
          "[&>button]:font-semibold",
        ),
        // Nachbarmonats-Tage: allein per text-muted-foreground de-emphasized (5.31:1,
        // WCAG 2.1 AA). KEIN opacity auf dem Text — das zog interaktive Tag-Buttons auf
        // 2.1:1. (disabled-Tage sind als deaktivierte Bedienelemente kontrast-ausgenommen.)
        outside: "text-muted-foreground",
        disabled: "text-muted-foreground opacity-40",
        hidden: "invisible",
        week_number: "w-9 text-center text-xs text-muted-foreground",
        ...classNames,
      }}
      components={{
        // eslint-disable-next-line @eslint-react/no-nested-component-definitions -- intentionaler inline-Render-Helfer (Closure/Library-API)
        Chevron: ({ orientation, className: chevronClassName }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return (
            <Icon
              className={cn("h-4 w-4", chevronClassName)}
              aria-hidden="true"
            />
          );
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
