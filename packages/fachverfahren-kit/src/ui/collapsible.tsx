// shadcn/ui Collapsible (Radix) — generisch, token-getrieben.
// Reiner Primitive-Re-Export: Inhalte (Trigger/Content) kommen ausschließlich als children.
import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { cn } from "../lib/utils.js";

/** Root — steuert open/defaultOpen/onOpenChange/disabled über die Radix-Props. */
const Collapsible = CollapsiblePrimitive.Root;

/** Trigger — schaltet auf/zu; styling kommt vollständig über className (z. B. das ui/button). */
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.Content
    ref={ref}
    className={cn(
      "overflow-hidden text-sm text-foreground data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none",
      className,
    )}
    {...props}
  >
    {children}
  </CollapsiblePrimitive.Content>
));
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
