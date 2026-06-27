// fachverfahren-kit/ui/breadcrumb — generischer Breadcrumb (shadcn/ui-Stil, dep-frei).
// Reine semantische Navigation: <nav aria-label> › <ol> › <li>. Token-getrieben, BITV/WCAG 2.2 AA.
// Inhalte/Ziele kommen ausschließlich als props/children — keine Domänen-Literale.
import * as React from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";

import { cn } from "../lib/utils.js";

/** Container: <nav aria-label="Breadcrumb"> mit der Pfad-Liste als children. */
const Breadcrumb = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<"nav"> & { separator?: React.ReactNode }
>(({ "aria-label": ariaLabel = "Breadcrumb", ...props }, ref) => (
  <nav ref={ref} aria-label={ariaLabel} {...props} />
));
Breadcrumb.displayName = "Breadcrumb";

/** Geordnete Liste der Pfad-Segmente (semantisch <ol>). */
const BreadcrumbList = React.forwardRef<
  HTMLOListElement,
  React.ComponentPropsWithoutRef<"ol">
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-2 break-words text-sm text-muted-foreground",
      className,
    )}
    {...props}
  />
));
BreadcrumbList.displayName = "BreadcrumbList";

/** Einzelnes Segment (<li>) — enthält Link, Seite oder Ellipsis plus Separator. */
const BreadcrumbItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentPropsWithoutRef<"li">
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("inline-flex items-center gap-2", className)} {...props} />
));
BreadcrumbItem.displayName = "BreadcrumbItem";

export interface BreadcrumbLinkProps extends React.ComponentPropsWithoutRef<"a"> {
  /** Als Slot rendern (eigenes Anchor-Element, z. B. Router-Link). */
  asChild?: boolean;
}

/** Anklickbares Segment (verlinkt). Fokus sichtbar, Zielgröße über py-1 + min-h. */
const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, BreadcrumbLinkProps>(
  ({ className, asChild, children, ...props }, ref) => {
    const classes = cn(
      "inline-flex min-h-6 items-center rounded-md px-1 py-1 transition-colors duration-150 ease-out motion-reduce:transition-none hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      className,
    );
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        className: cn(classes, child.props.className),
      });
    }
    return (
      <a ref={ref} className={classes} {...props}>
        {children}
      </a>
    );
  },
);
BreadcrumbLink.displayName = "BreadcrumbLink";

/** Aktuelle Seite — nicht verlinkt, mit aria-current="page" und Farb-Hervorhebung. */
const BreadcrumbPage = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    role="link"
    aria-disabled="true"
    aria-current="page"
    className={cn("inline-flex min-h-6 items-center font-medium text-foreground", className)}
    {...props}
  />
));
BreadcrumbPage.displayName = "BreadcrumbPage";

/** Trenner zwischen Segmenten — dekorativ (aria-hidden), Standard-Icon ChevronRight. */
const BreadcrumbSeparator = ({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"li">) => (
  <li
    role="presentation"
    aria-hidden="true"
    className={cn("[&>svg]:size-3.5 text-muted-foreground", className)}
    {...props}
  >
    {children ?? <ChevronRight aria-hidden="true" />}
  </li>
);
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

/** Ellipsis für gekürzte Pfade — dekorativ mit zugänglichem Hinweistext. */
const BreadcrumbEllipsis = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) => (
  <span
    role="presentation"
    aria-hidden="true"
    className={cn("flex size-6 items-center justify-center text-muted-foreground", className)}
    {...props}
  >
    <MoreHorizontal aria-hidden="true" className="size-4" />
    <span className="sr-only">Weitere Ebenen</span>
  </span>
);
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
};
