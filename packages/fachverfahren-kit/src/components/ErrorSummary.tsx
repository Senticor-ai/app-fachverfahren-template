// fachverfahren-kit/components/ErrorSummary — WCAG-konformes Fehlerzusammenfassungs-Muster
// (WCAG 3.3.1/3.3.3, BITV 2.0). Steht OBEN im Formular, bündelt alle
// Validierungsfehler, ist fokussierbar (tabIndex=-1 + forwardRef → der Aufrufer setzt nach dem Absenden den
// Fokus) und verlinkt per Anker (#feldId) direkt auf das fehlerhafte Feld. GENERISCH: kein Domänen-Literal,
// alle Fehler kommen als props. Dep-frei (nur React + Tailwind + lucide). Barrierefrei (BITV/WCAG 2.2 AA):
// role="alert" (assertive), aria-labelledby auf die Überschrift, sichtbarer Fokus-Ring, Status-Tokens statt
// Ad-hoc-Farben, Lucide-Icon aria-hidden.
import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "../lib/utils.js";

/** Ein einzelner Fehlereintrag: Feld-Anker + lesbarer Fehlertext. */
export interface FieldError {
  /** id des betroffenen Felds (ohne „#"). Der Listeneintrag verlinkt auf `#feldId`. */
  feldId: string;
  /** Lesbarer Fehlertext, z.B. "Bitte geben Sie ein gültiges Geburtsdatum an." */
  text: string;
}

export interface ErrorSummaryProps {
  /** Die Fehler. Ist die Liste leer, rendert die Komponente nichts. */
  errors: FieldError[];
  /** Überschrift der Zusammenfassung. Default: übliches "Es ist ein Problem aufgetreten". */
  title?: string;
  /**
   * Klick-Handler je Eintrag. Default: setzt den Fokus auf `#feldId` (sofern es fokussierbar ist) und
   * lässt den nativen Anker an die Stelle springen. Über den Handler kann der Aufrufer das Fokus-/
   * Scroll-Verhalten überschreiben (z.B. um ein Akkordeon zu öffnen).
   */
  onErrorClick?: (
    feldId: string,
    event: React.MouseEvent<HTMLAnchorElement>,
  ) => void;
  className?: string;
}

/** Default: bei Klick den Anker-Sprung beibehalten und zusätzlich den Fokus auf das Zielfeld setzen. */
function focusTarget(feldId: string): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(feldId);
  if (el instanceof HTMLElement) {
    // Kurz verzögern, damit der native Hash-Sprung zuerst greift.
    window.requestAnimationFrame(() => el.focus({ preventScroll: false }));
  }
}

/**
 * Fehlerzusammenfassung (WCAG-konformes Fehlerzusammenfassungs-Muster, WCAG 3.3.1/3.3.3, BITV 2.0). Wird nach einem fehlgeschlagenen Absenden oben im Formular gerendert
 * und sollte fokussiert werden — dafür `tabIndex={-1}` + den weitergereichten `ref`:
 *
 *   const summaryRef = useRef<HTMLDivElement>(null);
 *   // nach der Validierung:
 *   summaryRef.current?.focus();
 *   <ErrorSummary ref={summaryRef} errors={errors} />
 */
export const ErrorSummary = React.forwardRef<HTMLDivElement, ErrorSummaryProps>(
  (
    {
      errors,
      title = "Es ist ein Problem aufgetreten",
      onErrorClick,
      className,
    },
    ref,
  ) => {
    const titleId = React.useId();
    if (errors.length === 0) return null;

    const handleClick =
      (feldId: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (onErrorClick) {
          onErrorClick(feldId, event);
          return;
        }
        focusTarget(feldId);
      };

    return (
      <div
        ref={ref}
        role="alert"
        tabIndex={-1}
        aria-labelledby={titleId}
        className={cn(
          "rounded-lg border-2 border-status-block bg-status-block-soft p-6 text-foreground shadow-sm",
          "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <AlertCircle
            className="mt-0.5 h-5 w-5 shrink-0 text-status-block"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-foreground">
              {title}
            </h2>
            <ul className="mt-3 space-y-2">
              {errors.map((err) => (
                <li key={err.feldId}>
                  <a
                    href={`#${err.feldId}`}
                    onClick={handleClick(err.feldId)}
                    className={cn(
                      // Fehler-Link == Inline-Feldfehler: 14px (fv-text-error), Signal über Farbe/Gewicht/Icon, nie Größe.
                      "fv-text-error rounded-sm underline decoration-2 underline-offset-2",
                      "transition-colors ease-out hover:text-destructive/80 motion-reduce:transition-none",
                      "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                    )}
                  >
                    {err.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  },
);
ErrorSummary.displayName = "ErrorSummary";
