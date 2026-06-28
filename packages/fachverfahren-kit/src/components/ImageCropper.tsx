// fachverfahren-kit/components/ImageCropper — der GENERISCHE Bild-Zuschnitt (z.B. Personalverwaltung / Passbild).
//
// Zweck: ein geladenes Bild auf ein FESTES Seitenverhältnis (prop `aspect`, Default 35:45 = biometrisches
// Passbild DE) zuschneiden — verschieben (Maus/Touch/Tastatur) und zoomen (Maus-Rad/Pinch/Tastatur/Slider),
// optionales Gesichts-Hilfslinien-Overlay (Augen-/Kinn-/Mittellinie), Ausgabe als Blob ODER DataURL in einer
// festen Zielgröße. VOLLSTÄNDIG GENERISCH: keine Domänen-Literale — Seitenverhältnis, Zielgröße, Beschriftungen
// und Overlay kommen ausschließlich als props.
//
// DEP-FREI: rein über die nativen Web-APIs <canvas 2D> / FileReader / HTMLImageElement + Pointer-Events — KEINE
// Bibliothek. BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): die Zuschnitt-Fläche ist ein echtes, per Tastatur
// fokussier-/bedienbares `role="application"`-Element (Pfeile = verschieben, +/- = zoomen, 0 = zurücksetzen),
// trägt ein `aria-label` + Bedien-Hinweis, der Slider hat `aria-valuetext`, Status wird in einer aria-live-Region
// gemeldet, Fokus-Ring sichtbar, alle Bedien-Ziele >=24px, Animationen respektieren prefers-reduced-motion.
import * as React from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from "react";
import { Crop, ImageOff, Maximize2, Minus, Plus, RotateCcw, Upload } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Label } from "../ui/label.js";
import { ErrorState } from "./ErrorState.js";
import { useStatusRegion } from "./StatusRegion.js";
import { Skeleton } from "../ui/skeleton.js";

/** Ausgabe-Format des Zuschnitts. */
export type CropOutputType = "blob" | "dataURL";

/** Das fertige Zuschnitt-Ergebnis (immer beide Repräsentationen, damit der Aufrufer frei wählen kann). */
export interface CropResult {
  /** Der zugeschnittene Bild-Inhalt als Blob (z.B. für FormData-Upload). `null`, falls der Browser keinen liefert. */
  blob: Blob | null;
  /** Derselbe Inhalt als DataURL (z.B. für eine Sofort-Vorschau). */
  dataURL: string;
  /** Tatsächliche Pixel-Größe der Ausgabe. */
  breite: number;
  hoehe: number;
}

export interface ImageCropperProps {
  /**
   * Seitenverhältnis des Zuschnitts als [breite, hoehe]. Default [35, 45] = biometrisches Passbild (DE).
   * Wird ausschließlich als Verhältnis genutzt — die Pixel-Zielgröße steuert `output`.
   */
  aspect?: readonly [number, number];
  /**
   * Pixel-Zielgröße der Ausgabe als [breite, hoehe]. Default [350, 450]. Sollte zu `aspect` passen;
   * passt es nicht, ist die Ausgabe-Breite führend und die Höhe folgt dem `aspect`-Verhältnis.
   */
  output?: readonly [number, number];
  /** MIME-Typ der Ausgabe (z.B. "image/jpeg" oder "image/png"). Default "image/jpeg". */
  outputMime?: string;
  /** Qualität für verlustbehaftete Formate (0..1). Default 0.92. */
  outputQuality?: number;
  /** Initiales Bild als DataURL/URL (optional). Ohne dieses zeigt die Komponente die Lade-Aufforderung. */
  src?: string;
  /** Gesichts-Hilfslinien-Overlay einblenden (Augenlinie, Mittellinie, Kinnbereich). Default true. */
  faceGuide?: boolean;
  /** Erlaubt das Laden einer eigenen Datei über den integrierten Datei-Dialog. Default true. */
  allowUpload?: boolean;
  /** Überschrift der Fläche (generisch, ohne Domänen-Bezug). */
  titel?: string;
  /** Kurze Bedien-Beschreibung unter der Überschrift. */
  beschreibung?: string;
  /** Beschriftung der primären Aktion. Default "Zuschnitt übernehmen". */
  uebernehmenLabel?: string;
  /** Überschrift des Fehlerzustands (statt Roh-Text), wenn ein Bild nicht geladen/gelesen werden kann. */
  fehlerTitel?: string;
  /** Label der Recovery-Aktion „erneut laden" im Fehlerzustand. Default "Bild erneut laden". */
  erneutVersuchenLabel?: string;
  /** Ansage, während das Bild initialisiert/dekodiert wird (aria-live über die zentrale StatusRegion). */
  ladeAnsage?: string;
  /** Wird bei „Zuschnitt übernehmen" mit dem fertigen Ergebnis gerufen. */
  onCrop?: (ergebnis: CropResult) => void;
  /** Wird gerufen, wenn der Nutzer ein neues Bild lädt (DataURL des Originals). */
  onImageLoad?: (dataURL: string) => void;
  className?: string;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const PAN_STEP = 12; // Pixel je Tastendruck (Bildschirm-Pixel der Vorschau)

/** Wert auf [min,max] begrenzen. */
function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Bild-Zuschnitt — lädt ein Bild, lässt es im festen Seitenverhältnis verschieben/zoomen und gibt den
 * sichtbaren Ausschnitt in Zielgröße als Blob/DataURL aus. Alles config-/prop-getrieben, dep-frei, a11y-konform.
 */
export function ImageCropper({
  aspect = [35, 45],
  output = [350, 450],
  outputMime = "image/jpeg",
  outputQuality = 0.92,
  src,
  faceGuide = true,
  allowUpload = true,
  titel = "Bildausschnitt festlegen",
  beschreibung = "Verschieben und zoomen Sie das Bild, bis der gewünschte Ausschnitt im Rahmen liegt.",
  uebernehmenLabel = "Zuschnitt übernehmen",
  fehlerTitel = "Bild konnte nicht verwendet werden",
  erneutVersuchenLabel = "Bild erneut laden",
  ladeAnsage = "Bild wird geladen …",
  onCrop,
  onImageLoad,
  className,
}: ImageCropperProps): ReactElement {
  const aspectRatio = aspect[0] / aspect[1];

  // Ziel-Pixelgröße: Breite führend, Höhe folgt dem Seitenverhältnis (robust gegen inkonsistente props).
  const outBreite = Math.max(1, Math.round(output[0]));
  const outHoehe = Math.max(1, Math.round(outBreite / aspectRatio));

  const stageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string>(src ?? "");
  const [imgNatur, setImgNatur] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Versatz in Bildschirm-Pixel der Vorschau
  const [stageBreite, setStageBreite] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [statusMeldung, setStatusMeldung] = useState<string>("");
  // Reload-Nonce: erlaubt die Recovery-Aktion „erneut laden" denselben `imageSrc` neu zu dekodieren.
  const [reloadNonce, setReloadNonce] = useState(0);

  const titelId = useId();
  const hinweisId = useId();
  const fehlerId = useId();
  const zoomId = useId();

  // Zentrale Ansage (aria-live) — additiv zur bestehenden lokalen role="status"-Region. No-Op ohne Provider.
  const { announce } = useStatusRegion();

  // Vorschau-Höhe folgt dem Seitenverhältnis; Versatz wird stets so begrenzt, dass keine leere Fläche entsteht.
  const stageHoehe = stageBreite > 0 ? stageBreite / aspectRatio : 0;

  // Beobachte die Stage-Breite (responsiv), um Versatz/Render in Bildschirm-Pixeln rechnen zu können.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const messen = () => setStageBreite(el.clientWidth);
    messen();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", messen);
      return () => window.removeEventListener("resize", messen);
    }
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Externe `src`-Änderung übernehmen.
  useEffect(() => {
    if (src !== undefined) setImageSrc(src);
  }, [src]);

  // Bild laden (Natur-Maße ermitteln); danach Zoom/Versatz zurücksetzen.
  useEffect(() => {
    if (!imageSrc) {
      setImgNatur(null);
      imgRef.current = null;
      return;
    }
    let abgebrochen = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (abgebrochen) return;
      imgRef.current = img;
      setImgNatur({ w: img.naturalWidth, h: img.naturalHeight });
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
      setFehler(null);
      setStatusMeldung("Bild geladen. Ausschnitt kann jetzt angepasst werden.");
    };
    img.onerror = () => {
      if (abgebrochen) return;
      imgRef.current = null;
      setImgNatur(null);
      setFehler("Das Bild konnte nicht geladen werden. Bitte ein anderes Bild wählen.");
    };
    img.src = imageSrc;
    return () => {
      abgebrochen = true;
    };
  }, [imageSrc, reloadNonce]);

  // Recovery: denselben `imageSrc` erneut dekodieren (setzt Fehler zurück → Lade-/Init-Zustand).
  const erneutLaden = useCallback(() => {
    if (!imageSrc) return;
    setFehler(null);
    setImgNatur(null);
    imgRef.current = null;
    setReloadNonce((n) => n + 1);
  }, [imageSrc]);

  /**
   * „Cover"-Anpassung: das Bild füllt die Vorschau bei zoom=1 vollständig (kein Leerraum). Liefert die
   * gerenderte Bildgröße in Bildschirm-Pixeln bei aktuellem Zoom.
   */
  const gerendert = useMemo(() => {
    if (!imgNatur || stageBreite <= 0) return null;
    const skalaCover = Math.max(stageBreite / imgNatur.w, stageHoehe / imgNatur.h);
    const breite = imgNatur.w * skalaCover * zoom;
    const hoehe = imgNatur.h * skalaCover * zoom;
    return { breite, hoehe, skalaCover };
  }, [imgNatur, stageBreite, stageHoehe, zoom]);

  // Maximaler Versatz, damit das Bild den Rahmen immer vollständig bedeckt.
  const maxOffset = useMemo(() => {
    if (!gerendert) return { x: 0, y: 0 };
    return {
      x: Math.max(0, (gerendert.breite - stageBreite) / 2),
      y: Math.max(0, (gerendert.hoehe - stageHoehe) / 2),
    };
  }, [gerendert, stageBreite, stageHoehe]);

  // Versatz nach jeder Zoom-/Größenänderung re-klemmen.
  useEffect(() => {
    setOffset((prev) => ({
      x: clamp(prev.x, -maxOffset.x, maxOffset.x),
      y: clamp(prev.y, -maxOffset.y, maxOffset.y),
    }));
  }, [maxOffset.x, maxOffset.y]);

  const verschieben = useCallback(
    (dx: number, dy: number) => {
      setOffset((prev) => ({
        x: clamp(prev.x + dx, -maxOffset.x, maxOffset.x),
        y: clamp(prev.y + dy, -maxOffset.y, maxOffset.y),
      }));
    },
    [maxOffset.x, maxOffset.y],
  );

  const zoomenAuf = useCallback((z: number) => {
    setZoom(clamp(Number(z.toFixed(3)), MIN_ZOOM, MAX_ZOOM));
  }, []);

  const zuruecksetzen = useCallback(() => {
    setZoom(MIN_ZOOM);
    setOffset({ x: 0, y: 0 });
    setStatusMeldung("Ausschnitt zurückgesetzt.");
  }, []);

  // Lade-/Initialisierungs-Zustand: Quelle gesetzt, aber Bild noch nicht dekodiert und (noch) kein Fehler.
  const initialisiert = !!imageSrc && !imgNatur && !fehler;

  // Status-Meldungen additiv zentral ansagen (höflich; Fehler assertiv) — eine Ansage-Wahrheit, ohne die
  // bestehende lokale Region zu entfernen. Lade-Ansage feuert beim Start der Initialisierung.
  useEffect(() => {
    if (initialisiert) announce(ladeAnsage, "polite");
  }, [initialisiert, ladeAnsage, announce]);

  useEffect(() => {
    if (statusMeldung) announce(statusMeldung, "polite");
  }, [statusMeldung, announce]);

  useEffect(() => {
    if (fehler) announce(fehler, "assertive");
  }, [fehler, announce]);

  // ── Pointer-Pan (Maus + Touch über Pointer-Events) ─────────────────────────────────────────────
  const dragRef = useRef<{ id: number; startX: number; startY: number; offX: number; offY: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!imgNatur) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, offX: offset.x, offY: offset.y };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const nx = d.offX + (e.clientX - d.startX);
    const ny = d.offY + (e.clientY - d.startY);
    setOffset({
      x: clamp(nx, -maxOffset.x, maxOffset.x),
      y: clamp(ny, -maxOffset.y, maxOffset.y),
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!imgNatur) return;
    const richtung = e.deltaY < 0 ? 1 : -1;
    zoomenAuf(zoom + richtung * ZOOM_STEP);
  };

  // ── Tastatur: Pfeile = verschieben, +/-/PageUp/PageDown = zoomen, 0/Home = reset ────────────────
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!imgNatur) return;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        verschieben(PAN_STEP, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        verschieben(-PAN_STEP, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        verschieben(0, PAN_STEP);
        break;
      case "ArrowDown":
        e.preventDefault();
        verschieben(0, -PAN_STEP);
        break;
      case "+":
      case "=":
      case "PageUp":
        e.preventDefault();
        zoomenAuf(zoom + ZOOM_STEP);
        break;
      case "-":
      case "_":
      case "PageDown":
        e.preventDefault();
        zoomenAuf(zoom - ZOOM_STEP);
        break;
      case "0":
      case "Home":
        e.preventDefault();
        zuruecksetzen();
        break;
      default:
        break;
    }
  };

  // ── Datei laden ────────────────────────────────────────────────────────────────────────────────
  const dateiLaden = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFehler("Die gewählte Datei ist kein Bild. Bitte ein Bildformat (z.B. JPG oder PNG) wählen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        setFehler("Die Bilddatei konnte nicht gelesen werden.");
        return;
      }
      setFehler(null);
      setImageSrc(result);
      onImageLoad?.(result);
    };
    reader.onerror = () => setFehler("Die Bilddatei konnte nicht gelesen werden.");
    reader.readAsDataURL(file);
  };

  // ── Zuschnitt berechnen und ausgeben ─────────────────────────────────────────────────────────────
  const zuschneiden = useCallback(() => {
    const img = imgRef.current;
    if (!img || !gerendert || stageBreite <= 0) {
      setFehler("Es liegt noch kein anpassbares Bild vor.");
      return;
    }
    // Sichtbarer Ausschnitt (in Bildschirm-Pixeln der Vorschau) → Quell-Pixel des Originals zurückrechnen.
    // Render-Skala: Bildschirm-Pixel pro Original-Pixel.
    const renderSkala = gerendert.breite / img.naturalWidth;
    // Linke obere Ecke des Rahmens, ausgedrückt in Render-Koordinaten (Bild zentriert + Versatz).
    const bildLinks = (stageBreite - gerendert.breite) / 2 + offset.x;
    const bildOben = (stageHoehe - gerendert.hoehe) / 2 + offset.y;
    const quelleX = (-bildLinks) / renderSkala;
    const quelleY = (-bildOben) / renderSkala;
    const quelleB = stageBreite / renderSkala;
    const quelleH = stageHoehe / renderSkala;

    const canvas = document.createElement("canvas");
    canvas.width = outBreite;
    canvas.height = outHoehe;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setFehler("Der Zuschnitt wird von diesem Browser nicht unterstützt.");
      return;
    }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      img,
      clamp(quelleX, 0, img.naturalWidth),
      clamp(quelleY, 0, img.naturalHeight),
      clamp(quelleB, 1, img.naturalWidth),
      clamp(quelleH, 1, img.naturalHeight),
      0,
      0,
      outBreite,
      outHoehe,
    );

    const dataURL = canvas.toDataURL(outputMime, outputQuality);
    const liefern = (blob: Blob | null) => {
      onCrop?.({ blob, dataURL, breite: outBreite, hoehe: outHoehe });
      setStatusMeldung("Zuschnitt übernommen.");
    };
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((blob) => liefern(blob), outputMime, outputQuality);
    } else {
      liefern(null);
    }
  }, [gerendert, offset.x, offset.y, outBreite, outHoehe, outputMime, outputQuality, onCrop, stageBreite, stageHoehe]);

  const hatBild = !!imgNatur;
  const zoomProzent = Math.round(zoom * 100);

  return (
    <section
      className={cn("rounded-lg border border-border bg-card p-4 sm:p-6", className)}
      aria-labelledby={titelId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={titelId} className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Crop className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {titel}
          </h2>
          <p id={hinweisId} className="mt-1 text-sm text-muted-foreground">
            {beschreibung}
          </p>
        </div>
        {allowUpload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            {hatBild ? "Anderes Bild" : "Bild wählen"}
          </Button>
        )}
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Bilddatei auswählen"
        onChange={(e) => {
          dateiLaden(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Status für Screenreader (Bild geladen / Zoom / übernommen). */}
      <p className="sr-only" role="status" aria-live="polite">
        {statusMeldung}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        {/* ── Zuschnitt-Fläche ───────────────────────────────────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-xs">
          <div
            ref={stageRef}
            role="application"
            tabIndex={0}
            aria-label={`${titel}. Pfeiltasten verschieben, Plus und Minus zoomen, Null setzt zurück.`}
            aria-describedby={cn(hinweisId, fehler ? fehlerId : undefined)}
            aria-busy={initialisiert || undefined}
            aria-disabled={!hatBild || undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={onKeyDown}
            className={cn(
              "relative w-full select-none overflow-hidden rounded-md border border-border bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              hatBild ? "cursor-move touch-none" : "cursor-default",
            )}
            style={{ aspectRatio: `${aspect[0]} / ${aspect[1]}` }}
          >
            {hatBild && gerendert ? (
              <>
                {/* Das Bild als absolut positioniertes Element (zentriert + Versatz, in Bildschirm-Pixeln). */}
                <img
                  src={imageSrc}
                  alt=""
                  draggable={false}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-none motion-reduce:transition-none"
                  style={{
                    width: `${gerendert.breite}px`,
                    height: `${gerendert.hoehe}px`,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }}
                />
                {faceGuide && <FaceGuideOverlay />}
              </>
            ) : initialisiert ? (
              // Init-Loading: layout-treuer Platzhalter, während das Bild dekodiert wird (kein irreführendes
              // „kein Bild"). Rein dekorativ (aria-hidden); die Ansage übernimmt die StatusRegion.
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4" aria-hidden="true">
                <Skeleton className="h-full w-full motion-reduce:animate-none" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
                <ImageOff className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {fehler ? "Kein Bild geladen." : "Noch kein Bild geladen."}
                </p>
                {allowUpload && (
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    Bild wählen
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Fehler MIT Ausweg: ErrorState garantiert >=1 Recovery (erneut laden + ggf. anderes Bild wählen),
              sagt den Fehler an (role="alert") und nutzt Token-Farben statt Roh-Text. */}
          {fehler && (
            <div id={fehlerId} className="mt-3">
              <ErrorState
                inline
                icon={ImageOff}
                title={fehlerTitel}
                description={fehler}
                onRetry={imageSrc ? erneutLaden : undefined}
                retryLabel={erneutVersuchenLabel}
                actions={
                  allowUpload ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload aria-hidden="true" className="size-4" />
                      Anderes Bild wählen
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </div>

        {/* ── Steuerung ──────────────────────────────────────────────────────────────────────────── */}
        <div className="flex w-full flex-col gap-4 md:w-56">
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor={zoomId} className="text-[12px] font-medium text-muted-foreground">
                Zoom
              </Label>
              <span className="text-[12px] tabular-nums text-muted-foreground">{zoomProzent}%</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => zoomenAuf(zoom - ZOOM_STEP)}
                disabled={!hatBild || zoom <= MIN_ZOOM}
                aria-label="Verkleinern"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <input
                id={zoomId}
                type="range"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={ZOOM_STEP}
                value={zoom}
                disabled={!hatBild}
                onChange={(e) => zoomenAuf(Number(e.target.value))}
                aria-valuetext={`${zoomProzent} Prozent`}
                className={cn(
                  "h-9 w-full cursor-pointer accent-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => zoomenAuf(zoom + ZOOM_STEP)}
                disabled={!hatBild || zoom >= MAX_ZOOM}
                aria-label="Vergrößern"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <dl className="grid gap-1 rounded-md border border-border bg-background p-3 text-[12px]">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Seitenverhältnis</dt>
              <dd className="tabular-nums text-foreground">
                {aspect[0]}:{aspect[1]}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Ausgabe</dt>
              <dd className="tabular-nums text-foreground">
                {outBreite} × {outHoehe} px
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-2">
            <Button type="button" onClick={zuschneiden} disabled={!hatBild}>
              <Maximize2 className="h-4 w-4" aria-hidden="true" />
              {uebernehmenLabel}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={zuruecksetzen}
              disabled={!hatBild}
              className="justify-center"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Zurücksetzen
            </Button>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Tastatur: Pfeiltasten verschieben, <kbd className="rounded-sm border border-border px-1">+</kbd> /{" "}
            <kbd className="rounded-sm border border-border px-1">−</kbd> zoomen,{" "}
            <kbd className="rounded-sm border border-border px-1">0</kbd> setzt zurück.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Gesichts-Hilfslinien-Overlay (rein dekorativ, aria-hidden): Augenlinie (~oberes Drittel), vertikale
 * Mittellinie und Kinnbereich (~unteres Achtel) als Orientierung für ein biometrisches Porträt. Farben
 * ausschließlich über Token-Klassen; Linien dünn und zurückhaltend (seriös, nicht verspielt).
 */
function FaceGuideOverlay(): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Ovale Kopf-Führung */}
      <div className="absolute left-1/2 top-[10%] h-[80%] w-[58%] -translate-x-1/2 rounded-[50%] border border-primary-foreground/60 mix-blend-difference" />
      {/* Vertikale Mittellinie */}
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-primary-foreground/40 mix-blend-difference" />
      {/* Augenlinie (oberes Drittel) */}
      <div className="absolute left-[15%] right-[15%] top-[38%] h-px bg-primary-foreground/40 mix-blend-difference" />
      {/* Kinnlinie (unteres Achtel) */}
      <div className="absolute left-[25%] right-[25%] top-[86%] h-px bg-primary-foreground/40 mix-blend-difference" />
    </div>
  );
}
