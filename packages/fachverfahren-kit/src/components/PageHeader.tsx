// fachverfahren-kit/components/PageHeader — generischer Seitenkopf (dep-frei).
// Titel als h1/h2 + optionale Beschreibung + optionaler Aktionen-Slot (rechts) + optionaler
// Breadcrumb-Slot (oben). Rein präsentierend, alles via props/children. KEINE Domänen-Literale.
import type { ReactNode } from "react";

import { cn } from "../lib/utils.js";

export interface PageHeaderProps {
  /** Sichtbarer Seitentitel. */
  title: string;
  /** Optionale erklärende Beschreibung unter dem Titel. */
  description?: ReactNode;
  /**
   * Optionale Aktionen (rechts neben dem Titel). Erwartet i.d.R. einen oder mehrere
   * `Button` aus `../ui/button.js` — vom Aufrufer übergeben (kein Hardcode).
   */
  actions?: ReactNode;
  /** Optionaler Breadcrumb-Bereich über dem Titel (z.B. eine `<nav>`). */
  breadcrumb?: ReactNode;
  /** Überschriften-Ebene des Titels (Default h1). */
  as?: "h1" | "h2";
  className?: string;
}

/**
 * Konsistenter Seitenkopf: Breadcrumb (optional) → Titelzeile mit Aktionen (optional) →
 * Beschreibung (optional). Die Titelzeile bricht auf schmalen Viewports um.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  as = "h1",
  className,
}: PageHeaderProps) {
  const Heading = as;

  return (
    <header
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-4",
        className,
      )}
    >
      {breadcrumb}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Titel + Beschreibung als enger interner Block (space-y-1); der äußere
            Bottom-Rhythmus (mb-6) liegt beim Aufrufer, damit der Kopf einheitlich sitzt. */}
        <div className="min-w-0 space-y-1">
          <Heading
            className={cn(
              "min-w-0 font-semibold tracking-tight text-foreground",
              // Spec-Typo-Skala: h1 = Seitentitel (24px), h2 = Sektionstitel (18px).
              as === "h1" ? "text-2xl" : "text-lg",
            )}
          >
            {title}
          </Heading>

          {description && (
            <p className="max-w-prose text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
