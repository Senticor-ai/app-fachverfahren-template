// fachverfahren-kit/components/Stepper — standalone responsiver Fortschritts-Navigator.
//
// Setzt DESIGN-UPGRADE-SPEC §4.6 (Zwei-Modus-Muster nach KERN/EU-ECL, WCAG 2.2) als eigenständiges,
// generisches Primitiv um und behebt den Stepper-Überlauf an der Wurzel:
//   A. IMMER sichtbares Text-Heading „Schritt X von Y — <Name>" (robuster, maßgeblicher Kern).
//   B. IMMER sichtbarer dünner Fortschrittsbalken (role="progressbar", läuft nie über).
//   C. Horizontaler Segment-Pfad NUR ab genügend Breite — mit `flex-wrap` + `truncate`,
//      kann daher in KEINEM Container-Breitenbereich horizontal überlaufen (Akzeptanz §7).
// Optional: vertikale Variante für schmale Seitenspalten (Marker links, Label rechts).
//
// GENERISCH + vendor-/domänen-neutral: keine Domänen-Literale, alle Inhalte kommen als props.
// Nur semantische Tokens (bg-primary, text-status-ok, bg-muted …), kein rohes Hex/px.
// WCAG 2.2 AA / BITV: aria-current, sr-only Status je Segment + Live-Region, kanonischer 3px-Fokus
// (`fv-focus`), Information nie nur über Farbe (Icon + Text je Zustand), `motion-reduce`.
// Steuerbar via `useStepMachine` (index → activeIndex, steps → StepperStep[]).
import { Check, AlertTriangle } from "lucide-react";

import { cn } from "../lib/cn.js";

/** Zustand eines einzelnen Schritts im Fortschritts-Pfad. */
export type StepperStepStatus = "done" | "current" | "upcoming" | "invalid";

/** Ein Schritt des Steppers — generisch, Inhalt kommt vollständig vom Aufrufer. */
export interface StepperStep {
  /** Stabile id des Schritts (für onStepSelect / Zuordnung). */
  id: string;
  /** Sichtbares Label des Schritts (wird im Pfad ggf. getruncatet, im Heading voll gezeigt). */
  label: string;
  /** Zustand des Schritts — trägt Farbe UND Icon/Text (nie nur Farbe). */
  status: StepperStepStatus;
}

export interface StepperProps {
  /** Die Schritte in Reihenfolge (data-driven, z. B. aus `useStepMachine().steps`). */
  steps: StepperStep[];
  /** Index des aktuellen Schritts (0-basiert, z. B. `useStepMachine().index`). */
  activeIndex: number;
  /** Gesamtzahl der Schritte für den Zähler; default = `steps.length`
   *  (überschreibbar, falls es virtuelle Schritte wie ein Review gibt). */
  total?: number;
  /** Layout des Segment-Pfads. `horizontal` (default) bricht um; `vertical` für schmale Spalten. */
  orientation?: "horizontal" | "vertical";
  /** Callback beim Anwählen eines Schritts (macht die Segmente zu Buttons). */
  onStepSelect?: (index: number) => void;
  /** Segmente klickbar machen (nur wirksam mit `onStepSelect`). */
  clickable?: boolean;
  /** Zugängliches Label für die Navigation (default generisch, überschreibbar/übersetzbar). */
  ariaLabel?: string;
  className?: string;
}

/** Menschlich lesbarer Statustext je Zustand — für sr-only-Ansage (Information nie nur über Farbe). */
const STATUS_TEXT: Record<StepperStepStatus, string> = {
  done: "abgeschlossen",
  current: "aktuell",
  upcoming: "offen",
  invalid: "unvollständig",
};

/** Marker-Klassen je Zustand — Farbe ist Verstärkung, das Icon/die Nummer trägt die Information mit. */
const MARKER_TONE: Record<StepperStepStatus, string> = {
  done: "border-transparent bg-status-ok text-primary-foreground",
  current: "border-transparent bg-primary text-primary-foreground",
  upcoming: "border-border bg-muted text-muted-foreground",
  invalid: "border-transparent bg-status-block text-primary-foreground",
};

/** Label-Klassen je Zustand — betonter für aktiv/ungültig, gedämpft für offen. */
const LABEL_TONE: Record<StepperStepStatus, string> = {
  done: "text-foreground",
  current: "text-foreground font-medium",
  upcoming: "text-muted-foreground",
  invalid: "text-status-block font-medium",
};

/** Rendert den Nummernkreis/Marker eines Segments: Check bei done, „!" bei invalid, sonst 1-basierte Nummer. */
function StepMarker({
  status,
  index,
}: {
  status: StepperStepStatus;
  index: number;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        "transition-colors duration-150 ease-out motion-reduce:transition-none",
        MARKER_TONE[status],
      )}
    >
      {status === "done" ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : status === "invalid" ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        index + 1
      )}
    </span>
  );
}

/**
 * Standalone responsiver Fortschritts-Navigator.
 *
 * @example
 * const flow = useStepMachine({ steps });
 * <Stepper
 *   steps={flow.steps.map((s, i) => ({
 *     id: s.id,
 *     label: s.label,
 *     status: i < flow.index ? "done" : i === flow.index ? "current" : "upcoming",
 *   }))}
 *   activeIndex={flow.index}
 *   clickable
 *   onStepSelect={(i) => flow.goTo(flow.steps[i]!.id)}
 * />
 */
export function Stepper({
  steps,
  activeIndex,
  total,
  orientation = "horizontal",
  onStepSelect,
  clickable = false,
  ariaLabel = "Fortschritt",
  className,
}: StepperProps) {
  const stepCount = total ?? steps.length;
  // activeIndex defensiv klemmen, damit Heading/Progress nie NaN/negativ werden.
  const safeIndex = Math.min(
    Math.max(activeIndex, 0),
    Math.max(stepCount - 1, 0),
  );
  const current = steps[safeIndex];
  const currentLabel = current?.label ?? "";
  // Fortschritt: (idx + 1) / total, 0–100, für Balken UND aria-valuenow.
  const percent =
    stepCount > 0 ? Math.round(((safeIndex + 1) / stepCount) * 100) : 0;

  const interactive = clickable && typeof onStepSelect === "function";
  const isVertical = orientation === "vertical";

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-3", className)}
    >
      {/* A. Robuster Kern: Text-Heading „Schritt X von Y — <Name>" (maßgebliche Wahrheit, immer sichtbar). */}
      <p className="text-sm font-medium text-foreground">
        Schritt <span className="tabular-nums">{safeIndex + 1}</span> von{" "}
        <span className="tabular-nums">{stepCount}</span>
        {currentLabel ? <> — {currentLabel}</> : null}
      </p>

      {/* sr-only Live-Region: sagt den Schrittwechsel an (Information zusätzlich textlich, nie nur visuell). */}
      <span className="sr-only" role="status" aria-live="polite">
        Schritt {safeIndex + 1} von {stepCount}
        {currentLabel ? `, ${currentLabel}` : ""}
        {current ? `, ${STATUS_TEXT[current.status]}` : ""}
      </span>

      {/* B. Dünner Fortschrittsbalken: immer sichtbar, läuft nie über, deterministisch aus percent. */}
      <div
        role="progressbar"
        aria-valuenow={safeIndex + 1}
        aria-valuemin={1}
        aria-valuemax={Math.max(stepCount, 1)}
        aria-valuetext={`Schritt ${safeIndex + 1} von ${stepCount}`}
        className="h-1 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* C. Segment-Pfad als Progressive Enhancement.
          - horizontal: nur ab genügend Breite (hidden md:flex) + flex-wrap + truncate → kein Überlauf.
          - vertical: immer, für schmale Seitenspalten (Marker links, Label rechts). */}
      <ol
        className={cn(
          "min-w-0",
          isVertical
            ? "flex flex-col gap-y-1"
            : "hidden flex-wrap items-center gap-x-2 gap-y-2 md:flex",
        )}
      >
        {steps.map((step, i) => {
          const active = i === safeIndex;
          const statusText = STATUS_TEXT[step.status];
          const marker = <StepMarker status={step.status} index={i} />;
          const label = (
            <span
              className={cn(
                "truncate text-sm",
                isVertical ? "min-w-0" : "max-w-[12ch]",
                LABEL_TONE[step.status],
              )}
            >
              {step.label}
            </span>
          );
          // sr-only-Status je Segment: Schrittnummer + Zustand textlich (nie nur über Farbe).
          const srStatus = (
            <span className="sr-only">
              Schritt {i + 1}: {step.label}, {statusText}
            </span>
          );

          const inner = interactive ? (
            <button
              type="button"
              onClick={() => onStepSelect!(i)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "fv-focus flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-left",
                isVertical && "w-full",
                "transition-colors duration-150 ease-out motion-reduce:transition-none",
                "hover:bg-muted/60",
              )}
            >
              {marker}
              {label}
              {srStatus}
            </button>
          ) : (
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2",
                isVertical && "w-full",
              )}
            >
              {marker}
              {label}
              {srStatus}
            </span>
          );

          return (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 items-center gap-2",
                isVertical && "w-full",
              )}
            >
              {inner}
              {/* Horizontaler Konnektor zwischen Segmenten (nur horizontal, nicht nach dem letzten). */}
              {!isVertical && i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="h-px w-4 shrink-0 bg-border"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
