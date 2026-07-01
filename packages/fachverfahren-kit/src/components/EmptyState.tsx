// fachverfahren-kit/components/EmptyState — generischer Leer-/Nullzustand-Block (dep-frei).
// Zentriert: Icon (lucide, via prop) + Headline + Beschreibung + optionale Primär-Aktion.
// ERSETZT die Liste auch für Screenreader: rendert als role="status" mit aria-live="polite",
// damit assistive Technik den Zustand statt einer leeren Liste ankündigt. KEINE Domänen-Literale.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

/** Optionale Primär-Aktion eines Leerzustands (z.B. „Ersten Vorgang anlegen"). */
export interface EmptyStateAction {
  /** Sichtbares Button-Label. */
  label: string;
  /** Klick-Handler — die Aktion selbst ist Sache des Aufrufers. */
  onClick: () => void;
  /** Optionales führendes Icon im Button (lucide). */
  icon?: LucideIcon;
  /** Button-Variante (Standard: primär). */
  variant?: "default" | "secondary" | "ghost" | "outline";
}

export interface EmptyStateProps {
  /** Lucide-Icon-Komponente (via prop, NICHT hartkodiert). Dekorativ → aria-hidden. */
  icon?: LucideIcon;
  /** Headline — kurz und konkret. Wird als Überschrift gerendert. */
  title: string;
  /** Optionale erklärende Beschreibung (eine bis zwei Zeilen). */
  description?: ReactNode;
  /** Optionale Primär-Aktion. */
  action?: EmptyStateAction;
  /** Überschriften-Ebene des Titels (Default h2 — passt in eine Seite mit h1). */
  as?: "h2" | "h3" | "p";
  className?: string;
}

/**
 * Ruhiger, zentrierter Leerzustand. Tritt an die Stelle einer leeren Liste/Tabelle und
 * kommuniziert den Zustand auch nicht-visuell (role="status"/aria-live).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  as = "h2",
  className,
}: EmptyStateProps) {
  const Heading = as;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span
          className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <Icon className="size-6" aria-hidden="true" />
        </span>
      )}

      <Heading className="text-base font-semibold text-foreground">
        {title}
      </Heading>

      {description && (
        <p className="max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      )}

      {action && (
        <Button
          type="button"
          onClick={action.onClick}
          variant={action.variant ?? "default"}
          size="sm"
          className="mt-1"
        >
          {action.icon && <action.icon aria-hidden="true" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}
