// fachverfahren-kit/hooks/use-view-state — der EINE Zustands-Vertrag für async/zustandsbehaftete UI.
//
// Ersetzt verstreute ad-hoc `isLoading`/`hasError`-Flags durch eine getypte Maschine. Jede
// zustandsbehaftete Komponente leitet ihre Darstellung aus genau diesem Vertrag ab — kein stiller
// Wechsel, jede Transition trägt eine menschenlesbare Meldung (für StatusRegion, aria-live).
//
// GENERISCH: keine Domänen-Literale. Erweiterte Zustände decken die realen Behörden-Fälle ab
// (offline, 403/forbidden, Session abgelaufen, Teilerfolg, Konflikt/409, schreibgeschützt/bestandskräftig).
// DEP-FREI: nur React.
import * as React from "react";

/** Der vollständige Zustandsraum — Basis (5) + die realen Erweiterungen aus dem Behörden-Alltag. */
export type ViewStatus =
  | "idle"
  | "loading"
  | "empty"
  | "ready"
  | "success"
  | "error"
  | "offline"
  | "forbidden"
  | "sessionExpired"
  | "partialSuccess"
  | "conflict"
  | "readOnly";

/** Ein Zustand: Status + optionale Daten/Fehler + menschenlesbare Meldung (für die Ansage). */
export interface ViewState<T = unknown, E = unknown> {
  readonly status: ViewStatus;
  readonly data?: T | undefined;
  readonly error?: E | undefined;
  /** Kurze, menschenlesbare Meldung — wird von StatusRegion angesagt (aria-live). */
  readonly message?: string | undefined;
}

/** Höflichkeit der Ansage je Status: Fehler/Konflikt assertiv, der Rest höflich. */
export function announcePoliteness(status: ViewStatus): "polite" | "assertive" {
  return status === "error" || status === "conflict" || status === "forbidden" || status === "sessionExpired"
    ? "assertive"
    : "polite";
}

/** Klassifiziert einen Fehler in einen Zustand (HTTP-nah, aber transport-agnostisch). */
export function classifyError(err: unknown): Extract<ViewStatus, "forbidden" | "sessionExpired" | "conflict" | "offline" | "error"> {
  const status = typeof err === "object" && err !== null ? (err as { status?: number; code?: string }).status : undefined;
  const code = typeof err === "object" && err !== null ? (err as { code?: string }).code : undefined;
  if (status === 401 || code === "session_expired") return "sessionExpired";
  if (status === 403 || code === "forbidden") return "forbidden";
  if (status === 409 || code === "conflict") return "conflict";
  if (code === "offline" || (typeof navigator !== "undefined" && navigator.onLine === false)) return "offline";
  return "error";
}

/** Standard-Meldungen (DE-Default; Komponenten dürfen via opts.messages überschreiben — i18n/Leichte Sprache). */
export const DEFAULT_VIEW_MESSAGES: Partial<Record<ViewStatus, string>> = {
  loading: "Wird geladen …",
  empty: "Keine Einträge vorhanden.",
  ready: "Geladen.",
  success: "Erfolgreich abgeschlossen.",
  error: "Es ist ein Fehler aufgetreten.",
  offline: "Keine Verbindung. Bitte später erneut versuchen.",
  forbidden: "Keine Berechtigung für diese Ansicht.",
  sessionExpired: "Ihre Sitzung ist abgelaufen. Bitte erneut anmelden.",
  partialSuccess: "Teilweise abgeschlossen — einige Einträge benötigen Nacharbeit.",
  conflict: "Die Daten wurden zwischenzeitlich geändert. Bitte neu laden.",
  readOnly: "Dieser Vorgang ist abgeschlossen und schreibgeschützt.",
};

export interface UseViewStateOptions<T> {
  /** Startzustand (Default: idle). */
  initial?: ViewStatus;
  /** Entscheidet, ob geladene Daten als „leer" gelten → empty statt ready. */
  isEmpty?: (data: T) => boolean;
  /** Meldungs-Overrides (i18n / Leichte Sprache). */
  messages?: Partial<Record<ViewStatus, string>>;
}

export interface ViewStateApi<T, E> {
  readonly state: ViewState<T, E>;
  /** In den Ladezustand wechseln (z. B. vor einem fetch oder Retry). */
  start: (message?: string) => void;
  /** Erfolgreich geladene Daten setzen — wird zu empty/ready je nach isEmpty. */
  succeed: (data: T, message?: string) => void;
  /** Abschluss einer bindenden Aktion (success), optional mit Daten. */
  complete: (data?: T, message?: string) => void;
  /** Fehler setzen — Status wird automatisch klassifiziert (403/401/409/offline/error). */
  fail: (error: E, message?: string) => void;
  /** Expliziten Status setzen (z. B. partialSuccess, readOnly, conflict). */
  set: (status: ViewStatus, patch?: Partial<ViewState<T, E>>) => void;
  /** Bequemer Promise-Wrapper: start → succeed | fail (mit Klassifizierung). */
  run: (task: () => Promise<T>, messages?: { loading?: string; success?: string }) => Promise<void>;
}

/**
 * Verwaltet einen ViewState getypt und liefert die kanonischen Übergänge. Komponenten rendern
 * NUR aus `state.status`; die Meldung geht 1:1 an StatusRegion.
 *
 * @example
 * const view = useViewState<Vorgang[]>({ isEmpty: (v) => v.length === 0 });
 * useEffect(() => { view.run(() => port.list()); }, []);
 * // <StatusRegion message={view.state.message} politeness={announcePoliteness(view.state.status)} />
 */
export function useViewState<T = unknown, E = unknown>(opts: UseViewStateOptions<T> = {}): ViewStateApi<T, E> {
  const { initial = "idle", isEmpty, messages } = opts;
  const msg = React.useMemo(() => ({ ...DEFAULT_VIEW_MESSAGES, ...messages }), [messages]);
  const [state, setState] = React.useState<ViewState<T, E>>({ status: initial, message: msg[initial] });

  const start = React.useCallback(
    (message?: string) => setState({ status: "loading", message: message ?? msg.loading }),
    [msg],
  );
  const succeed = React.useCallback(
    (data: T, message?: string) => {
      const empty = isEmpty?.(data) ?? false;
      setState({ status: empty ? "empty" : "ready", data, message: message ?? (empty ? msg.empty : msg.ready) });
    },
    [isEmpty, msg],
  );
  const complete = React.useCallback(
    (data?: T, message?: string) => setState((s) => ({ status: "success", data: data ?? s.data, message: message ?? msg.success })),
    [msg],
  );
  const fail = React.useCallback(
    (error: E, message?: string) => {
      const status = classifyError(error);
      setState({ status, error, message: message ?? msg[status] });
    },
    [msg],
  );
  const set = React.useCallback(
    (status: ViewStatus, patch?: Partial<ViewState<T, E>>) =>
      setState((s) => ({ ...s, status, message: patch?.message ?? msg[status] ?? s.message, ...patch })),
    [msg],
  );
  const run = React.useCallback(
    async (task: () => Promise<T>, runMessages?: { loading?: string; success?: string }) => {
      start(runMessages?.loading);
      try {
        const data = await task();
        succeed(data, runMessages?.success);
      } catch (error) {
        fail(error as E);
      }
    },
    [start, succeed, fail],
  );

  return { state, start, succeed, complete, fail, set, run };
}
