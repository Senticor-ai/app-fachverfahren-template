// fachverfahren-kit/components/SignaturePad — generisches Unterschriften-Feld (Canvas), DEP-FREI.
//
// Zweck: eine handschriftliche Unterschrift auf einer Zeichenfläche erfassen (Maus + Touch + Stift über die
// einheitliche Pointer-Events-API), wieder löschen und als Bild AUSGEBEN — entweder als DataURL (synchron, für
// Vorschau/Einbettung) oder als Blob (für den Upload über den Port). Linien werden geglättet (quadratische
// Bézier-Kurven über die Mittelpunkte aufeinanderfolgender Punkte), damit der Strich nicht eckig wirkt.
//
// VOLLSTÄNDIG GENERISCH: keine Domänen-Literale — Beschriftung/Hinweise kommen aus props (mit neutralem Default).
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): Eine Zeichenfläche ist für Tastatur-Nutzer:innen und Menschen mit
// motorischen Einschränkungen NICHT bedienbar — deshalb wird PROMINENT ein Tastatur-/Alternativ-Hinweis gerendert
// (`tastaturHinweis`), der auf einen barrierefreien Ersatzweg verweist. Die Canvas trägt role="img" + aria-label,
// der Status (leer/unterschrieben) wird in einer aria-live-Region gemeldet, Bedien-Buttons sind >=24px, der Fokus-
// Ring ist sichtbar, Übergänge respektieren prefers-reduced-motion. Farbe ist nie das alleinige Unterscheidungs-
// merkmal (Text + Icon begleiten jeden Status).
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { Eraser, Info, PenLine, SignatureIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";

/** Ausgabe-Format der erfassten Unterschrift (PNG). */
export type SignaturFormat = "image/png";

export interface SignaturePadProps {
  /**
   * Wird gerufen, sobald sich die Unterschrift ändert (Strich beendet ODER gelöscht).
   * `dataUrl` ist `null`, wenn die Fläche leer ist, sonst eine PNG-DataURL der aktuellen Unterschrift.
   */
  onChange?: (dataUrl: string | null) => void;
  /** Sichtbare Überschrift des Felds (generisch). */
  titel?: string;
  /** Erklärender Hinweistext unter der Überschrift. */
  beschreibung?: string;
  /**
   * Barrierefreier Tastatur-/Alternativ-Hinweis: wie Nutzer:innen ohne Maus/Touch unterschreiben oder
   * eine Unterschrift einreichen können (z.B. „Belegen Sie alternativ über … oder reichen Sie eine
   * eingescannte Unterschrift als Datei ein."). Wird IMMER sichtbar gerendert.
   */
  tastaturHinweis?: string;
  /** aria-label der Zeichenfläche (beschreibt, was gezeichnet wird). */
  ariaLabel?: string;
  /** Höhe der Zeichenfläche in CSS-Pixeln (Breite ist responsiv = 100 %). Default 180. */
  hoehe?: number;
  /** Strichstärke in Geräte-Pixeln. Default 2.5. */
  strichstaerke?: number;
  className?: string;
}

/** Ein erfasster Punkt in CSS-Koordinaten relativ zur Canvas. */
interface Punkt {
  x: number;
  y: number;
}

/**
 * Unterschriften-Feld. Hält die gezeichneten Linien (Arrays von Punkten) als Quelle der Wahrheit und rendert
 * sie geglättet auf die Canvas — so kann nach DPR-Wechsel/Resize verlustfrei neu gezeichnet werden.
 */
export function SignaturePad({
  onChange,
  titel = "Unterschrift",
  beschreibung = "Unterschreiben Sie im Feld mit Maus, Finger oder Stift.",
  tastaturHinweis = "Dieses Feld erfordert Maus, Touch oder Stift. Können Sie nicht zeichnen, reichen Sie die Unterschrift bitte als Datei (z.B. eingescannt) ein oder wenden Sie sich an die zuständige Stelle.",
  ariaLabel = "Unterschriftenfeld",
  hoehe = 180,
  strichstaerke = 2.5,
  className,
}: SignaturePadProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Quelle der Wahrheit: abgeschlossene Linien + die gerade in Arbeit befindliche Linie.
  const linienRef = useRef<Punkt[][]>([]);
  const aktuelleLinieRef = useRef<Punkt[] | null>(null);
  const zeichnetRef = useRef(false);

  const [hatInhalt, setHatInhalt] = useState(false);
  const [statusMeldung, setStatusMeldung] = useState("");

  const hinweisId = useId();
  const statusId = useId();

  /** Liefert den 2D-Kontext der Canvas (oder null). */
  const getCtx = useCallback((): CanvasRenderingContext2D | null => {
    return canvasRef.current?.getContext("2d") ?? null;
  }, []);

  /** Zeichnet eine einzelne Linie geglättet (quadratische Bézier über Mittelpunkte). */
  const zeichneLinie = useCallback(
    (ctx: CanvasRenderingContext2D, punkte: Punkt[]) => {
      if (punkte.length === 0) return;
      ctx.lineWidth = strichstaerke;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Aktuelle Vordergrundfarbe aus dem Theme übernehmen (Token, kein Hex): wir lesen die berechnete
      // `color` der Canvas, die per Tailwind-Klasse auf das foreground-Token gesetzt ist.
      const el = canvasRef.current;
      ctx.strokeStyle = el ? getComputedStyle(el).color : "currentColor";

      if (punkte.length === 1) {
        // Einzelner Tipp → kleiner Punkt, damit auch ein kurzer Klick sichtbar ist.
        const p = punkte[0]!;
        ctx.beginPath();
        ctx.arc(p.x, p.y, strichstaerke / 2, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(punkte[0]!.x, punkte[0]!.y);
      for (let i = 1; i < punkte.length - 1; i++) {
        const aktuell = punkte[i]!;
        const naechster = punkte[i + 1]!;
        const mx = (aktuell.x + naechster.x) / 2;
        const my = (aktuell.y + naechster.y) / 2;
        ctx.quadraticCurveTo(aktuell.x, aktuell.y, mx, my);
      }
      const vorletzter = punkte[punkte.length - 2]!;
      const letzter = punkte[punkte.length - 1]!;
      ctx.quadraticCurveTo(vorletzter.x, vorletzter.y, letzter.x, letzter.y);
      ctx.stroke();
    },
    [strichstaerke],
  );

  /** Komplettes Neuzeichnen aller Linien (nach Resize/DPR-Wechsel oder Strich-Ende). */
  const neuZeichnen = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const linie of linienRef.current) zeichneLinie(ctx, linie);
    const aktuell = aktuelleLinieRef.current;
    if (aktuell) zeichneLinie(ctx, aktuell);
  }, [getCtx, zeichneLinie]);

  /** Canvas an Containerbreite + Geräte-Pixeldichte anpassen (scharfe Linien). */
  const skaliereCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const breite = container.clientWidth;
    canvas.width = Math.round(breite * dpr);
    canvas.height = Math.round(hoehe * dpr);
    canvas.style.width = `${breite}px`;
    canvas.style.height = `${hoehe}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    neuZeichnen();
  }, [hoehe, neuZeichnen]);

  // Initiale Skalierung + Reaktion auf Größenänderungen des Containers.
  useEffect(() => {
    skaliereCanvas();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => skaliereCanvas());
    ro.observe(container);
    return () => ro.disconnect();
  }, [skaliereCanvas]);

  /** Pointer-Koordinaten in Canvas-CSS-Koordinaten umrechnen. */
  const punktAus = (e: ReactPointerEvent<HTMLCanvasElement>): Punkt => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  /** Meldet die aktuelle Unterschrift als DataURL (oder null) nach oben + setzt den Status. */
  const meldeAenderung = useCallback(() => {
    const leer = linienRef.current.length === 0;
    setHatInhalt(!leer);
    setStatusMeldung(
      leer ? "Unterschriftenfeld ist leer." : "Unterschrift erfasst.",
    );
    if (!onChange) return;
    if (leer) {
      onChange(null);
      return;
    }
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }, [onChange]);

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    // Nur primärer Knopf / Touch / Stift.
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    zeichnetRef.current = true;
    aktuelleLinieRef.current = [punktAus(e)];
    neuZeichnen();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!zeichnetRef.current || !aktuelleLinieRef.current) return;
    e.preventDefault();
    aktuelleLinieRef.current.push(punktAus(e));
    neuZeichnen();
  };

  const beendeStrich = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!zeichnetRef.current) return;
    zeichnetRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const linie = aktuelleLinieRef.current;
    aktuelleLinieRef.current = null;
    if (linie && linie.length > 0) {
      linienRef.current = [...linienRef.current, linie];
      meldeAenderung();
    }
    neuZeichnen();
  };

  /** Setzt die Fläche zurück (löscht alle Linien). */
  const loeschen = () => {
    linienRef.current = [];
    aktuelleLinieRef.current = null;
    zeichnetRef.current = false;
    neuZeichnen();
    meldeAenderung();
  };

  return (
    <section
      className={cn("rounded-md border border-border bg-card p-5", className)}
      aria-label={titel}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <SignatureIcon
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            {titel}
          </h2>
          {beschreibung && (
            <p className="mt-1 text-sm text-muted-foreground">{beschreibung}</p>
          )}
        </div>

        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide",
            hatInhalt
              ? "border-status-ok/30 bg-status-ok-soft text-foreground"
              : "border-border bg-secondary text-foreground",
          )}
        >
          <PenLine
            className={cn(
              "h-3 w-3",
              hatInhalt ? "text-status-ok" : "text-muted-foreground",
            )}
            aria-hidden="true"
          />
          {hatInhalt ? "Unterschrieben" : "Leer"}
        </span>
      </div>

      {/* Zeichenfläche: Container misst die Breite, Canvas füllt sie. touch-none, damit Touch-Striche nicht scrollen. */}
      <div ref={containerRef} className="mt-4">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={cn(hinweisId, statusId)}
          tabIndex={-1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={beendeStrich}
          onPointerCancel={beendeStrich}
          onPointerLeave={beendeStrich}
          className={cn(
            "block w-full touch-none rounded-md border border-border bg-background text-foreground",
            "cursor-crosshair transition-colors ease-out motion-reduce:transition-none",
          )}
          style={{ height: hoehe }}
        />
      </div>

      {/* Statusmeldung für assistive Technik (leer / unterschrieben). */}
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {statusMeldung}
      </p>

      {/* Bedienleiste: Löschen. */}
      <div className="mt-3 flex items-center justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loeschen}
          disabled={!hatInhalt}
          aria-disabled={!hatInhalt}
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
          Löschen
        </Button>
      </div>

      {/* PFLICHT-Tastatur-/Alternativ-Hinweis: immer sichtbar, da die Canvas tastaturunbedienbar ist. */}
      <p
        id={hinweisId}
        className="mt-3 flex items-start gap-2 rounded-sm border border-border bg-background p-3 text-sm text-muted-foreground"
      >
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tastaturHinweis}</span>
      </p>
    </section>
  );
}
