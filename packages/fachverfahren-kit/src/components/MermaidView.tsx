// MermaidView — robuste Mermaid-Diagramm-Anzeige für das Kit (aus einer produktionserprobten Builder-Pipeline portiert).
//
// Robustheit (für agent-/LLM-generierte Diagramme): VORVERARBEITUNG (normalizeMermaid: Entities/\n/Zaun) →
// parse-first (suppressErrors, kein „Syntax-error"-Bombe im DOM) → ELK-Layout (knoten-ausweichendes Routing) mit
// dagre-Fallback → DOMPurify-Sanitisierung → Vollbild-Zoom/Pan. Alles dep-MIT (mermaid · @mermaid-js/layout-elk ·
// isomorphic-dompurify). Generisch, barrierefrei.
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import { ErrorState } from "./ErrorState.js";
import { useStatusRegion } from "./StatusRegion.js";
import { SkeletonCard } from "../ui/skeleton.js";

// Mermaid hängt bei fehlschlagendem render() gelegentlich verwaiste „Syntax error"-SVGs an document.body. Diese
// Sammelreinigung entfernt jede solche Waise, die nicht in einem gerenderten Diagramm-Container hängt.
function sweepMermaidOrphans(): void {
  if (typeof document === "undefined") return;
  try {
    document
      .querySelectorAll(
        'svg[aria-roledescription="error"], svg[id^="mermaid-"], div[id^="dmermaid"], .error-text',
      )
      .forEach((n) => {
        const host = n.closest("[data-mermaid-host]");
        if (!host) (n.closest("svg") ?? n).remove();
      });
  } catch {
    /* defensiv */
  }
}

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(async (m) => {
      // ELK-Layout: orthogonales Kanten-Routing, das Knoten AUSWEICHT (mermaids Default-dagre kann das nicht).
      // Best-effort: scheitert der ELK-Import, greift dagre (kein Crash).
      try {
        const elk = await import("@mermaid-js/layout-elk");
        m.default.registerLayoutLoaders(elk.default);
      } catch {
        /* dagre-Fallback */
      }
      m.default.initialize({
        startOnLoad: false,
        layout: "elk",
        elk: { nodePlacementStrategy: "BRANDES_KOEPF", mergeEdges: false },
        theme: "base",
        securityLevel: "strict",
        suppressErrorRendering: true,
        fontFamily:
          '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        // htmlLabels:false → SVG-<text> statt <foreignObject> (sonst entfernt DOMPurify die Labels → leere Boxen).
        htmlLabels: false,
        themeVariables: {
          fontSize: "14px",
          fontFamily: '"Inter", ui-sans-serif, system-ui, sans-serif',
          primaryColor: "#eef2f7",
          primaryBorderColor: "#94a3b8",
          primaryTextColor: "#0f172a",
          secondaryColor: "#e2e8f0",
          tertiaryColor: "#f8fafc",
          lineColor: "#64748b",
          textColor: "#1e293b",
          mainBkg: "#f8fafc",
          clusterBkg: "#f8fafc",
          clusterBorder: "#cbd5e1",
          edgeLabelBackground: "#ffffff",
          titleColor: "#0f172a",
          actorBkg: "#eef2f7",
          actorBorder: "#94a3b8",
          noteBkgColor: "#fef9c3",
          noteBorderColor: "#facc15",
        },
        flowchart: {
          htmlLabels: false,
          useMaxWidth: true,
          nodeSpacing: 54,
          rankSpacing: 64,
          padding: 18,
          diagramPadding: 12,
          curve: "basis",
        },
        sequence: {
          useMaxWidth: true,
          boxMargin: 10,
          noteMargin: 10,
          messageMargin: 38,
          mirrorActors: false,
        },
        er: { useMaxWidth: true, entityPadding: 14 },
        journey: { useMaxWidth: false, diagramMarginX: 24, diagramMarginY: 12 },
        gantt: { useMaxWidth: false },
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

/**
 * normalizeMermaid — VORVERARBEITUNG des (oft agent-generierten) Mermaid-Quelltexts. Behebt die häufigsten Render-/
 * Parse-Brecher an der Wurzel: ```-Zaun-Reste, HTML-Entities, literales \n→<br/>, Whitespace. Idempotent, konservativ.
 */
export function normalizeMermaid(src: string): string {
  let s = src ?? "";
  s = s
    .replace(/^\s*```(?:mermaid)?[ \t]*\r?\n?/i, "")
    .replace(/\r?\n?```[ \t]*$/i, "");
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
  s = s.replace(/\\n/g, "<br/>");
  s = s
    .split("\n")
    .map((l) => l.replace(/\t/g, "    ").replace(/[ \t]+$/, ""))
    .join("\n")
    .trim();
  return s;
}

/**
 * MermaidView / MermaidDiagram — rendert EIN Mermaid-Diagramm robust (parse-first, ELK→dagre-Fallback, sanitisiert)
 * und bietet Vollbild-Zoom/Pan. `memo` auf `code` stabilisiert: re-rendert das Elternelement (Live-Polls), bleibt das
 * SVG stehen statt zu flackern.
 */
export interface MermaidViewProps {
  /** Mermaid-Quelltext des Diagramms. */
  code: string;
  /** Überschreibt die Fehler-Überschrift (Default: „Diagramm konnte nicht dargestellt werden"). */
  errorTitle?: string | undefined;
  /** Zusätzliche Beschriftung/Kontext für den Lade-Platzhalter (Screenreader-Ansage). */
  loadingLabel?: string | undefined;
  /** Blendet den Roh-Quelltext-Ausweg (<details>) im Fehlerfall aus (Default: anzeigen). */
  showSourceOnError?: boolean | undefined;
  /** Zusätzliche Recovery-Affordances neben „Erneut versuchen" (z. B. Quelle kopieren). */
  errorActions?: ReactNode;
}

export const MermaidView = memo(
  function MermaidView({
    code,
    errorTitle,
    loadingLabel,
    showSourceOnError = true,
    errorActions,
  }: MermaidViewProps) {
    const id = useId().replace(/:/g, "_");
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [attempt, setAttempt] = useState(0);
    const [zoomed, setZoomed] = useState(false);
    const { announce } = useStatusRegion();

    const retry = useCallback(() => {
      setAttempt((n) => n + 1);
    }, []);

    useEffect(() => {
      let cancelled = false;
      setError(null);
      setLoading(true);
      (async () => {
        try {
          const mermaid = await loadMermaid();
          const normalized = normalizeMermaid(code);
          let valid = false;
          try {
            valid = !!(await mermaid.parse(normalized, {
              suppressErrors: true,
            }));
          } catch {
            valid = false;
          }
          if (!valid) {
            sweepMermaidOrphans();
            if (!cancelled) {
              setError("Syntaxfehler im Diagramm");
              setLoading(false);
              announce(
                "Diagramm konnte nicht dargestellt werden.",
                "assertive",
              );
            }
            return;
          }
          // ELK zuerst; wirft render(), Fallback auf dagre (per-Diagramm-Direktive) → nie ein „Render-Fehler".
          let raw: string;
          try {
            ({ svg: raw } = await mermaid.render(`mmd-${id}`, normalized));
          } catch {
            sweepMermaidOrphans();
            ({ svg: raw } = await mermaid.render(
              `mmd-${id}-dagre`,
              `%%{init: {"layout":"dagre"}}%%\n${normalized}`,
            ));
          }
          const { default: DOMPurify } = await import("isomorphic-dompurify");
          const safe = DOMPurify.sanitize(raw, {
            USE_PROFILES: { svg: true, svgFilters: true },
          });
          sweepMermaidOrphans();
          if (!cancelled) {
            setSvg(safe);
            setLoading(false);
            announce("Diagramm dargestellt.", "polite");
          }
        } catch (e) {
          sweepMermaidOrphans();
          if (!cancelled) {
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
            announce("Diagramm konnte nicht dargestellt werden.", "assertive");
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [code, id, attempt, announce]);

    if (error) {
      return (
        <div className="my-2">
          <ErrorState
            title={errorTitle ?? "Diagramm konnte nicht dargestellt werden"}
            description="Das Diagramm konnte nicht aus dem Quelltext erzeugt werden. Sie können es erneut versuchen oder den Quelltext unten einsehen."
            onRetry={retry}
            actions={errorActions}
          />
          {showSourceOnError && (
            <details className="mt-2 rounded-md border border-border bg-surface-2/40 p-3 text-xs">
              <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                Quelltext des Diagramms anzeigen
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {code}
              </pre>
            </details>
          )}
        </div>
      );
    }

    if (loading) {
      return (
        <div className="my-3" aria-busy="true">
          <SkeletonCard className="bg-surface" />
          <span className="sr-only">
            {loadingLabel ?? "Diagramm wird dargestellt …"}
          </span>
        </div>
      );
    }

    return (
      <>
        <button
          type="button"
          data-mermaid-host
          onClick={() => setZoomed(true)}
          title="Klicken: Vollbild mit Zoom + Pan"
          className="group relative my-3 block w-full cursor-zoom-in rounded-lg ring-1 ring-border bg-surface p-3 overflow-x-auto text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:max-w-full [&_svg]:h-auto"
          aria-label="Mermaid-Diagramm — klicken zum Vergrößern"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        {zoomed && (
          <MermaidZoomModal svg={svg} onClose={() => setZoomed(false)} />
        )}
      </>
    );
  },
  (a, b) => a.code === b.code,
);

/** Alias für die Kit-API. */
export const MermaidDiagram = MermaidView;

/** Vollbild-Modal mit Zoom (Mausrad / +–) + Pan (ziehen) zum genauen Betrachten eines Diagramms. */
function MermaidZoomModal({
  svg,
  onClose,
}: {
  svg: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(
    null,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };
  const onWheel = (e: ReactWheelEvent) => {
    e.preventDefault();
    setScale((s) =>
      Math.min(8, Math.max(0.3, s * (e.deltaY < 0 ? 1.12 : 0.89))),
    );
  };
  const onDown = (e: ReactMouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onMove = (e: ReactMouseEvent) => {
    const d = drag.current;
    if (!d) return;
    setTx(d.tx + (e.clientX - d.x));
    setTy(d.ty + (e.clientY - d.y));
  };
  const onUp = () => {
    drag.current = null;
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Diagramm Vollbild"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 border-b border-white/10 bg-surface px-4 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-medium text-foreground">
          Diagramm · Vollbild
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.3, s * 0.8))}
            className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Verkleinern"
            aria-label="Verkleinern"
          >
            −
          </button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(8, s * 1.25))}
            className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Vergrößern"
            aria-label="Vergrößern"
          >
            +
          </button>
          <button
            onClick={reset}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Zurücksetzen"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="ml-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Schließen (Esc)"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        onMouseLeave={onUp}
      >
        <div
          className="flex h-full w-full items-center justify-center [&_svg]:max-w-none"
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: drag.current ? "none" : "transform 0.08s",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
