// fachverfahren-kit/hooks/use-assistent — Hook um den KiChatPort: Verlauf + gestreamte Antwort.
//
// Haelt den Nachrichten-Verlauf, schickt eine Nutzer-Frage an den KiChatPort und haengt die zurueckgestreamten
// Token an die letzte Assistenten-Nachricht an (Token-fuer-Token, wachsender Text). Der Zustand laeuft ueber
// den EINEN Vertrag aus use-view-state (idle → loading → success/error). Rein clientseitig — KEIN Netz, KEIN
// Modell im Kit; der Port wird injiziert (Stub-Default oder echtes Modell in PROD).
import * as React from "react";

import { useViewState, type ViewState } from "./use-view-state.js";
import type {
  KiChatAbschluss,
  KiChatNachricht,
  KiChatPort,
} from "../lib/ai-assist.js";

/** Eine Nachricht im UI-Verlauf: Chat-Nachricht + stabile id + Stream-/Abschluss-Zustand. */
export interface AssistentNachricht extends KiChatNachricht {
  /** Stabile id (fuer React-Keys + gezieltes Anhaengen der Token). */
  id: string;
  /** Laeuft der Token-Strom fuer diese (Assistenten-)Nachricht noch? */
  streamt?: boolean;
  /** Abschluss-Metadaten (Quelle + Art-50-Kennzeichnung), sobald der Strom endet. */
  abschluss?: KiChatAbschluss;
}

export interface UseAssistentOptions {
  /** Meldung waehrend die Antwort streamt. */
  ladeMeldung?: string;
  /** Meldung nach vollstaendiger Antwort. */
  erfolgMeldung?: string;
  /** Meldung, wenn kein Port verbunden ist. */
  keinPortMeldung?: string;
}

export interface UseAssistentApi {
  /** Der Nachrichten-Verlauf (Nutzer + Assistent, in Reihenfolge). */
  readonly nachrichten: readonly AssistentNachricht[];
  /** Zustand des laufenden/letzten Sende-Vorgangs — an StatusRegion koppelbar. */
  readonly state: ViewState<void>;
  /** True, solange eine Antwort streamt. */
  readonly laedt: boolean;
  /** Schickt `text` als Nutzer-Nachricht und streamt die Antwort in die letzte Assistenten-Nachricht. */
  senden: (text: string) => Promise<void>;
  /** Leert den Verlauf und setzt den Zustand auf idle. */
  zuruecksetzen: () => void;
}

/**
 * Verwaltet Verlauf + gestreamte Antwort eines KiChatPort. Konsumiert den `AsyncIterable<string>` des Ports
 * und haengt jedes Token an die letzte Assistenten-Nachricht; die Abschluss-Metadaten (Quelle/Kennzeichnung)
 * landen nach dem letzten Token an derselben Nachricht.
 *
 * @example
 * const chat = useAssistent(chatPort);
 * <StreamingText text={n.text} streaming={n.streamt} /> // je Assistenten-Nachricht
 */
export function useAssistent(
  port: KiChatPort | undefined,
  options: UseAssistentOptions = {},
): UseAssistentApi {
  const { ladeMeldung, erfolgMeldung, keinPortMeldung } = options;
  const [nachrichten, setNachrichten] = React.useState<AssistentNachricht[]>(
    [],
  );
  const view = useViewState<void>();
  const { state, start, complete, fail, set } = view;

  // Monotone id-Quelle (kein Date.now/Math.random → deterministisch, SSR-sicher) + Concurrency-Guard.
  const idRef = React.useRef(0);
  const laueftRef = React.useRef(false);
  const naechsteId = React.useCallback(() => `msg-${++idRef.current}`, []);

  const senden = React.useCallback(
    async (text: string) => {
      const inhalt = text.trim();
      if (!inhalt || laueftRef.current) return;
      if (!port) {
        set("error", {
          message: keinPortMeldung ?? "Kein Assistent verbunden.",
        });
        return;
      }
      laueftRef.current = true;

      // Verlauf fuer den Port aus dem committeten Zustand ableiten (ohne den gleich angehaengten Platzhalter).
      const verlauf: KiChatNachricht[] = [
        ...nachrichten.map((n) => ({ rolle: n.rolle, text: n.text })),
        { rolle: "nutzer", text: inhalt },
      ];

      const nutzerId = naechsteId();
      const assistentId = naechsteId();
      setNachrichten((prev) => [
        ...prev,
        { id: nutzerId, rolle: "nutzer", text: inhalt },
        { id: assistentId, rolle: "assistent", text: "", streamt: true },
      ]);
      start(ladeMeldung ?? "Assistent antwortet …");

      try {
        const strom = port.sende(verlauf);
        let res = await strom.next();
        while (!res.done) {
          const token = res.value;
          setNachrichten((prev) =>
            prev.map((n) =>
              n.id === assistentId ? { ...n, text: n.text + token } : n,
            ),
          );
          res = await strom.next();
        }
        const abschluss = res.value;
        setNachrichten((prev) =>
          prev.map((n) =>
            n.id === assistentId ? { ...n, streamt: false, abschluss } : n,
          ),
        );
        complete(undefined, erfolgMeldung ?? "Antwort vollständig.");
      } catch (error) {
        setNachrichten((prev) =>
          prev.map((n) =>
            n.id === assistentId ? { ...n, streamt: false } : n,
          ),
        );
        fail(error);
      } finally {
        laueftRef.current = false;
      }
    },
    [
      port,
      nachrichten,
      naechsteId,
      start,
      complete,
      fail,
      set,
      ladeMeldung,
      erfolgMeldung,
      keinPortMeldung,
    ],
  );

  const zuruecksetzen = React.useCallback(() => {
    setNachrichten([]);
    set("idle");
  }, [set]);

  return {
    nachrichten,
    state,
    laedt: state.status === "loading",
    senden,
    zuruecksetzen,
  };
}
