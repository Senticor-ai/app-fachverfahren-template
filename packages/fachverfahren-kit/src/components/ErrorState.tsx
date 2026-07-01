// fachverfahren-kit/components/ErrorState — Fehlerzustand mit ERZWUNGENER Recovery (shadcn/ui-Stil).
//
// Schließt die Audit-Lücke „Fehler ohne Ausweg" (ImageCropper/CameraCapture/MermaidView zeigten nur Text
// oder Roh-Dumps). ErrorState garantiert IMMER mindestens eine Wiederherstellungs-Aktion und sagt den
// Fehler an (role="alert"). Kein Stacktrace für Endnutzer — nur Klartext + Recovery.
//
// GENERISCH + DEP-FREI (React + lucide + cn + Button). BARRIEREFREI: role="alert", echte <button>,
// sichtbarer Fokus, Icon dekorativ (aria-hidden), Information nie nur über Farbe.
import type { ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

export interface ErrorStateProps {
  /** Kurze, verständliche Überschrift (kein Fehlercode). */
  title?: string;
  /** Erklärung + nächster Schritt (eine bis zwei Zeilen). */
  description?: ReactNode;
  /** Primäre Recovery-Aktion (Wiederholen). Fehlt sie UND fehlen actions, wird ein Neuladen angeboten. */
  onRetry?: (() => void) | undefined;
  /** Label der Wiederhol-Aktion. */
  retryLabel?: string;
  /** Zusätzliche Recovery-Affordances (z. B. „Original herunterladen", „Support kontaktieren"). */
  actions?: ReactNode;
  /** Lucide-Icon (Default: Warn-Dreieck), dekorativ. */
  icon?: LucideIcon;
  /** Kompakte Inline-Variante (z. B. innerhalb einer Karte) statt zentriertem Block. */
  inline?: boolean;
  className?: string;
}

/**
 * Fehler-Block mit garantierter Wiederherstellung.
 *
 * @example
 * <ErrorState title="Dokument konnte nicht geladen werden" description="Bitte erneut versuchen." onRetry={reload} />
 */
export function ErrorState({
  title = "Es ist ein Fehler aufgetreten",
  description,
  onRetry,
  retryLabel = "Erneut versuchen",
  actions,
  icon: Icon = AlertTriangle,
  inline = false,
  className,
}: ErrorStateProps) {
  // Vertrag: IMMER mindestens eine Recovery-Affordance. Fehlt jede, fällt es auf Neuladen zurück.
  const hasExplicitRecovery = Boolean(onRetry) || Boolean(actions);
  const handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border border-status-block/40 bg-status-block-soft p-4 text-status-block",
        inline
          ? "items-start"
          : "flex-col items-center text-center sm:flex-row sm:items-start sm:text-left",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0 text-status-block" />
      <div className="flex-1 space-y-2">
        {/* Titel und Body teilen dieselbe Größe (text-sm) — Signal über Farbe/Gewicht/Icon, nie Größe. */}
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description != null && (
          <div className="text-sm text-muted-foreground">{description}</div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {onRetry != null && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw aria-hidden="true" className="size-4" />
              {retryLabel}
            </Button>
          )}
          {actions}
          {!hasExplicitRecovery && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleReload}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              Seite neu laden
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
