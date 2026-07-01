// fachverfahren-kit/components/Timeline — das GENERISCHE, rein präsentierende Zeitstrahl-Primitiv.
//
// EINE Wahrheit für vertikale Zeitverläufe: ein durchgehender Strahl, je Eintrag ein Marker (Ton/Icon), ein
// optionaler <time>-Slot, Titel und Beschreibung. Zustände `done | current | upcoming` steuern Marker-Optik UND
// eine textliche Ansage (`sr-only`) — Information wird NIE nur über Farbe getragen (WCAG 2.2 AA / BITV 2.0).
//
// Bewusst DATEN-getrieben und domänen-/vendor-neutral: KEINE Fach-Literale, KEIN Sortieren, KEIN Formatieren. Das
// Primitiv rendert exakt die übergebenen `items` in Reihenfolge. Zeit-Formatierung, Filter, Sortierung und
// Verlaufslogik gehören in die konsumierenden Schichten (StatusVerfolgung = Bürger-Fortschritt, AuditTimeline =
// append-only Historie), damit es genau EINE Zeitverlauf-Optik statt zweier duplizierter Timelines gibt.
//
// Barrierefrei: semantische <ol>/<li>-Liste, <time> mit maschinenlesbarem dateTime, Marker `aria-hidden`, je Eintrag
// eine `sr-only`-Statusansage, `aria-current="step"` am aktuellen Eintrag, `prefers-reduced-motion` respektiert.
import {
  forwardRef,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from "react";
import { AlertTriangle, Check, Clock, Info, XCircle } from "lucide-react";

import { cn } from "../lib/utils.js";

/** Ton eines Eintrags — rein visuelle Verstärkung, immer zusätzlich textlich getragen. */
export type TimelineTone = "ok" | "warn" | "block" | "info" | "muted";

/** Fortschritts-Zustand eines Eintrags entlang des Strahls. */
export type TimelineState = "done" | "current" | "upcoming";

/** Ein einzelner Eintrag des Zeitstrahls — rein Daten, keine Logik. */
export interface TimelineItem {
  /** Stabiler Schlüssel für die Liste. */
  id: string;
  /** Überschrift/Aktion des Eintrags. */
  title: ReactNode;
  /**
   * Zeitpunkt des Eintrags. Ein `Date` wird maschinenlesbar (ISO) ins `dateTime`-Attribut geschrieben und
   * lokalisiert angezeigt; ein bereits formatierter String wird unverändert übernommen (dateTime = Rohwert).
   */
  time?: string | Date;
  /** Optionales Detail unter dem Titel. */
  description?: ReactNode;
  /** Ton (Marker-/Icon-Färbung). Ohne Angabe neutral („muted"). */
  tone?: TimelineTone;
  /** Eigenes Icon; überschreibt das Ton-Default-Icon im Marker. */
  icon?: ReactNode;
  /** Fortschritts-Zustand. Ohne Angabe „upcoming". */
  state?: TimelineState;
}

export interface TimelineProps {
  /** Die anzuzeigenden Einträge, bereits in der gewünschten Reihenfolge (das Primitiv sortiert nicht). */
  items: TimelineItem[];
  /** Zugängliche Bezeichnung der Liste (empfohlen). */
  "aria-label"?: string;
  /** Verweis auf eine sichtbare Überschrift, alternativ zu `aria-label`. */
  "aria-labelledby"?: string;
  className?: string;
}

// ── Ton → Default-Icon (generisch, kein status-spezifisches Mapping) ────────────────────────────
const TONE_ICON: Record<TimelineTone, ComponentType<{ className?: string }>> = {
  ok: Check,
  warn: AlertTriangle,
  block: XCircle,
  info: Info,
  muted: Clock,
};

// ── Ton → Marker-Färbung (token-only, identisch zum Muster der Bestands-Komponenten) ────────────
const TONE_MARKER: Record<TimelineTone, string> = {
  ok: "border-status-ok/50 bg-status-ok-soft text-status-ok",
  warn: "border-status-warn/50 bg-status-warn-soft text-status-warn",
  block: "border-status-block/50 bg-status-block-soft text-status-block",
  info: "border-status-info/50 bg-status-info-soft text-status-info",
  muted: "border-border bg-secondary text-muted-foreground",
};

// ── Zustand → textliche Ansage (Information nie nur über Farbe) ─────────────────────────────────
const STATE_TEXT: Record<TimelineState, string> = {
  done: "abgeschlossen",
  current: "aktuell",
  upcoming: "ausstehend",
};

/** Maschinenlesbarer `dateTime`-Wert: ISO bei `Date`, sonst der Rohstring. */
function timeMachine(time: string | Date): string {
  return time instanceof Date ? time.toISOString() : time;
}

/** Sichtbarer Zeittext: lokalisiert bei `Date`, sonst der bereits formatierte Rohstring (unverändert). */
function timeText(time: string | Date): string {
  if (!(time instanceof Date)) return time;
  return time.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Rein präsentierendes vertikales Zeitstrahl-Primitiv.
 *
 * Rendert `items` als semantische <ol>. Der aktuelle Eintrag erhält `aria-current="step"`; jeder Eintrag trägt
 * seinen Zustand zusätzlich als `sr-only`-Text, sodass Screenreader-Nutzende den Fortschritt ohne Farbe erfassen.
 * Marker sind `aria-hidden` (dekorativ); die Bedeutung steckt in Titel + Zeit + Statusansage.
 */
export const Timeline = forwardRef<HTMLOListElement, TimelineProps>(
  function Timeline({ items, className, ...aria }, ref): ReactElement {
    const ariaLabel = aria["aria-label"];
    const ariaLabelledby = aria["aria-labelledby"];

    return (
      <ol
        ref={ref}
        aria-label={ariaLabelledby ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={cn("relative ms-2 border-s border-border ps-6", className)}
      >
        {items.map((item, i) => {
          const tone: TimelineTone = item.tone ?? "muted";
          const state: TimelineState = item.state ?? "upcoming";
          const isCurrent = state === "current";
          const isLast = i === items.length - 1;
          const DefaultIcon = TONE_ICON[tone];

          return (
            <li
              key={item.id}
              aria-current={isCurrent ? "step" : undefined}
              className={cn("relative ps-1 pb-6", isLast && "pb-0")}
            >
              {/* Marker am Zeitstrahl — dekorativ; Bedeutung liegt in Text + Statusansage. */}
              <span
                aria-hidden="true"
                className={cn(
                  "absolute -start-[2.1875rem] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background",
                  "transition-colors duration-150 ease-out motion-reduce:transition-none",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border",
                    TONE_MARKER[tone],
                    // Aktueller Eintrag: dezenter Ring in der Ton-Farbe (zusätzliches, nicht-farbliches Signal via aria-current + sr-only).
                    isCurrent &&
                      "ring-2 ring-offset-2 ring-offset-background ring-current",
                  )}
                >
                  {item.icon ?? <DefaultIcon className="h-3.5 w-3.5" />}
                </span>
              </span>

              <div className="flex min-w-0 flex-col gap-1">
                {item.time !== undefined && (
                  <time
                    dateTime={timeMachine(item.time)}
                    className="text-xs tabular-nums text-muted-foreground"
                  >
                    {timeText(item.time)}
                  </time>
                )}
                <div className="text-sm font-medium text-foreground">
                  {/* Textliche Statusansage — trägt den Zustand ohne Farbe (WCAG 2.2 / BITV). */}
                  <span className="sr-only">{STATE_TEXT[state]}: </span>
                  {item.title}
                </div>
                {item.description !== undefined && (
                  <div className="text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    );
  },
);
