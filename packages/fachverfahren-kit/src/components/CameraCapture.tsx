// fachverfahren-kit/components/CameraCapture — die GENERISCHE Webcam-Aufnahme (z.B. Personalverwaltung / Passbild).
//
// Zweck: über die Geräte-Kamera ein Foto aufnehmen — Live-Vorschau (getUserMedia), Auslösen (Standbild auf
// Canvas), Wiederholen, Übernehmen → liefert das Bild als Blob UND DataURL. GENERISCH: keine Domänen-Literale,
// alle Beschriftungen/Constraints kommen als props. DEP-FREI: rein über die nativen Web-APIs
// MediaDevices.getUserMedia / <video> / <canvas 2D> — KEINE Bibliothek.
//
// ROBUST: deckt fehlende Kamera (NotFoundError), verweigerte Erlaubnis (NotAllowedError), belegte Kamera
// (NotReadableError) und nicht unterstützte Browser (kein navigator.mediaDevices) mit klaren, handlungsleitenden
// Fallback-Hinweisen ab. BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): alle Bedien-Elemente sind echte, per Tastatur
// bedienbare Buttons mit aria-label, Status/Hinweise in aria-live-Regionen, Fehler role="alert", Fokus-Ring
// sichtbar, Ziele >=24px, Animationen respektieren prefers-reduced-motion, Farbe nie alleiniger Bedeutungsträger.
import * as React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  Camera,
  CameraOff,
  Check,
  RefreshCcw,
  ShieldQuestion,
  Upload,
  Video,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { ErrorState } from "./ErrorState.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Das fertige Aufnahme-Ergebnis (beide Repräsentationen, damit der Aufrufer frei wählen kann). */
export interface CaptureResult {
  /** Das aufgenommene Foto als Blob (z.B. für FormData-Upload). `null`, falls der Browser keinen liefert. */
  blob: Blob | null;
  /** Dasselbe Foto als DataURL (z.B. für eine Sofort-Vorschau). */
  dataURL: string;
  /** Pixel-Größe des Fotos. */
  breite: number;
  hoehe: number;
}

/** Grund eines Fehlschlags — für gezielte, handlungsleitende Hinweistexte. */
type KameraFehler =
  "nicht-unterstuetzt" | "verweigert" | "keine-kamera" | "belegt" | "unbekannt";

export interface CameraCaptureProps {
  /** Gewünschte Auflösung als [breite, hoehe]. Default [720, 720]. Wird als „ideal" an getUserMedia gereicht. */
  resolution?: readonly [number, number];
  /** Kamera-Ausrichtung: "user" (Frontkamera, Default) oder "environment" (Rückkamera). */
  facingMode?: "user" | "environment";
  /** MIME-Typ der Ausgabe. Default "image/jpeg". */
  outputMime?: string;
  /** Qualität für verlustbehaftete Formate (0..1). Default 0.92. */
  outputQuality?: number;
  /** Seitenverhältnis-Rahmen der Vorschau als [breite, hoehe]. Default [1, 1]. */
  aspect?: readonly [number, number];
  /** Hilfslinien (Mittellinie + Oval) über der Vorschau einblenden. Default false. */
  guide?: boolean;
  /** Überschrift der Fläche (generisch, ohne Domänen-Bezug). */
  titel?: string;
  /** Kurze Bedien-Beschreibung unter der Überschrift. */
  beschreibung?: string;
  /** Beschriftung der primären Aktion nach dem Auslösen. Default "Foto übernehmen". */
  uebernehmenLabel?: string;
  /** Wird bei „Foto übernehmen" mit dem fertigen Ergebnis gerufen. */
  onCapture?: (ergebnis: CaptureResult) => void;
  /**
   * OPTIONAL: Datei-Upload-Alternative, falls die Kamera nicht verfügbar ist (verweigert/keine Kamera/
   * nicht unterstützt). Wird mit der gewählten Datei gerufen; ist sie gesetzt, erscheint im Fehler-Zustand
   * eine zusätzliche Recovery-Aktion „Bild hochladen". Ohne diese Prop bleibt das bisherige Verhalten
   * unverändert (nur „Erneut versuchen").
   */
  onFallbackFile?: ((datei: File) => void) | undefined;
  /** Beschriftung der Datei-Upload-Alternative im Fehler-Zustand. Default "Bild hochladen". */
  fallbackUploadLabel?: string;
  /** accept-Filter der Datei-Upload-Alternative. Default "image/*". */
  fallbackUploadAccept?: string;
  className?: string;
}

/** MediaDevices-Fehler (DOMException-Name) → interner Fehler-Code. */
function klassifiziereFehler(err: unknown): KameraFehler {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "verweigert";
    case "NotFoundError":
    case "OverconstrainedError":
      return "keine-kamera";
    case "NotReadableError":
    case "AbortError":
      return "belegt";
    default:
      return "unbekannt";
  }
}

/** Handlungsleitender Hinweistext je Fehler-Code (generisch, ohne Domänen-Bezug). */
function fehlerText(code: KameraFehler): { titel: string; text: string } {
  switch (code) {
    case "nicht-unterstuetzt":
      return {
        titel: "Kamera wird nicht unterstützt",
        text: "Dieser Browser oder diese Verbindung erlaubt keinen Kamerazugriff. Bitte einen aktuellen Browser über eine sichere Verbindung (HTTPS) verwenden oder ein Bild hochladen.",
      };
    case "verweigert":
      return {
        titel: "Kamerazugriff verweigert",
        text: "Der Zugriff auf die Kamera wurde abgelehnt. Bitte den Zugriff in den Browser-Einstellungen (Schloss-Symbol in der Adressleiste) erlauben und erneut versuchen.",
      };
    case "keine-kamera":
      return {
        titel: "Keine Kamera gefunden",
        text: "Es wurde keine geeignete Kamera gefunden. Bitte eine Kamera anschließen oder stattdessen ein Bild hochladen.",
      };
    case "belegt":
      return {
        titel: "Kamera nicht verfügbar",
        text: "Die Kamera wird bereits von einer anderen Anwendung verwendet. Bitte andere Programme schließen und erneut versuchen.",
      };
    case "unbekannt":
    default:
      return {
        titel: "Kamera konnte nicht gestartet werden",
        text: "Beim Start der Kamera ist ein unerwarteter Fehler aufgetreten. Bitte erneut versuchen oder ein Bild hochladen.",
      };
  }
}

type Phase = "leer" | "startet" | "live" | "aufgenommen" | "fehler";

/**
 * Webcam-Aufnahme — startet den Kamera-Stream, zeigt eine Live-Vorschau, nimmt auf Auslösen ein Standbild
 * auf und liefert es als Blob/DataURL. Mit vollständigem Fallback bei fehlender Kamera/Erlaubnis. Dep-frei, a11y.
 */
export function CameraCapture({
  resolution = [720, 720],
  facingMode = "user",
  outputMime = "image/jpeg",
  outputQuality = 0.92,
  aspect = [1, 1],
  guide = false,
  titel = "Foto aufnehmen",
  beschreibung = "Richten Sie sich im Rahmen aus und lösen Sie aus. Sie können die Aufnahme beliebig oft wiederholen.",
  uebernehmenLabel = "Foto übernehmen",
  onCapture,
  onFallbackFile,
  fallbackUploadLabel = "Bild hochladen",
  fallbackUploadAccept = "image/*",
  className,
}: CameraCaptureProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const dateiInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("leer");
  const [fehler, setFehler] = useState<KameraFehler | null>(null);
  const [foto, setFoto] = useState<string>("");
  const [statusMeldung, setStatusMeldung] = useState<string>("");

  // Zentrale Ansage (eine Wahrheit). Ohne Provider ein No-Op — die lokale sr-only-Region bleibt als Fallback.
  const { announce } = useStatusRegion();

  const titelId = useId();
  const hinweisId = useId();
  const fehlerId = useId();

  const unterstuetzt =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function";

  // Stream sicher beenden (alle Tracks stoppen).
  const stoppeStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Kamera starten.
  const starteKamera = useCallback(async () => {
    if (!unterstuetzt) {
      setFehler("nicht-unterstuetzt");
      setPhase("fehler");
      return;
    }
    setFehler(null);
    setFoto("");
    setPhase("startet");
    setStatusMeldung("Kamera wird gestartet …");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode,
          width: { ideal: resolution[0] },
          height: { ideal: resolution[1] },
        },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // play() kann je nach Browser ein Promise zurückgeben — Ablehnung darf nicht crashen.
        await video.play().catch(() => undefined);
      }
      setPhase("live");
      setStatusMeldung("Kamera aktiv. Sie können jetzt auslösen.");
    } catch (err) {
      stoppeStream();
      const code = klassifiziereFehler(err);
      setFehler(code);
      setPhase("fehler");
      setStatusMeldung(fehlerText(code).titel);
    }
  }, [unterstuetzt, facingMode, resolution, stoppeStream]);

  // Beim Unmount aufräumen.
  useEffect(() => {
    return () => stoppeStream();
  }, [stoppeStream]);

  // Jede Statusmeldung zusätzlich über die ZENTRALE Ansage feuern (eine Wahrheit, BITV 2.2 AA).
  // Fehler-Phase = assertive (unterbricht), sonst polite (reiht ein). Die lokale sr-only-Region bleibt.
  useEffect(() => {
    if (statusMeldung)
      announce(statusMeldung, phase === "fehler" ? "assertive" : "polite");
    // Absichtlich nur auf statusMeldung lauschen — eine Meldung = eine Ansage.
  }, [statusMeldung]);

  // Auslösen: aktuelles Video-Frame auf ein Canvas zeichnen und als DataURL halten.
  const ausloesen = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setStatusMeldung("Es liegt noch kein Kamerabild vor.");
      return;
    }
    const breite = video.videoWidth;
    const hoehe = video.videoHeight;
    const canvas = document.createElement("canvas");
    canvas.width = breite;
    canvas.height = hoehe;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setStatusMeldung(
        "Die Aufnahme wird von diesem Browser nicht unterstützt.",
      );
      return;
    }
    // Frontkamera spiegeln, damit das Standbild der Live-Vorschau (gespiegelt) entspricht.
    if (facingMode === "user") {
      ctx.translate(breite, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, breite, hoehe);
    const dataURL = canvas.toDataURL(outputMime, outputQuality);
    setFoto(dataURL);
    setPhase("aufgenommen");
    setStatusMeldung("Foto aufgenommen. Übernehmen oder wiederholen.");
    // Live-Stream nach der Aufnahme beenden (Kamera-LED aus, Privatsphäre).
    stoppeStream();
  }, [facingMode, outputMime, outputQuality, stoppeStream]);

  // Übernehmen: das gehaltene Standbild in Blob + DataURL ausgeben.
  const uebernehmen = useCallback(() => {
    if (!foto) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onCapture?.({
          blob: null,
          dataURL: foto,
          breite: img.naturalWidth,
          hoehe: img.naturalHeight,
        });
        setStatusMeldung("Foto übernommen.");
        return;
      }
      ctx.drawImage(img, 0, 0);
      const liefern = (blob: Blob | null) => {
        onCapture?.({
          blob,
          dataURL: foto,
          breite: img.naturalWidth,
          hoehe: img.naturalHeight,
        });
        setStatusMeldung("Foto übernommen.");
      };
      if (typeof canvas.toBlob === "function") {
        canvas.toBlob((blob) => liefern(blob), outputMime, outputQuality);
      } else {
        liefern(null);
      }
    };
    img.onerror = () => {
      onCapture?.({ blob: null, dataURL: foto, breite: 0, hoehe: 0 });
      setStatusMeldung("Foto übernommen.");
    };
    img.src = foto;
  }, [foto, onCapture, outputMime, outputQuality]);

  // Wiederholen: Standbild verwerfen und Kamera neu starten.
  const wiederholen = useCallback(() => {
    setFoto("");
    void starteKamera();
  }, [starteKamera]);

  // Datei-Upload-Alternative (nur wenn onFallbackFile gesetzt): gewählte Datei an den Aufrufer reichen.
  const waehleDatei = useCallback(() => {
    dateiInputRef.current?.click();
  }, []);

  const onDateiGewaehlt = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const datei = e.target.files?.[0];
      // Wert zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
      e.target.value = "";
      if (!datei) return;
      onFallbackFile?.(datei);
      setStatusMeldung(`Bild "${datei.name}" wurde hochgeladen.`);
    },
    [onFallbackFile],
  );

  const fehlerInfo = fehler ? fehlerText(fehler) : null;
  // Im Fehler-Zustand zusätzliche Recovery-Affordance, falls eine Datei-Upload-Alternative angeboten wird.
  const fallbackUploadButton =
    onFallbackFile != null ? (
      <Button type="button" size="sm" variant="outline" onClick={waehleDatei}>
        <Upload aria-hidden="true" className="size-4" />
        {fallbackUploadLabel}
      </Button>
    ) : null;

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card p-4 sm:p-6",
        className,
      )}
      aria-labelledby={titelId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={titelId}
            className="flex items-center gap-2 text-base font-semibold text-foreground"
          >
            <Camera
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            {titel}
          </h2>
          <p id={hinweisId} className="mt-1 text-sm text-muted-foreground">
            {beschreibung}
          </p>
        </div>
        {phase === "live" && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-border bg-background px-2 py-1 text-xs font-medium text-status-ok">
            <span
              className="h-1.5 w-1.5 rounded-full bg-status-ok"
              aria-hidden="true"
            />
            Kamera aktiv
          </span>
        )}
      </header>

      {/* Status für Screenreader. */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMeldung}
      </p>

      <div className="mt-4 grid gap-4">
        {/* ── Vorschau-/Foto-Fläche ───────────────────────────────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-sm">
          <div
            className="relative w-full overflow-hidden rounded-md border border-border bg-muted"
            style={{ aspectRatio: `${aspect[0]} / ${aspect[1]}` }}
          >
            {/* Live-Video — gespiegelt bei Frontkamera, damit die Vorschau natürlich wirkt. */}
            <video
              ref={videoRef}
              playsInline
              muted
              aria-label="Live-Vorschau der Kamera"
              className={cn(
                "absolute inset-0 h-full w-full object-cover",
                facingMode === "user" && "-scale-x-100",
                phase === "live" ? "block" : "hidden",
              )}
            />

            {/* Aufgenommenes Standbild */}
            {phase === "aufgenommen" && foto && (
              <img
                src={foto}
                alt="Aufgenommenes Foto – Vorschau"
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}

            {/* Hilfslinien über der Live-Vorschau */}
            {guide && phase === "live" && (
              <div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
              >
                <div className="absolute left-1/2 top-[10%] h-[80%] w-[58%] -translate-x-1/2 rounded-[50%] border border-primary-foreground/60 mix-blend-difference" />
                <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary-foreground/40 mix-blend-difference" />
              </div>
            )}

            {/* Platzhalter / Start-Aufforderung */}
            {(phase === "leer" || phase === "startet") && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <Video
                  className={cn(
                    "h-7 w-7 text-muted-foreground",
                    phase === "startet" &&
                      "animate-pulse motion-reduce:animate-none",
                  )}
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  {phase === "startet"
                    ? "Kamera wird gestartet …"
                    : "Die Kamera ist noch nicht aktiv."}
                </p>
              </div>
            )}

            {/* Fehler-Platzhalter in der Fläche (zusätzlich zum role=alert-Block unten) */}
            {phase === "fehler" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <CameraOff
                  className="h-7 w-7 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm text-muted-foreground">
                  {fehlerInfo?.titel}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Berechtigungs-Hinweis (vor dem ersten Start) ───────────────────────────────────────── */}
        {phase === "leer" && unterstuetzt && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
            <ShieldQuestion
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Beim Start fragt der Browser nach der Erlaubnis für den
              Kamerazugriff. Bitte bestätigen Sie die Abfrage. Es wird kein Ton
              aufgenommen, und die Aufnahme verlässt erst mit dem Übernehmen Ihr
              Gerät.
            </span>
          </div>
        )}

        {/* ── Fehler-Block über das Fundament-Primitiv ErrorState (role=alert, GARANTIERTE Recovery) ─ */}
        {/* Bietet immer mindestens eine Wiederherstellung; ist eine Datei-Upload-Alternative gesetzt, */}
        {/* erscheint zusätzlich „Bild hochladen". Recovery nie nur über Farbe (Icon + Klartext + Buttons). */}
        {phase === "fehler" && fehlerInfo && (
          <div id={fehlerId}>
            <ErrorState
              icon={CameraOff}
              title={fehlerInfo.titel}
              description={fehlerInfo.text}
              onRetry={() => void starteKamera()}
              retryLabel="Erneut versuchen"
              {...(fallbackUploadButton
                ? { actions: fallbackUploadButton }
                : {})}
            />
          </div>
        )}

        {/* Verstecktes Datei-Eingabefeld für die Upload-Alternative (echtes <input type=file>). */}
        {onFallbackFile != null && (
          <input
            ref={dateiInputRef}
            type="file"
            accept={fallbackUploadAccept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onDateiGewaehlt}
          />
        )}

        {/* ── Aktionsleiste je Phase ─────────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {(phase === "leer" || phase === "fehler") && (
            <Button
              type="button"
              onClick={() => void starteKamera()}
              disabled={!unterstuetzt}
              aria-describedby={hinweisId}
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              {phase === "fehler" ? "Erneut versuchen" : "Kamera starten"}
            </Button>
          )}

          {/* Datei-Upload-Alternative in der Aktionsleiste (additiv, nur wenn angeboten). */}
          {(phase === "leer" || phase === "fehler") &&
            onFallbackFile != null && (
              <Button type="button" variant="outline" onClick={waehleDatei}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {fallbackUploadLabel}
              </Button>
            )}

          {phase === "startet" && (
            <Button type="button" disabled aria-busy="true">
              <Video
                className="h-4 w-4 animate-pulse motion-reduce:animate-none"
                aria-hidden="true"
              />
              Startet …
            </Button>
          )}

          {phase === "live" && (
            <Button
              type="button"
              onClick={ausloesen}
              aria-label="Foto auslösen"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Auslösen
            </Button>
          )}

          {phase === "aufgenommen" && (
            <>
              <Button type="button" onClick={uebernehmen}>
                <Check className="h-4 w-4" aria-hidden="true" />
                {uebernehmenLabel}
              </Button>
              <Button type="button" variant="outline" onClick={wiederholen}>
                <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                Wiederholen
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
