// fachverfahren-kit/components/StatusRegion — die EINE Ansage-Quelle (aria-live) der App.
//
// Verstreute `role="alert"`/`aria-live`-Texte je Widget driften und übertönen sich. StatusRegion
// zentralisiert dynamische Meldungen: ein höfliches (polite) und ein dringendes (assertive) Live-Region-
// Paar, persistent im DOM. Jede Komponente sagt über `useStatusRegion().announce()` an — EINE Wahrheit.
//
// GENERISCH + DEP-FREI (nur React + cn). BARRIEREFREI: zwei persistente Regionen (zuverlässiger als
// dynamisches Umschalten von aria-live), aria-atomic, sr-only Standard. Re-Ansage identischer Texte
// erzwungen durch Clear-then-Set.
import * as React from "react";

import { cn } from "../lib/utils.js";

export type Politeness = "polite" | "assertive";

// ── 1. Zentraler Provider + Hook (die EINE Ansage-Quelle) ───────────────────────────────────────

interface Announcer {
  /** Sagt eine Meldung an. assertive unterbricht (Fehler/Konflikt), polite reiht ein (Standard). */
  announce: (message: string, politeness?: Politeness) => void;
}

const StatusRegionContext = React.createContext<Announcer | null>(null);

/**
 * Greift auf die zentrale Ansage zu. Ohne Provider ein No-Op (Komponenten bleiben lauffähig,
 * z. B. in Stories/Tests) — nutze dann die Standalone-<StatusRegion message=… />.
 */
export function useStatusRegion(): Announcer {
  const ctx = React.useContext(StatusRegionContext);
  return ctx ?? NOOP_ANNOUNCER;
}

const NOOP_ANNOUNCER: Announcer = { announce: () => undefined };

export interface StatusRegionProviderProps {
  children: React.ReactNode;
}

/**
 * Hängt das persistente Live-Region-Paar an den App-Rand und stellt `announce` per Context bereit.
 * Genau EINMAL nahe der App-Wurzel rendern (innerhalb FachverfahrenShell).
 */
export function StatusRegionProvider({ children }: StatusRegionProviderProps) {
  const [polite, setPolite] = React.useState("");
  const [assertive, setAssertive] = React.useState("");
  const timers = React.useRef<number[]>([]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const announce = React.useCallback(
    (message: string, politeness: Politeness = "polite") => {
      const setter = politeness === "assertive" ? setAssertive : setPolite;
      // Clear-then-Set erzwingt die Wiederholung identischer Texte (Screenreader feuern sonst nicht).
      setter("");
      const t = window.setTimeout(() => setter(message), 60);
      timers.current.push(t);
    },
    [],
  );

  const value = React.useMemo<Announcer>(() => ({ announce }), [announce]);

  return (
    <StatusRegionContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
      >
        {polite}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
      >
        {assertive}
      </div>
    </StatusRegionContext.Provider>
  );
}

// ── 2. Standalone-Region (kontrolliert, für lokale ViewState-Meldungen) ──────────────────────────

export interface StatusRegionProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "role"
> {
  /** Anzusagender Text (leer/undefined = nichts angesagt). */
  message?: string | undefined;
  /** polite (Standard) oder assertive für Fehler/Konflikt. */
  politeness?: Politeness;
  /** Markiert einen laufenden Vorgang (aria-busy). */
  busy?: boolean;
  /** Sichtbar rendern statt nur für Screenreader (Standard: sr-only). */
  visible?: boolean;
}

/**
 * Kontrollierte Live-Region für genau eine Meldung — koppelt direkt an `useViewState().state.message`.
 *
 * @example
 * <StatusRegion message={view.state.message} politeness={announcePoliteness(view.state.status)} busy={view.state.status === "loading"} />
 */
export const StatusRegion = React.forwardRef<HTMLDivElement, StatusRegionProps>(
  (
    {
      message,
      politeness = "polite",
      busy = false,
      visible = false,
      className,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      role={politeness === "assertive" ? "alert" : "status"}
      aria-live={politeness}
      aria-atomic="true"
      aria-busy={busy || undefined}
      className={cn(
        visible ? "text-sm text-muted-foreground" : "sr-only",
        className,
      )}
      {...props}
    >
      {message}
    </div>
  ),
);
StatusRegion.displayName = "StatusRegion";
