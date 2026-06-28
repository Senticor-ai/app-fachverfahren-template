// fachverfahren-kit/components/OfficeDocViewer — Vorschau für Office-Dokumente (DOC[X]/XLS[X]/ODT/ODS) OHNE Editor.
//
// Zweck: Office-Formate lassen sich nicht dep-frei im Browser nativ einbetten. Deshalb zeigt diese Komponente
// einen optional SERVERSEITIG vorgerenderten HTML-Block (`renderedHtml`) — clientseitig mit isomorphic-dompurify
// sanitisiert (XSS-Schutz). Liegt kein vorgerenderter HTML vor, gibt es KEINE Inline-Vorschau: dann erscheint ein
// klarer „nicht unterstützt"-Zustand mit dem Original-Download. Tritt beim Sanitisieren ein Fehler auf → Fehler-
// Zustand mit Recovery. Der Download des Originals ist in JEDEM Zustand erreichbar.
//
// GENERISCH + DEP-FREI (außer der bereits vorhandenen isomorphic-dompurify): keine Domänen-Literale, alle Inhalte
// kommen aus props; KEIN pdfjs/mammoth/sheetjs. Zustände laufen über den EINEN Vertrag (useViewState/ViewStateBoundary).
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): semantischer <section>/<article>-Block, der vorgerenderte Inhalt liegt in
// einer scrollbaren Region mit role="region" + aria-label; der Download ist ein echter, tastaturbedienbarer <a> mit
// sichtbarem Fokus-Ring und >=24px Zielgröße; Icons sind dekorativ (aria-hidden); Information nie nur über Farbe
// (Icon + Text begleiten jeden Zustand); Übergänge respektieren prefers-reduced-motion; Zustandswechsel werden
// zentral über die StatusRegion angesagt (ViewStateBoundary).
import * as React from "react";
import { FileSpreadsheet, Download, FileWarning } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";

import { cn } from "../lib/utils.js";
import { useViewState } from "../hooks/use-view-state.js";
import { ViewStateBoundary } from "./ViewStateBoundary.js";

export interface OfficeDocViewerProps {
  /** Anzeigename der Datei (z. B. „Antrag.docx", „Auswertung.xlsx"). */
  filename: string;
  /** URL des Originals — für den Download (immer erreichbar). */
  downloadUrl: string;
  /**
   * Serverseitig vorgerenderter HTML-Inhalt der Datei (optional). Wird clientseitig mit
   * isomorphic-dompurify sanitisiert, bevor er angezeigt wird. Fehlt er → Zustand „nicht unterstützt".
   */
  renderedHtml?: string | undefined;
  /** MIME-Typ der Quelle (informativ, für die Metazeile). */
  mime?: string | undefined;
  /** Sichtbare Überschrift (generisch). */
  titel?: string;
  /** Höhe des Inhaltsbereichs in CSS-Pixeln. Default 480. */
  hoehe?: number;
  className?: string;
}

/** Daten des „ready"-Zustands: der bereits sanitisierte HTML-Block. */
interface RenderedDoc {
  readonly safeHtml: string;
}

/**
 * Sanitisiert vorgerenderten Office-HTML defensiv: nur Inhalts-Markup, keine Skripte/Event-Handler,
 * keine externen Objekte/iframes. Gibt den bereinigten String zurück (kann leer sein, wenn alles entfernt wurde).
 */
function sanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "link", "base"],
    FORBID_ATTR: ["style", "srcset"],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Vorschau für Office-Dokumente OHNE Editor. Rein props-getrieben.
 *
 * @example
 * <OfficeDocViewer
 *   filename="Auswertung.xlsx"
 *   downloadUrl={objectUrl}
 *   renderedHtml={serverHtml}      // optional; ohne ihn: „nicht unterstützt" + Download
 *   mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
 * />
 */
export function OfficeDocViewer({
  filename,
  downloadUrl,
  renderedHtml,
  mime,
  titel = "Dokument-Vorschau",
  hoehe = 480,
  className,
}: OfficeDocViewerProps): React.ReactElement {
  // EIN Zustandsvertrag: empty == „nicht unterstützt" (kein vorgerenderter HTML, nur Download),
  // ready == sanitisierter HTML liegt vor, error == Sanitisierung schlug fehl.
  const view = useViewState<RenderedDoc>({
    messages: {
      ready: "Vorschau geladen.",
      empty: "Für dieses Dateiformat steht keine Inline-Vorschau zur Verfügung.",
      error: "Die Vorschau konnte nicht aufbereitet werden.",
    },
  });

  const name = filename && filename.trim().length > 0 ? filename : "Dokument";
  const contentId = React.useId();

  // Sanitisierung läuft synchron-deterministisch bei Änderung der Quelle.
  React.useEffect(() => {
    const raw = typeof renderedHtml === "string" ? renderedHtml.trim() : "";
    if (raw.length === 0) {
      // Kein vorgerenderter Inhalt → unsupported (empty), Download bleibt erreichbar.
      view.set("empty");
      return;
    }
    try {
      const safeHtml = sanitize(raw);
      if (safeHtml.trim().length === 0) {
        // Nach der Bereinigung blieb nichts Darstellbares übrig → wie unsupported behandeln.
        view.set("empty");
        return;
      }
      view.succeed({ safeHtml });
    } catch (err) {
      view.fail(err);
    }
    // view-API ist stabil (useCallback in useViewState); Quelle ist die einzige echte Abhängigkeit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderedHtml]);

  return (
    <section
      className={cn("overflow-hidden rounded-md border border-border bg-card", className)}
      aria-label={titel}
    >
      {/* Kopf: Icon + Name/Meta + Download (Download IMMER erreichbar). */}
      <header className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground"
            aria-hidden="true"
          >
            <FileSpreadsheet className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground" title={name}>
              {name}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {mime ? mime : "Office-Dokument"}
            </div>
          </div>
        </div>

        <DownloadLink url={downloadUrl} name={name} />
      </header>

      {/* Inhaltsbereich über den EINEN Zustandsvertrag. empty == „nicht unterstützt" mit Download. */}
      <div className="bg-background p-2">
        <ViewStateBoundary<RenderedDoc>
          state={view.state}
          emptyTitle="Keine Inline-Vorschau verfügbar"
          empty={<UnsupportedZustand name={name} url={downloadUrl} hoehe={hoehe} />}
        >
          {(doc) => (
            <article
              id={contentId}
              role="region"
              aria-label={`Inhalt von ${name}`}
              tabIndex={0}
              className={cn(
                "office-doc max-w-none overflow-auto rounded-sm border border-border bg-card px-5 py-4 text-sm text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
                "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:bg-accent [&_th]:text-left",
                "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_a]:underline [&_a]:text-primary",
              )}
              style={{ maxHeight: hoehe }}
              // Inhalt ist VOR dem Setzen sanitisiert (isomorphic-dompurify). Kein roher Fremd-HTML.
              dangerouslySetInnerHTML={{ __html: doc.safeHtml }}
            />
          )}
        </ViewStateBoundary>
      </div>
    </section>
  );
}

/** Echter, tastaturbedienbarer Download-Link mit sichtbarem Fokus-Ring und >=24px Zielgröße. */
function DownloadLink({ url, name }: { url: string; name: string }): React.ReactElement {
  return (
    <a
      href={url}
      download={name}
      className={cn(
        "inline-flex h-8 min-h-[24px] shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground",
        "transition-colors duration-150 ease-out hover:bg-accent motion-reduce:transition-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Herunterladen</span>
      <span className="sr-only"> — {name}</span>
    </a>
  );
}

/**
 * „Nicht unterstützt"-Zustand: kein (sinnvoller) vorgerenderter HTML → klare Meldung + Original-Download.
 * Als role="status" für assistive Technik; Information über Icon + Text, nie nur über Farbe.
 */
function UnsupportedZustand({
  name,
  url,
  hoehe,
}: {
  name: string;
  url: string;
  hoehe: number;
}): React.ReactElement {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-border bg-card px-6 py-12 text-center"
      style={{ minHeight: hoehe }}
    >
      <span
        className="flex size-12 items-center justify-center rounded-lg bg-accent text-muted-foreground"
        aria-hidden="true"
      >
        <FileWarning className="size-6" />
      </span>
      <div className="max-w-prose space-y-1">
        <p className="text-sm font-medium text-foreground">Keine Inline-Vorschau verfügbar</p>
        <p className="text-sm text-muted-foreground">
          Für „{name}" steht in diesem Format keine eingebettete Vorschau zur Verfügung. Laden Sie die
          Datei herunter, um sie in Ihrer Office-Anwendung zu öffnen.
        </p>
      </div>
      <DownloadLink url={url} name={name} />
    </div>
  );
}
