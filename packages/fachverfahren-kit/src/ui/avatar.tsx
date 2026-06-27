// shadcn/ui Avatar (Radix) — Bild mit Fallback-Initialen, token-getrieben, BITV/WCAG 2.2 AA.
// Generisch: Bildquelle/alt/Fallback ausschließlich als props. Keine Domänen-Literale.
import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "../lib/utils.js";

/**
 * Avatar-Container (rundes Element). Inhalt kommt als children:
 * `<AvatarImage>` (Bild) und `<AvatarFallback>` (Initialen/Icon), wie bei shadcn.
 */
const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

/**
 * Avatar-Bild. `alt` ist Pflicht für Barrierefreiheit (sinnvoller Text oder ""
 * für rein dekorative Avatare neben sichtbarem Namen).
 */
const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

/**
 * Fallback bei fehlendem/ladendem Bild — typischerweise Initialen (z. B. "TG").
 * Zentriert, mit ruhigem Sekundär-Ton; Inhalt kommt als children.
 */
const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
