// fachverfahren-kit/ui/skeleton — layout-treue Lade-Platzhalter (shadcn/ui-Stil, dep-frei).
//
// Skeletons werden ~20–30 % schneller empfunden als Spinner, weil sie das spätere Layout vorwegnehmen
// (kein Layout-Shift/CLS). Komponierte Varianten (Text/Liste/Tabelle/Karte) decken die häufigen Fälle ab.
// BARRIEREFREI: Skeletons sind rein dekorativ → aria-hidden + nicht fokussierbar; die Lade-ANSAGE
// übernimmt StatusRegion (aria-live), nicht das Skeleton selbst. reduced-motion deaktiviert den Puls.
import * as React from "react";

import { cn } from "../lib/utils.js";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export interface SkeletonTextProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Anzahl der Zeilen (Default 3). Die letzte Zeile ist kürzer (natürlicher Textfluss). */
  lines?: number;
}

/** Mehrzeiliger Text-Platzhalter (z. B. Beschreibung, Begründung). */
function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)} {...props}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export interface SkeletonTableProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  cols?: number;
}

/** Tabellen-Platzhalter (Kopfzeile + Datenzeilen) — für DataTable/Listen im Ladezustand. */
function SkeletonTable({ rows = 5, cols = 4, className, ...props }: SkeletonTableProps) {
  return (
    <div aria-hidden="true" className={cn("space-y-3", className)} {...props}>
      <div className="flex gap-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Karten-Platzhalter (Titel + Textblock) — für Detail-/Kachel-Ladezustände. */
function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden="true" className={cn("space-y-3 rounded-lg border border-border p-4", className)} {...props}>
      <Skeleton className="h-5 w-1/3" />
      <SkeletonText lines={3} />
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonTable, SkeletonCard };
