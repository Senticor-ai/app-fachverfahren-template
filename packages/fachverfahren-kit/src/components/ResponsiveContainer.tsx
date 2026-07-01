// fachverfahren-kit/components/ResponsiveContainer — der GENERISCHE Mobile-first-Inhaltsrahmen.
//
// Zentriert Inhalt, begrenzt die Lesebreite (max-w aus einer kleinen, benannten Skala) und vergibt
// responsives Innen-Padding (mobile-first: kleiner Default, der zu größeren Viewports hin wächst).
// Optional reserviert er unten Platz für die fixierte MobileNav-Bottom-Bar (inkl. safe-area-inset).
// Vollständig generisch — keine Domänen-Literale; Inhalt kommt ausschließlich als children.
import * as React from "react";

import { cn } from "../lib/utils.js";

/** Benannte, semantische max-width-Skala — eine Quelle der Wahrheit statt Magic-Klassen am Aufrufort. */
export type ContainerWidth = "sm" | "md" | "lg" | "xl" | "full";

/** Innen-Padding-Stärke (mobile-first; alle Stufen wachsen zu größeren Viewports hin). */
export type ContainerPadding = "none" | "sm" | "md" | "lg";

const WIDTH_CLASS: Record<ContainerWidth, string> = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  full: "max-w-none",
};

// Spacing-Skala 4/8/12/16/24 → mobile-first, größere Viewports erhalten mehr Luft.
const PADDING_X_CLASS: Record<ContainerPadding, string> = {
  none: "",
  sm: "px-3 sm:px-4",
  md: "px-4 sm:px-6 lg:px-8",
  lg: "px-4 sm:px-8 lg:px-12",
};

const PADDING_Y_CLASS: Record<ContainerPadding, string> = {
  none: "",
  sm: "py-3 sm:py-4",
  md: "py-4 sm:py-6 lg:py-8",
  lg: "py-6 sm:py-8 lg:py-12",
};

export interface ResponsiveContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** Maximale Lesebreite (benannte Skala). Default „lg". */
  width?: ContainerWidth;
  /** Horizontales Innen-Padding (mobile-first). Default „md". */
  paddingX?: ContainerPadding;
  /** Vertikales Innen-Padding (mobile-first). Default „md". */
  paddingY?: ContainerPadding;
  /**
   * Unten zusätzlich Platz für eine fixierte MobileNav-Bottom-Bar reservieren (nur < md, inkl.
   * safe-area-inset-bottom). Verhindert, dass Inhalt hinter der Tab-Bar verschwindet. Default false.
   */
  reserveBottomNav?: boolean;
  /** Semantisches Element (z. B. „main", „section", „div"). Default „div". */
  as?: "div" | "main" | "section" | "article";
  children?: React.ReactNode;
}

/**
 * Mobile-first-Inhaltsrahmen: zentriert, begrenzte Lesebreite, responsives Padding und optionaler
 * Bottom-Nav-Freiraum. Reicht alle weiteren HTML-Attribute (aria-*, id, role …) durch.
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  width = "lg",
  paddingX = "md",
  paddingY = "md",
  reserveBottomNav = false,
  as = "div",
  className,
  children,
  ...rest
}) => {
  const Comp = as;
  return (
    <Comp
      className={cn(
        "mx-auto w-full",
        WIDTH_CLASS[width],
        PADDING_X_CLASS[paddingX],
        PADDING_Y_CLASS[paddingY],
        // Platz für die fixierte MobileNav (nur mobil): Bar-Höhe (~3.5rem) + sicherer Bereich.
        reserveBottomNav &&
          "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-[var(--container-pb,0px)]",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
};
ResponsiveContainer.displayName = "ResponsiveContainer";
