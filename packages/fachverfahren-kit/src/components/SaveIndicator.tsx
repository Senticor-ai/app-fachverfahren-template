// fachverfahren-kit/components/SaveIndicator — Autosave-/Entwurf-Status (shadcn/ui-Stil, dep-frei).
//
// Macht den Speicher-Zustand sichtbar (speichert / gespeichert vor X / Fehler+Retry). Speist die
// zentrale Ansage (höflich), damit Screenreader den Entwurf-Status erfahren. Ein passiver „Jetzt
// speichern"-Button bleibt für Nutzer ohne Autosave-Vertrauen sichtbar (optional via onSaveNow).
//
// GENERISCH + DEP-FREI: React + lucide + cn + Intl.RelativeTimeFormat (kein date-fns nötig).
// BARRIEREFREI: <time datetime>, role="status" aria-live="polite", Fehler mit echtem Retry-<button>.
import * as React from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface SaveIndicatorProps {
  status: SaveStatus;
  /** Zeitpunkt des letzten Speicherns (ISO-String oder Date) — für „gespeichert vor X". */
  savedAt?: string | Date;
  /** Retry-Handler im Fehlerfall (Pflicht-Recovery). */
  onRetry?: () => void;
  /** Optionaler „Jetzt speichern"-Button (für Nutzer ohne Autosave-Vertrauen). */
  onSaveNow?: () => void;
  className?: string;
}

const RTF = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("de", { numeric: "auto" }) : null;

/** „vor X" dep-frei über Intl.RelativeTimeFormat (Sekunden→Minuten→Stunden→Tage). */
function relativeDe(from: Date): string {
  if (!RTF) return "";
  const diffMs = from.getTime() - Date.now();
  const sec = Math.round(diffMs / 1000);
  const abs = Math.abs(sec);
  if (abs < 60) return RTF.format(sec, "second");
  if (abs < 3600) return RTF.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return RTF.format(Math.round(sec / 3600), "hour");
  return RTF.format(Math.round(sec / 86400), "day");
}

export function SaveIndicator({ status, savedAt, onRetry, onSaveNow, className }: SaveIndicatorProps) {
  const saved = savedAt != null ? (typeof savedAt === "string" ? new Date(savedAt) : savedAt) : null;
  // Periodisch neu rendern, damit „vor X" mitläuft (nur im saved-Zustand).
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (status !== "saved" || !saved) return;
    const t = window.setInterval(force, 30_000);
    return () => clearInterval(t);
  }, [status, saved]);

  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      {status === "saving" && (
        <>
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          <span>Speichert …</span>
        </>
      )}
      {status === "saved" && saved && (
        <>
          <Check aria-hidden="true" className="size-4 text-status-ok" />
          <span>
            Gespeichert <time dateTime={saved.toISOString()}>{relativeDe(saved)}</time>
          </span>
        </>
      )}
      {status === "error" && (
        <>
          <TriangleAlert aria-hidden="true" className="size-4 text-status-block" />
          <span className="text-status-block">Nicht gespeichert.</span>
          {onRetry != null && (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Erneut speichern
            </Button>
          )}
        </>
      )}
      {status === "idle" && onSaveNow != null && (
        <Button type="button" size="sm" variant="ghost" onClick={onSaveNow}>
          Jetzt speichern
        </Button>
      )}
    </div>
  );
}
