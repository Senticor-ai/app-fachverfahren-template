// fachverfahren-kit/components/MapView — die GENERISCHE, dependency-freie Slippy-Map.
//
// Zweck: Geo-Kontext für Adressen/Flurstücke/Standorte (z.B. Bauantrag, Meldeadresse) — OHNE maplibre/leaflet.
// Eine schlanke, eigene Raster-Implementierung: aus {center,zoom} werden die sichtbaren Web-Mercator-Kacheln
// (z/x/y) berechnet und als <img> in einem absolut positionierten Grid gerendert. Pan per Maus-Drag UND per
// Tastatur (Pfeiltasten), Zoom über +/−-Buttons (und Tastatur, wenn die Karte fokussiert ist).
//
// SOUVERÄNITÄT: Ohne `tileUrl` werden KEINE externen Kacheln geladen (Datenschutz/Air-Gap) — stattdessen ein
// neutrales Gitter + ein klarer Hinweis, dass eine souveräne Kachel-Quelle (`tileUrl`) zu konfigurieren ist.
// Mit `tileUrl` ({z}/{x}/{y}-Template) wird ausschließlich diese vom Betreiber bestimmte Quelle verwendet.
//
// A11y (BITV/WCAG 2.2 AA): Die Karte ist eine fokussierbare `role="application"` mit Tastatur-Pan/Zoom; eine
// stets sichtbare, textliche Koordinaten-Alternative macht den Karteninhalt ohne Sehkraft nutzbar; Marker und
// Zoom-Buttons sind beschriftet; Ziele ≥ 24px; Bewegung respektiert `prefers-reduced-motion`.
//
// VOLLSTÄNDIG GENERISCH: keine Domänen-Literale. Beschriftungen sind als Props überschreibbar.
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { MapPin, Minus, Plus, Crosshair } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Skeleton } from "../ui/skeleton.js";
import { ErrorState } from "./ErrorState.js";
import { StatusRegion } from "./StatusRegion.js";
import { useViewState, announcePoliteness } from "../hooks/use-view-state.js";

// ── Vertrag ───────────────────────────────────────────────────────────────────────────────────
/** Geografische Position in Grad (WGS84). */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker extends LatLng {
  /** Beschriftung des Markers (für Titel/Tooltip + Screenreader). */
  label?: string;
}

export interface MapViewProps {
  /** Kartenmittelpunkt (Grad). */
  center: LatLng;
  /** Zoomstufe (ganzzahlig, wird auf [minZoom, maxZoom] geklemmt). */
  zoom: number;
  /** Optionaler Marker (z.B. die Antragsadresse/das Flurstück). */
  marker?: MapMarker;
  /**
   * Kachel-Template der souveränen Raster-Quelle, mit Platzhaltern `{z}` `{x}` `{y}` und optional `{s}`
   * (Sub-Domain). Ohne diesen Wert lädt die Karte KEINE externen Kacheln (Datenschutz) und zeigt einen Hinweis.
   */
  tileUrl?: string;
  /** Sub-Domains für `{s}` (Round-Robin). Standard: ["a","b","c"]. */
  tileSubdomains?: readonly string[];
  /** Quellen-/Lizenzhinweis (z.B. „© OpenStreetMap-Mitwirkende"). Pflicht bei externen Kacheln. */
  attribution?: string;
  /** Höhe des Kartenbereichs (CSS-Wert). Standard: "20rem". */
  height?: string;
  /** Kleinste/größte erlaubte Zoomstufe. */
  minZoom?: number;
  maxZoom?: number;
  /** Wird gerufen, wenn Nutzer:innen Mittelpunkt/Zoom durch Pan/Zoom verändern. */
  onViewChange?: (view: { center: LatLng; zoom: number }) => void;
  /** Zugängliches Label der Karte (sonst generisch). */
  ariaLabel?: string;
  /** Hinweistext, wenn keine `tileUrl` konfiguriert ist (sonst generisch). */
  fallbackHint?: string;
  /**
   * Ladezustand der Kartenquelle (z. B. asynchron aufgelöste `tileUrl`/Geokodierung).
   * `true` → layout-treuer Lade-Platzhalter + Ansage; Default `false` (bestehendes Verhalten).
   */
  loading?: boolean;
  /**
   * Fehler der Kartenquelle. Gesetzt → ErsetzungsAnsicht mit garantierter Recovery (ErrorState).
   * Default `undefined` (kein Fehler — bestehendes Verhalten).
   */
  error?: unknown;
  /** Überschrift im Fehlerzustand (sonst generisch). */
  errorTitle?: string;
  /** Beschreibung im Fehlerzustand (sonst generisch). */
  errorDescription?: string;
  /** Recovery-Aktion im Fehlerzustand (z. B. Kachel-Quelle neu laden). Fehlt sie, bietet ErrorState ein Neuladen an. */
  onRetry?: (() => void) | undefined;
  /**
   * Wird gerufen, wenn der Marker per Klick/Tastatur (Enter/Leertaste) aktiviert wird.
   * Gesetzt → der Marker wird zu einer fokussierbaren Schaltfläche; sonst bleibt er rein visuell.
   */
  onMarkerActivate?: (() => void) | undefined;
  className?: string;
}

// ── Web-Mercator-Mathematik (Standard-Slippy-Map-Projektion) ────────────────────────────────────
const TILE_SIZE = 256;

function clampNum(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Längengrad → fraktionale Welt-Kachel-X-Koordinate für Zoom z. */
function lngToTileX(lng: number, z: number): number {
  return ((lng + 180) / 360) * Math.pow(2, z);
}

/** Breitengrad → fraktionale Welt-Kachel-Y-Koordinate für Zoom z (Web-Mercator). */
function latToTileY(lat: number, z: number): number {
  const clampedLat = clampNum(lat, -85.05112878, 85.05112878);
  const rad = (clampedLat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
    Math.pow(2, z)
  );
}

/** Fraktionale Kachel-X-Koordinate → Längengrad. */
function tileXToLng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

/** Fraktionale Kachel-Y-Koordinate → Breitengrad. */
function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Koordinate menschenlesbar formatieren (6 Nachkommastellen ≈ 0,11 m). */
function formatLatLng(p: LatLng): string {
  const ns = p.lat >= 0 ? "N" : "S";
  const ew = p.lng >= 0 ? "O" : "W";
  return `${Math.abs(p.lat).toFixed(6)}° ${ns}, ${Math.abs(p.lng).toFixed(6)}° ${ew}`;
}

/** Kachel-URL aus dem Template + Round-Robin-Subdomain bilden. */
function buildTileUrl(
  template: string,
  z: number,
  x: number,
  y: number,
  subdomains: readonly string[],
): string {
  const s =
    subdomains.length > 0
      ? subdomains[
          (((x + y) % subdomains.length) + subdomains.length) %
            subdomains.length
        ]!
      : "";
  return template
    .replace(/\{s\}/g, s)
    .replace(/\{z\}/g, String(z))
    .replace(/\{x\}/g, String(x))
    .replace(/\{y\}/g, String(y));
}

/** Eine konkret zu rendernde Kachel (Welt-Koordinaten + Pixel-Offset im Container). */
interface RenderTile {
  key: string;
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  url: string | null;
}

// ── Komponente ──────────────────────────────────────────────────────────────────────────────────
export function MapView({
  center,
  zoom,
  marker,
  tileUrl,
  tileSubdomains = ["a", "b", "c"],
  attribution,
  height = "20rem",
  minZoom = 1,
  maxZoom = 19,
  onViewChange,
  ariaLabel,
  fallbackHint,
  loading = false,
  error,
  errorTitle,
  errorDescription,
  onRetry,
  onMarkerActivate,
  className,
}: MapViewProps): ReactElement {
  const titleId = useId();
  const descId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // ── Zustand der Kartenquelle (nur aktiv, wenn loading/error-Props genutzt werden) ──────────────
  // Spiegelt die loading/error-Props in den EINEN ViewState-Vertrag; ohne diese Props bleibt der
  // Zustand „ready" und das bestehende Verhalten/Layout ist unverändert.
  const source = useViewState({ initial: "ready" });
  const sourceStatus = source.state.status;
  useEffect(() => {
    if (error != null) source.fail(error);
    else if (loading) source.start();
    // Nur zurück auf „ready", wenn vorher wirklich geladen/fehlerhaft — kein Ansage-Rauschen sonst.
    else if (sourceStatus !== "ready") source.set("ready");
  }, [loading, error, sourceStatus, source.fail, source.start, source.set]);

  // Interner Ansichts-Zustand (kontrolliert über props initialisiert, danach intern fortgeführt).
  const [view, setView] = useState<{ center: LatLng; zoom: number }>(() => ({
    center,
    zoom: Math.round(clampNum(zoom, minZoom, maxZoom)),
  }));

  // Prop-Änderungen von außen übernehmen (z.B. neue Adresse), ohne Pan-Interaktion zu stören.
  const lastProp = useRef<{ lat: number; lng: number; zoom: number }>({
    lat: center.lat,
    lng: center.lng,
    zoom,
  });
  useEffect(() => {
    if (
      lastProp.current.lat !== center.lat ||
      lastProp.current.lng !== center.lng ||
      lastProp.current.zoom !== zoom
    ) {
      lastProp.current = { lat: center.lat, lng: center.lng, zoom };
      setView({ center, zoom: Math.round(clampNum(zoom, minZoom, maxZoom)) });
    }
  }, [center, zoom, minZoom, maxZoom]);

  // Gemessene Containergröße (für die Kachelabdeckung). Ohne Messung sinnvoller Startwert.
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 640,
    h: 320,
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height: hgt } = e.contentRect;
        if (width > 0 && hgt > 0)
          setSize({ w: Math.round(width), h: Math.round(hgt) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const emitChange = useCallback(
    (next: { center: LatLng; zoom: number }) => {
      onViewChange?.(next);
    },
    [onViewChange],
  );

  // Pan um (dx, dy) Pixel → neuer Mittelpunkt in Grad.
  const panByPixels = useCallback(
    (dx: number, dy: number) => {
      setView((prev) => {
        const cx = lngToTileX(prev.center.lng, prev.zoom);
        const cy = latToTileY(prev.center.lat, prev.zoom);
        const nx = cx - dx / TILE_SIZE;
        const ny = cy - dy / TILE_SIZE;
        const next = {
          center: {
            lat: tileYToLat(ny, prev.zoom),
            lng: tileXToLng(nx, prev.zoom),
          },
          zoom: prev.zoom,
        };
        emitChange(next);
        return next;
      });
    },
    [emitChange],
  );

  const setZoom = useCallback(
    (delta: number) => {
      setView((prev) => {
        const nz = Math.round(clampNum(prev.zoom + delta, minZoom, maxZoom));
        if (nz === prev.zoom) return prev;
        const next = { center: prev.center, zoom: nz };
        emitChange(next);
        return next;
      });
    },
    [emitChange, minZoom, maxZoom],
  );

  // ── Drag-Pan (Pointer Events; funktioniert für Maus + Touch + Stift) ────────────────────────
  const dragState = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Nur primäre Taste / Touch; Klicks auf Bedienelemente nicht als Pan werten.
    if (e.button !== 0) return;
    dragState.current = {
      active: true,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    if (!st?.active) return;
    const dx = e.clientX - st.lastX;
    const dy = e.clientY - st.lastY;
    if (dx === 0 && dy === 0) return;
    st.lastX = e.clientX;
    st.lastY = e.clientY;
    st.moved = true;
    panByPixels(dx, dy);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current?.active) return;
    dragState.current.active = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // PointerCapture kann bereits gelöst sein — unkritisch.
    }
  };

  // ── Tastatur-Pan/Zoom (Karte fokussiert) ────────────────────────────────────────────────────
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 160 : 64; // Pixel pro Tastendruck
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        panByPixels(0, step);
        break;
      case "ArrowDown":
        e.preventDefault();
        panByPixels(0, -step);
        break;
      case "ArrowLeft":
        e.preventDefault();
        panByPixels(step, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        panByPixels(-step, 0);
        break;
      case "+":
      case "=":
        e.preventDefault();
        setZoom(1);
        break;
      case "-":
      case "_":
        e.preventDefault();
        setZoom(-1);
        break;
      default:
        break;
    }
  };

  // ── Sichtbare Kacheln berechnen ─────────────────────────────────────────────────────────────
  const tiles = useMemo<RenderTile[]>(() => {
    const z = view.zoom;
    const worldTiles = Math.pow(2, z);
    const centerX = lngToTileX(view.center.lng, z);
    const centerY = latToTileY(view.center.lat, z);

    // Pixel-Position des Mittelpunkts im Container.
    const halfW = size.w / 2;
    const halfH = size.h / 2;

    // Sichtbarer Kachel-Bereich (mit 1 Kachel Puffer am Rand).
    const minTileX = Math.floor(centerX - halfW / TILE_SIZE) - 1;
    const maxTileX = Math.floor(centerX + halfW / TILE_SIZE) + 1;
    const minTileY = Math.floor(centerY - halfH / TILE_SIZE) - 1;
    const maxTileY = Math.floor(centerY + halfH / TILE_SIZE) + 1;

    const out: RenderTile[] = [];
    for (let tx = minTileX; tx <= maxTileX; tx++) {
      for (let ty = minTileY; ty <= maxTileY; ty++) {
        // Y außerhalb der Welt gibt es nicht (kein vertikales Wrappen).
        if (ty < 0 || ty >= worldTiles) continue;
        // X horizontal umwickeln (Antimeridian) für korrekte Kachel-Indizes.
        const wrappedX = ((tx % worldTiles) + worldTiles) % worldTiles;
        const left = halfW + (tx - centerX) * TILE_SIZE;
        const top = halfH + (ty - centerY) * TILE_SIZE;
        const url = tileUrl
          ? buildTileUrl(tileUrl, z, wrappedX, ty, tileSubdomains)
          : null;
        out.push({
          key: `${z}/${tx}/${ty}`,
          z,
          x: wrappedX,
          y: ty,
          left,
          top,
          url,
        });
      }
    }
    return out;
  }, [
    view.center.lat,
    view.center.lng,
    view.zoom,
    size.w,
    size.h,
    tileUrl,
    tileSubdomains,
  ]);

  // Marker-Pixelposition relativ zum Container.
  const markerPos = useMemo<{ left: number; top: number } | null>(() => {
    if (!marker) return null;
    const z = view.zoom;
    const centerX = lngToTileX(view.center.lng, z);
    const centerY = latToTileY(view.center.lat, z);
    const mx = lngToTileX(marker.lng, z);
    const my = latToTileY(marker.lat, z);
    return {
      left: size.w / 2 + (mx - centerX) * TILE_SIZE,
      top: size.h / 2 + (my - centerY) * TILE_SIZE,
    };
  }, [marker, view.center.lat, view.center.lng, view.zoom, size.w, size.h]);

  const containerStyle: CSSProperties = { height };
  const label = ariaLabel ?? "Interaktive Karte";
  const hint =
    fallbackHint ??
    "Keine Kachel-Quelle konfiguriert. Hinterlegen Sie eine souveräne Raster-Quelle (tileUrl), um Kartenmaterial anzuzeigen. Pan und Zoom sind weiterhin möglich.";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
    >
      {/* Karten-Viewport */}
      <div className="relative">
        <div
          ref={containerRef}
          role="application"
          aria-roledescription="Karte"
          aria-label={label}
          aria-describedby={`${titleId} ${descId}`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          style={containerStyle}
          className={cn(
            "relative w-full touch-none select-none overflow-hidden bg-muted outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
        >
          {/* Neutrales Grundgitter — sorgt auch ohne Kacheln für Orientierung. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right, color-mix(in oklch, var(--color-border) 70%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--color-border) 70%, transparent) 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Raster-Kacheln (nur mit tileUrl) */}
          {tiles.map((t) =>
            t.url ? (
              <img
                key={t.key}
                src={t.url}
                alt=""
                aria-hidden="true"
                draggable={false}
                width={TILE_SIZE}
                height={TILE_SIZE}
                loading="lazy"
                decoding="async"
                onError={(ev) => {
                  // Fehlende Kachel still ausblenden — kein Bruch-Icon im Kartenbild.
                  ev.currentTarget.style.visibility = "hidden";
                }}
                className="pointer-events-none absolute"
                style={{
                  left: t.left,
                  top: t.top,
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                }}
              />
            ) : null,
          )}

          {/* Marker — fokussierbare Schaltfläche, wenn onMarkerActivate gesetzt ist; sonst rein visuell. */}
          {markerPos &&
            (onMarkerActivate ? (
              <button
                type="button"
                onClick={(e) => {
                  // Klick auf den Marker nicht als Pan-Klick durchreichen.
                  e.stopPropagation();
                  onMarkerActivate();
                }}
                onPointerDown={(e) => {
                  // Drag-Pan des Containers beim Antippen des Markers verhindern.
                  e.stopPropagation();
                }}
                aria-label={marker?.label ?? "Markierung auf der Karte"}
                className={cn(
                  "absolute flex min-h-6 min-w-6 -translate-x-1/2 -translate-y-full items-end justify-center rounded",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                )}
                style={{ left: markerPos.left, top: markerPos.top }}
              >
                <MapPin
                  className="h-7 w-7 text-primary drop-shadow"
                  aria-hidden="true"
                  strokeWidth={2.25}
                />
              </button>
            ) : (
              <div
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-full"
                style={{ left: markerPos.left, top: markerPos.top }}
              >
                <MapPin
                  className="h-7 w-7 text-primary drop-shadow"
                  aria-hidden="true"
                  strokeWidth={2.25}
                />
                {marker?.label && (
                  <span className="sr-only">{marker.label}</span>
                )}
              </div>
            ))}

          {/* Fadenkreuz im Mittelpunkt (dezent) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/60"
          >
            <Crosshair className="h-4 w-4" />
          </div>

          {/* Hinweis bei fehlender Kachel-Quelle */}
          {!tileUrl && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
              <p
                role="status"
                className="pointer-events-auto max-w-md rounded-md border border-border bg-card/95 px-3 py-2 text-sm leading-snug text-muted-foreground shadow-md"
              >
                {hint}
              </p>
            </div>
          )}
        </div>

        {/* Lade-Overlay der Kartenquelle — layout-treuer Platzhalter (Ansage über StatusRegion). */}
        {source.state.status === "loading" && (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-10 flex flex-col gap-2 bg-card/80 p-3 motion-reduce:transition-none"
          >
            <Skeleton className="h-full w-full rounded-md" />
          </div>
        )}

        {/* Fehler-Overlay der Kartenquelle — garantierte Recovery (ErrorState). */}
        {source.state.status !== "loading" &&
          source.state.status !== "ready" &&
          source.state.status !== "idle" && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/95 p-4">
              <ErrorState
                title={
                  errorTitle ?? "Kartenmaterial konnte nicht geladen werden"
                }
                description={
                  errorDescription ??
                  source.state.message ??
                  "Die konfigurierte Kachel-Quelle ist nicht erreichbar."
                }
                onRetry={onRetry}
                inline
                className="max-w-md"
              />
            </div>
          )}

        {/* Zoom-Bedienung — schwebend, ≥ 24px Zielgröße */}
        <div className="absolute right-3 top-3 flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setZoom(1)}
            disabled={view.zoom >= maxZoom}
            aria-label="Hineinzoomen"
            className="h-9 w-9 bg-card shadow-md transition-colors duration-150 ease-out motion-reduce:transition-none"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setZoom(-1)}
            disabled={view.zoom <= minZoom}
            aria-label="Herauszoomen"
            className="h-9 w-9 bg-card shadow-md transition-colors duration-150 ease-out motion-reduce:transition-none"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Text-Alternative + Lizenz — macht den Karteninhalt ohne Sehkraft nutzbar (Farbe nicht allein) */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 border-t border-border bg-card px-4 py-2 text-sm">
        <dl className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap gap-x-2">
            <dt id={titleId} className="text-muted-foreground">
              Kartenmittelpunkt
            </dt>
            <dd className="font-mono text-foreground" aria-live="polite">
              {formatLatLng(view.center)}
            </dd>
            <dd className="text-muted-foreground">· Zoom {view.zoom}</dd>
          </div>
          {marker && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">
                {marker.label ? marker.label : "Markierung"}
              </dt>
              <dd className="font-mono text-foreground">
                {formatLatLng(marker)}
              </dd>
            </div>
          )}
        </dl>
        {attribution && (
          <p className="shrink-0 text-muted-foreground">{attribution}</p>
        )}
      </div>

      {/* Bedienhinweis für Screenreader/Tastatur */}
      <p id={descId} className="sr-only">
        Pfeiltasten verschieben den Kartenausschnitt, Plus und Minus ändern die
        Zoomstufe. Mit gedrückter Maustaste lässt sich die Karte ziehen. Die
        aktuellen Koordinaten stehen als Text unter der Karte.
      </p>

      {/* Dynamische Ansage des Kartenquellen-Zustands (laden/Fehler) über die zentrale Live-Region. */}
      <StatusRegion
        message={source.state.message}
        politeness={announcePoliteness(source.state.status)}
        busy={source.state.status === "loading"}
      />
    </div>
  );
}
