// shadcn/ui Slider (Radix) — Track/Range/Thumb, vollständige Tastatur-Bedienung, BITV/WCAG 2.2 AA.
// Generisch: min/max/step/value/onValueChange ausschließlich als props. Keine Domänen-Literale.
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "../lib/utils.js";

/**
 * Schieberegler auf Basis von Radix. Unterstützt mehrere Thumbs (ein Thumb je
 * Wert in `value`/`defaultValue`). Tastatur (Pfeil/Home/End/PageUp/PageDown)
 * und ARIA (`role="slider"`, `aria-valuenow/min/max`) liefert Radix; pro Thumb
 * sollte ein `aria-label`/`aria-labelledby` gesetzt werden — daher rendert die
 * Komponente die Thumbs aus `value`/`defaultValue` und reicht `thumbAriaLabels`
 * positionsgenau durch.
 */
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
    /** Barrierefreie Beschriftung je Thumb (Index = Wert-Position). */
    thumbAriaLabels?: readonly string[];
  }
>(({ className, thumbAriaLabels, ...props }, ref) => {
  const values = props.value ?? props.defaultValue ?? [0];
  const thumbCount = Array.isArray(values) ? Math.max(values.length, 1) : 1;

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-md bg-secondary">
        <SliderPrimitive.Range className="absolute h-full rounded-md bg-primary" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbCount }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          aria-label={thumbAriaLabels?.[i]}
          className={cn(
            "block h-5 w-5 rounded-full border border-primary/50 bg-card shadow-sm",
            "transition-colors duration-150 ease-out motion-reduce:transition-none",
            "hover:border-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
});
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };
