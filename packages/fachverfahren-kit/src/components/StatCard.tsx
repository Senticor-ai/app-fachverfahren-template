// fachverfahren-kit/components/StatCard — dep-freie KPI-Karte: Beschriftung + großer Wert + optionaler
// Delta/Trend mit semantischer Farbe + optionalem Icon. GENERISCH: alle Inhalte kommen ausschließlich als
// props (kein Domänen-Literal). Token-getrieben (Card-Stil, Status-Töne) — keine Hex/RGB-Literale, dep-frei
// (nur React + Tailwind + lucide). Barrierefrei (BITV/WCAG 2.2 AA): Trend nie allein über Farbe — Icon +
// Vorzeichen + screenreader-Text tragen die Bedeutung; Lucide-Icons aria-hidden.
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "../lib/utils.js";

/**
 * Bedeutung des Deltas (NICHT die Richtung): bestimmt die semantische Farbe.
 * `up` = positive Entwicklung (grün), `down` = negative (rot), `neutral` = ohne Wertung (gedämpft).
 * Entkoppelt von der Pfeil-Richtung, weil „mehr" je nach Kennzahl gut oder schlecht sein kann
 * (z.B. „mehr offene Vorgänge" ist schlecht).
 */
export type TrendTone = "up" | "down" | "neutral";

/** Pfeilrichtung des Deltas — rein visuell (zeigt Anstieg/Rückgang/unverändert), unabhängig von der Wertung. */
export type TrendDirection = "up" | "down" | "flat";

export interface StatCardTrend {
  /** Anzuzeigender Delta-Text, z.B. "+12 %", "−3", "0". Vollständig vom Aufrufer formatiert. */
  value: string;
  /** Wertung des Deltas → semantische Farbe. Default: "neutral". */
  tone?: TrendTone;
  /** Pfeilrichtung. Default: aus `tone` abgeleitet (up→hoch, down→runter, neutral→flach). */
  direction?: TrendDirection;
  /** Kontext/Bezug, z.B. "ggü. Vormonat". Wird gedämpft hinter dem Delta gezeigt. */
  label?: string;
  /** Vorgelesener Klartext für Screenreader (überschreibt die generierte aria-Beschreibung). */
  srLabel?: string;
}

export interface StatCardProps {
  /** Kurze Beschriftung der Kennzahl (Caption-Stil, oben). */
  label: string;
  /** Der große Hauptwert — bereits formatiert (Zahl, Betrag, Quote …). */
  value: React.ReactNode;
  /** Optionaler Delta/Trend mit semantischer Farbe. */
  trend?: StatCardTrend;
  /** Optionales Lucide-Icon (oder beliebiges React-Element), dekorativ rechts oben. */
  icon?: React.ReactNode;
  /** Optionaler erläuternder Zusatz unter dem Wert (Caption-Stil). */
  hint?: string;
  className?: string;
}

/** Farb-/Icon-Mapping je Trend-Wertung — ausschließlich über Status-Tokens (keine Ad-hoc-Farben). */
const TREND_TONE: Record<TrendTone, string> = {
  up: "text-status-ok",
  down: "text-status-block",
  neutral: "text-muted-foreground",
};

const DIRECTION_ICON: Record<TrendDirection, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

/** Default-Pfeilrichtung aus der Wertung, falls keine explizite `direction` gesetzt ist. */
const TONE_TO_DIRECTION: Record<TrendTone, TrendDirection> = {
  up: "up",
  down: "down",
  neutral: "flat",
};

/** Vorgelesener Klartext der Richtung — damit der Trend nicht allein über Farbe/Pfeil transportiert wird. */
const DIRECTION_SR: Record<TrendDirection, string> = {
  up: "Anstieg",
  down: "Rückgang",
  flat: "unverändert",
};

/**
 * Eine KPI-Karte. Rein präsentierend: Beschriftung + großer Wert, optional Trend/Icon/Hinweis.
 * Card-Stil (Border + dezenter Schatten), ruhig und seriös — keine verspielten Effekte.
 */
export const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ label, value, trend, icon, hint, className }, ref) => {
    const tone: TrendTone = trend?.tone ?? "neutral";
    const direction: TrendDirection = trend?.direction ?? TONE_TO_DIRECTION[tone];
    const TrendIcon = DIRECTION_ICON[direction];
    const srLabel =
      trend?.srLabel ??
      (trend ? `${DIRECTION_SR[direction]} ${trend.value}${trend.label ? `, ${trend.label}` : ""}` : "");

    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-2 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {icon != null && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground [&_svg]:h-4 [&_svg]:w-4"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
        </div>

        <p className="text-3xl font-semibold leading-none tabular-nums text-foreground">{value}</p>

        {trend && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className={cn("inline-flex items-center gap-1 font-medium", TREND_TONE[tone])}>
              <TrendIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="tabular-nums">{trend.value}</span>
            </span>
            {trend.label && <span className="text-xs text-muted-foreground">{trend.label}</span>}
            {srLabel && <span className="sr-only">{srLabel}</span>}
          </p>
        )}

        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  },
);
StatCard.displayName = "StatCard";
