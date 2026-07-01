// shadcn/ui Progress (Radix) — token-getriebene Fortschritts-Bar, BITV/WCAG 2.2 AA.
// Generisch: alle Werte (value/max/Label) kommen ausschließlich als props. Keine Domänen-Literale.
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "../lib/utils.js";

/**
 * Fortschritts-Anzeige (0–100, via `value`). Radix liefert `role="progressbar"`
 * + `aria-valuenow/min/max`. Für Screenreader sollte zusätzlich ein sichtbarer
 * Label-Text bzw. `aria-label`/`aria-labelledby` gesetzt werden.
 * Die Range-Breite folgt deterministisch `value`; Übergang ist `transition-*`
 * mit `motion-reduce:transition-none` (a11y).
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => {
  const clamped =
    typeof value === "number" ? Math.min(100, Math.max(0, value)) : null;
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-md bg-secondary",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 rounded-md bg-primary transition-transform duration-150 ease-out",
          "motion-reduce:transition-none",
        )}
        style={{ transform: `translateX(-${100 - (clamped ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
