// fachverfahren-kit/hooks/use-voice-input — die Zustandsmaschine der Spracheingabe (Consent-gated, Port-only).
//
// idle → hört → verarbeitet → fertig | fehler. CONSENT-GATE: start() ist ein No-Op, solange keine Einwilligung
// erteilt wurde (erteileConsent()) — und ebenso ohne Port. Der Hook erfasst KEIN Audio (kein Mikrofon-/
// SpeechRecognition-Zugriff im Kit); er orchestriert NUR den injizierten VoicePort: `hoere()` (optional) liefert
// Live-Zwischentext ausschließlich zur ANZEIGE, `transkribiere()` liefert beim Stoppen das authoritative Endergebnis.
// So bleibt genau EINE Finalisierungs-Quelle (deterministische „verarbeitet"-Phase), unabhängig vom Live-Strom.
// DEP-FREI: nur React.
import * as React from "react";

import type { VoiceAudioEingabe, VoicePort } from "../lib/voice-input.js";

/** Der Zustandsraum der Spracheingabe. */
export type VoiceStatus = "idle" | "hört" | "verarbeitet" | "fertig" | "fehler";

export interface UseVoiceInputOptions {
  /** Wird EINMAL mit dem authoritativen Endtext gerufen, sobald der Status auf „fertig" wechselt. */
  onFertig?: (text: string) => void;
}

export interface VoiceInputApi {
  readonly status: VoiceStatus;
  /** Der aktuell erkannte Text — Live-Zwischentext während „hört", authoritativ ab „fertig". */
  readonly transkript: string;
  /** True, sobald die Einwilligung erteilt wurde (Voraussetzung für start()). */
  readonly consent: boolean;
  /** Menschenlesbare Fehlermeldung oder null. */
  readonly fehler: string | null;
  /** Erteilt die Einwilligung — schaltet start() frei. */
  erteileConsent: () => void;
  /** Startet das Zuhören. No-Op ohne Einwilligung oder ohne Port oder wenn bereits am Hören. */
  start: () => void;
  /** Beendet das Zuhören und finalisiert über transkribiere() → fertig | fehler. */
  stop: () => void;
  /** Setzt die Maschine auf idle zurück (Text/Fehler leeren, laufende Auflösungen verwerfen). */
  reset: () => void;
}

/**
 * Zustandsmaschine der einwilligungs-gebundenen Spracheingabe.
 *
 * @example
 * const voice = useVoiceInput(voicePort, { onFertig: (text) => setFeld("bemerkung", text) });
 * // <Button onClick={voice.status === "hört" ? voice.stop : voice.start} disabled={!voice.consent} />
 */
export function useVoiceInput(
  port: VoicePort | undefined,
  options: UseVoiceInputOptions = {},
): VoiceInputApi {
  const { onFertig } = options;

  const [status, setStatus] = React.useState<VoiceStatus>("idle");
  const [transkript, setTranskript] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [fehler, setFehler] = React.useState<string | null>(null);

  // Lauf-Sequenz + Aktiv-Flag: schützen vor veralteten Auflösungen und vor Zwischentext NACH dem Stoppen/Reset.
  const laufRef = React.useRef(0);
  const hoertRef = React.useRef(false);
  const startZeitRef = React.useRef(0);

  const erteileConsent = React.useCallback(() => setConsent(true), []);

  const start = React.useCallback(() => {
    // CONSENT-GATE: ohne Einwilligung (oder ohne Port) passiert nichts.
    if (!consent || !port) return;
    // Bereits am Hören? Kein Neustart.
    if (hoertRef.current) return;

    const lauf = ++laufRef.current;
    hoertRef.current = true;
    startZeitRef.current = Date.now();
    setFehler(null);
    setTranskript("");
    setStatus("hört");

    // Live-Zwischentext NUR zur Anzeige (best effort) — bestimmt NICHT das Endergebnis. Ein Strom-Fehler
    // ändert den Zustand nicht; das authoritative Ergebnis liefert stop() über transkribiere().
    const strom = port.hoere?.();
    if (strom) {
      void (async () => {
        try {
          for await (const teil of strom) {
            if (lauf !== laufRef.current || !hoertRef.current) break;
            setTranskript(teil.text);
          }
        } catch {
          // Zwischentext ist unkritisch — bewusst geschluckt.
        }
      })();
    }
  }, [consent, port]);

  const stop = React.useCallback(() => {
    if (!port || !hoertRef.current) return;
    hoertRef.current = false;
    const lauf = laufRef.current;
    const audio: VoiceAudioEingabe = {
      dauerMs: Math.max(0, Date.now() - startZeitRef.current),
    };
    setStatus("verarbeitet");

    void (async () => {
      try {
        const res = await port.transkribiere(audio);
        if (lauf !== laufRef.current) return; // ein neuer Lauf/Reset hat übernommen
        setTranskript(res.text);
        setStatus("fertig");
        onFertig?.(res.text);
      } catch {
        if (lauf !== laufRef.current) return;
        setStatus("fehler");
        setFehler(
          "Die Spracheingabe konnte nicht verarbeitet werden. Bitte erneut versuchen oder den Text von Hand eingeben.",
        );
      }
    })();
  }, [port, onFertig]);

  const reset = React.useCallback(() => {
    laufRef.current++; // invalidiert laufende Auflösungen/Ströme
    hoertRef.current = false;
    setStatus("idle");
    setTranskript("");
    setFehler(null);
  }, []);

  return {
    status,
    transkript,
    consent,
    fehler,
    erteileConsent,
    start,
    stop,
    reset,
  };
}
