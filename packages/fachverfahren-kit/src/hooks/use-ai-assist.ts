// fachverfahren-kit/hooks/use-ai-assist — Hook um den KiAssistPort (idle → laden → ergebnis/fehler).
//
// Kapselt den einmaligen Vorschlags-Abruf eines KiAssistPort in genau den EINEN Zustands-Vertrag aus
// use-view-state (kein ad-hoc isLoading). Die Komponente rendert aus `state.status` und zeigt den Vorschlag
// samt seiner fuenf Transparenzelemente an; die menschliche Entscheidung (HITL) bleibt Sache der UI.
// Rein clientseitig — kein Netz, kein Modell im Kit (der Port wird injiziert).
import * as React from "react";

import { useViewState, type ViewState } from "./use-view-state.js";
import type {
  KiAssistEingabe,
  KiAssistPort,
  KiAssistErgebnis,
} from "../lib/ai-assist.js";

export interface UseAiAssistOptions {
  /** Meldung waehrend des Abrufs (Standard generisch). */
  ladeMeldung?: string;
  /** Meldung nach erfolgreichem Vorschlag. */
  erfolgMeldung?: string;
  /** Meldung, wenn kein Port verbunden ist (deaktivierter Zustand). */
  keinPortMeldung?: string;
}

export interface UseAiAssistApi {
  /** Der vollstaendige Zustand (status/message/error) — 1:1 an StatusRegion koppelbar. */
  readonly state: ViewState<KiAssistErgebnis>;
  /** Der aktuelle Vorschlag, sobald geladen (sonst undefined). */
  readonly vorschlag: KiAssistErgebnis | undefined;
  /** True waehrend des Abrufs. */
  readonly laedt: boolean;
  /** Fordert einen Vorschlag zur Eingabe an (start → succeed/fail, klassifiziert). */
  anfragen: (eingabe: KiAssistEingabe) => Promise<void>;
  /** Setzt den Zustand zurueck auf idle (z. B. nach Annehmen/Verwerfen). */
  zuruecksetzen: () => void;
}

/**
 * Verwaltet den Lebenszyklus eines KiAssistPort-Abrufs.
 *
 * @example
 * const assist = useAiAssist(port);
 * <Button onClick={() => assist.anfragen({ text: feldwert })}>Vorschlag holen</Button>
 * {assist.vorschlag && <KiAssistPanel vorschlag={…} risikoklasse="begrenzt" />}
 */
export function useAiAssist(
  port: KiAssistPort | undefined,
  options: UseAiAssistOptions = {},
): UseAiAssistApi {
  const { ladeMeldung, erfolgMeldung, keinPortMeldung } = options;
  const view = useViewState<KiAssistErgebnis>();
  const { state, run, set } = view;

  const anfragen = React.useCallback(
    async (eingabe: KiAssistEingabe) => {
      if (!port) {
        set("error", {
          message: keinPortMeldung ?? "Kein KI-Assistent verbunden.",
        });
        return;
      }
      await run(() => port.schlageVor(eingabe), {
        loading: ladeMeldung ?? "KI-Vorschlag wird erstellt …",
        success: erfolgMeldung ?? "KI-Vorschlag verfügbar.",
      });
    },
    [port, run, set, ladeMeldung, erfolgMeldung, keinPortMeldung],
  );

  const zuruecksetzen = React.useCallback(() => set("idle"), [set]);

  return {
    state,
    vorschlag: state.status === "ready" ? state.data : undefined,
    laedt: state.status === "loading",
    anfragen,
    zuruecksetzen,
  };
}
