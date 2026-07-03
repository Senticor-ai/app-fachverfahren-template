// fachverfahren-kit/components/VoiceInput — der barrierefreie, einwilligungs-gebundene Spracheingabe-Baustein.
//
// Mikrofon-Button + sichtbare Zustände (idle/hört/verarbeitet/fertig/fehler) IMMER mit Icon UND Text (nie nur Farbe),
// dezenter, reduced-motion-fester Aktivitäts-Indikator beim Hören, Consent-Gate + transparente Datenschutz-Anzeige aus
// port.datenschutz() (on-device / EU / Audio-Versand). Der erkannte Text wird NIE autonom übernommen — er geht als
// Vorschlag über onTranskript nach oben, wo der Mensch ihn (im Feld) bestätigt/bearbeitet.
//
// PORT-ONLY: kein Mikrofon-/SpeechRecognition-Zugriff im Kit (die Erfassung besitzt ein PROD-Adapter des VoicePort).
// Ohne Port ist der Baustein deaktiviert und weist darauf hin. DEP-FREI bis auf React + lucide + die Kit-Primitives.
//
// BARRIEREFREI (WCAG 2.2 AA / BITV 2.0 / EN 301 549 / EAA): echter Button (≥24px Zielgröße, aria-pressed spiegelt das
// Hören), Statuswechsel über die zentrale StatusRegion angesagt (assertiv nur bei Fehler). Der Live-Zwischentext ist
// bewusst KEINE aria-live-Region (hochfrequent) — stattdessen aria-busy während Hören/Verarbeiten + eine
// Abschluss-Ansage. Bedeutung nie allein über Farbe (immer Icon + Text). Token-Klassen → light/dark/HC automatisch.
import * as React from "react";
import {
  CheckCircle2,
  Info,
  Mic,
  ShieldAlert,
  ShieldCheck,
  Square,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { StatusRegion, type Politeness } from "./StatusRegion.js";
import { useVoiceInput, type VoiceStatus } from "../hooks/use-voice-input.js";
import type {
  VoiceDatenschutzProfil,
  VoicePort,
} from "../lib/voice-input.js";

export interface VoiceInputProps {
  /** Der Sprach-PORT (Stub-Default im Kit; PROD: on-device/EU-Transkription). Ohne Port ist der Baustein deaktiviert. */
  voicePort?: VoicePort;
  /** Übernahme des erkannten Endtranskripts nach oben — z. B. in ein Feld, das der Mensch anschließend bestätigt. */
  onTranskript: (text: string) => void;
  /** Beschriftung der Start-Aktion (generisch). Default „Spracheingabe starten". */
  label?: string;
  className?: string;
}

/** Ansage je Status (discrete Statuswechsel — nicht der hochfrequente Zwischentext). */
const STATUS_MELDUNG: Record<VoiceStatus, string> = {
  idle: "",
  hört: "Aufnahme läuft. Sprechen Sie jetzt.",
  verarbeitet: "Spracheingabe wird verarbeitet.",
  fertig: "Text erkannt. Bitte prüfen und übernehmen.",
  fehler: "Die Spracheingabe ist fehlgeschlagen.",
};

/**
 * Einwilligungs-gebundener Spracheingabe-Baustein. Vor der Einwilligung nur Aufklärung + Datenschutz-Anzeige +
 * Aktivierung; danach der Mikrofon-Button mit sichtbaren Zuständen. Kein Mikrofon-Zugriff im Kit — nur der PORT.
 */
export function VoiceInput({
  voicePort,
  onTranskript,
  label = "Spracheingabe starten",
  className,
}: VoiceInputProps): React.ReactElement {
  const voice = useVoiceInput(voicePort, { onFertig: onTranskript });
  const { status, transkript, consent, fehler } = voice;

  // Ohne Port: deaktiviert + Hinweis (Bedeutung via Icon + Text, nicht nur Optik).
  if (!voicePort) {
    return (
      <div
        role="group"
        aria-label="Spracheingabe"
        className={cn("rounded-md border border-border bg-card p-3", className)}
      >
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
          Spracheingabe ist nicht verfügbar.
        </p>
      </div>
    );
  }

  const profil = voicePort.datenschutz();
  const hört = status === "hört";
  const verarbeitet = status === "verarbeitet";
  const busy = hört || verarbeitet;
  const meldung = STATUS_MELDUNG[status];
  const politeness: Politeness = status === "fehler" ? "assertive" : "polite";

  const onMicClick = (): void => {
    if (hört) voice.stop();
    else voice.start();
  };

  return (
    <div
      role="group"
      aria-label="Spracheingabe"
      className={cn(
        "space-y-3 rounded-md border border-border bg-card p-3",
        className,
      )}
    >
      {!consent ? (
        // ── Consent-Gate: vor der Einwilligung nur Aufklärung + Datenschutz + Aktivierung ──
        <>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <Info
              className="mt-0.5 h-4 w-4 shrink-0 text-status-info"
              aria-hidden="true"
            />
            <span>
              Für die Spracheingabe wird Ihre Stimme in Text umgewandelt. Bitte
              stimmen Sie der Nutzung zu. Den erkannten Text können Sie vor der
              Übernahme prüfen und ändern.
            </span>
          </p>
          <DatenschutzAnzeige profil={profil} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={voice.erteileConsent}
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            Spracheingabe aktivieren
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={hört ? "destructive" : "default"}
              onClick={onMicClick}
              loading={verarbeitet}
              aria-pressed={hört}
              aria-label={hört ? "Aufnahme beenden" : label}
            >
              {!verarbeitet &&
                (hört ? (
                  <Square className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Mic className="h-4 w-4" aria-hidden="true" />
                ))}
              {verarbeitet
                ? "Wird verarbeitet …"
                : hört
                  ? "Aufnahme beenden"
                  : label}
            </Button>

            {/* Dezenter, reduced-motion-fester Aktivitäts-Indikator beim Hören — Bedeutung via Icon+Text, nie nur Farbe. */}
            {hört && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-info">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-status-info animate-pulse motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Aufnahme läuft
              </span>
            )}
          </div>

          {/* Live-/End-Transkript: KEIN aria-live (Zwischentext ist hochfrequent) — aria-busy während der Arbeit,
              die Abschluss-Ansage übernimmt die StatusRegion weiter unten. */}
          {(busy || transkript || status === "fertig") && (
            <div
              className="fv-enter rounded-sm border border-border bg-background p-2.5"
              aria-busy={busy || undefined}
            >
              <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {status === "fertig"
                  ? "Erkannter Text"
                  : "Erkannter Text (vorläufig)"}
              </span>
              <p className="text-sm break-words whitespace-pre-wrap text-foreground">
                {transkript || (busy ? "…" : "")}
              </p>
            </div>
          )}

          {status === "fertig" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-status-ok">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Text übergeben — bitte im Feld prüfen
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={voice.start}
              >
                <Mic className="h-4 w-4" aria-hidden="true" />
                Neu aufnehmen
              </Button>
            </div>
          )}

          {status === "fehler" && fehler && (
            // Visuelle Fehleranzeige für Sehende; die assertive Ansage übernimmt die StatusRegion (kein doppeltes alert).
            <p className="fv-text-error flex items-start gap-1.5">
              <ShieldAlert
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{fehler}</span>
            </p>
          )}

          <DatenschutzAnzeige profil={profil} />

          {/* EINE Ansage-Quelle für discrete Statuswechsel (assertiv nur bei Fehler). */}
          <StatusRegion message={meldung} politeness={politeness} busy={busy} />
        </>
      )}
    </div>
  );
}

// ── Transparente Datenschutz-Anzeige aus dem Port-Profil — mehrkanalig (Farbe + Icon + Text) ──
function DatenschutzAnzeige({
  profil,
}: {
  profil: VoiceDatenschutzProfil;
}): React.ReactElement {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <DatenschutzPunkt
        ok={profil.onDevice}
        okText="Verarbeitung auf dem Gerät"
        warnText="Verarbeitung auf einem Server"
      />
      <DatenschutzPunkt
        ok={profil.euResidenz}
        okText="EU-Datenresidenz"
        warnText="Datenresidenz außerhalb der EU möglich"
      />
      <DatenschutzPunkt
        ok={!profil.sendetAudio}
        okText="Kein Audio-Versand"
        warnText="Audio wird übertragen"
      />
    </ul>
  );
}

/** Ein Datenschutz-Punkt: Zustand über Farbe UND Icon UND Text (nie nur Farbe). */
function DatenschutzPunkt({
  ok,
  okText,
  warnText,
}: {
  ok: boolean;
  okText: string;
  warnText: string;
}): React.ReactElement {
  const Icon = ok ? ShieldCheck : ShieldAlert;
  return (
    <li
      className={cn(
        "inline-flex items-center gap-1.5",
        ok ? "text-status-ok" : "text-status-warn",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{ok ? okText : warnText}</span>
    </li>
  );
}
