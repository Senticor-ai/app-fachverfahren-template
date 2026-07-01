// shadcn/ui Input — modernisiert nach DESIGN-UPGRADE-SPEC (Spec 4.1).
import * as React from "react";

import { cn } from "../lib/utils.js";

export interface InputProps extends Omit<
  React.ComponentProps<"input">,
  "size"
> {
  /** Control-Höhe: default = 40px (h-10), lg = 44px (h-11, WCAG-Zielgröße/Touch). */
  size?: "default" | "lg";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size = "default", ...props }, ref) => (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex w-full rounded-md border border-input bg-input-bg px-3 py-2 text-sm text-foreground shadow-xs transition-colors duration-150 ease-out motion-reduce:transition-none",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "placeholder:text-muted-foreground",
        "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30",
        size === "lg" ? "h-11" : "h-10",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
