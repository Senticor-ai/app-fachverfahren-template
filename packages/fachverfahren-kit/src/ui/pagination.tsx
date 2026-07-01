// fachverfahren-kit/ui/pagination — generische Seiten-Navigation (shadcn/ui-Stil, dep-frei).
// Semantisch <nav aria-label> mit Vor/Zurück + Seitenzahlen, aria-current, ≥24px Zielgröße,
// saubere disabled-States. Token-getrieben, BITV/WCAG 2.2 AA. Stil entspricht ../ui/button.js.
import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "../lib/utils.js";

/** Container: <nav role="navigation" aria-label="Seitennavigation">. */
const Pagination = ({
  className,
  "aria-label": ariaLabel = "Seitennavigation",
  ...props
}: React.ComponentPropsWithoutRef<"nav">) => (
  <nav
    role="navigation"
    aria-label={ariaLabel}
    className={cn("mx-auto flex w-full justify-center", className)}
    {...props}
  />
);
Pagination.displayName = "Pagination";

/** Liste der Seiten-Elemente (semantisch <ul>). */
const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-row items-center gap-1", className)}
    {...props}
  />
));
PaginationContent.displayName = "PaginationContent";

/** Einzelnes Listenelement (<li>). */
const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("", className)} {...props} />
));
PaginationItem.displayName = "PaginationItem";

type PaginationLinkVariant = "ghost" | "outline";
type PaginationLinkSize = "default" | "icon";

const linkBase =
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-disabled:pointer-events-none aria-disabled:opacity-50";

const linkVariants: Record<PaginationLinkVariant, string> = {
  // aktive Seite: kräftiger Rahmen; inaktiv: dezenter Hover
  outline:
    "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
};

// Zielgröße ≥24px garantiert: icon = h-9 w-9 (36px), default ≥ min-h-9 (36px).
const linkSizes: Record<PaginationLinkSize, string> = {
  default: "min-h-9 min-w-9 px-3 py-2",
  icon: "h-9 w-9",
};

export interface PaginationLinkProps extends React.ComponentPropsWithoutRef<"a"> {
  /** Markiert die aktive Seite (setzt aria-current="page" + Aktiv-Variante). */
  isActive?: boolean;
  /** Deaktiviert das Element (aria-disabled, kein Klick/Fokus-Aktion). */
  disabled?: boolean;
  size?: PaginationLinkSize;
}

/** Seiten-Link im Button-Stil aus ../ui/button.js (outline aktiv / ghost inaktiv). */
const PaginationLink = React.forwardRef<HTMLAnchorElement, PaginationLinkProps>(
  (
    { className, isActive = false, disabled = false, size = "icon", ...props },
    ref,
  ) => (
    <a
      ref={ref}
      aria-current={isActive ? "page" : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : props.tabIndex}
      className={cn(
        linkBase,
        linkVariants[isActive ? "outline" : "ghost"],
        linkSizes[size],
        isActive && "border-primary text-primary font-semibold",
        className,
      )}
      {...props}
    />
  ),
);
PaginationLink.displayName = "PaginationLink";

export interface PaginationNavProps extends Omit<
  PaginationLinkProps,
  "isActive" | "size"
> {
  /** Sichtbares Label neben dem Pfeil (z. B. "Zurück"/"Weiter"). */
  label?: string;
}

/** Zurück-Schaltfläche mit Pfeil-Icon (dekorativ) und sichtbarem Label. */
const PaginationPrevious = ({
  className,
  label = "Zurück",
  disabled = false,
  ...props
}: PaginationNavProps) => (
  <PaginationLink
    aria-label={`Vorherige Seite, ${label}`}
    size="default"
    disabled={disabled}
    className={cn("gap-1 pl-2.5", className)}
    {...props}
  >
    <ChevronLeft aria-hidden="true" className="size-4" />
    <span>{label}</span>
  </PaginationLink>
);
PaginationPrevious.displayName = "PaginationPrevious";

/** Weiter-Schaltfläche mit Pfeil-Icon (dekorativ) und sichtbarem Label. */
const PaginationNext = ({
  className,
  label = "Weiter",
  disabled = false,
  ...props
}: PaginationNavProps) => (
  <PaginationLink
    aria-label={`Nächste Seite, ${label}`}
    size="default"
    disabled={disabled}
    className={cn("gap-1 pr-2.5", className)}
    {...props}
  >
    <span>{label}</span>
    <ChevronRight aria-hidden="true" className="size-4" />
  </PaginationLink>
);
PaginationNext.displayName = "PaginationNext";

/** Auslassungszeichen für gekürzte Seitenbereiche — dekorativ mit sr-only-Hinweis. */
const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) => (
  <span
    aria-hidden="true"
    className={cn(
      "flex h-9 w-9 items-center justify-center text-muted-foreground",
      className,
    )}
    {...props}
  >
    <MoreHorizontal aria-hidden="true" className="size-4" />
    <span className="sr-only">Weitere Seiten</span>
  </span>
);
PaginationEllipsis.displayName = "PaginationEllipsis";

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
