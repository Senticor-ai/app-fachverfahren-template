// fachverfahren-kit/components/PdfViewer — barrierearmer PDF-Viewer für Nachweise/Bescheide.
//
// Zeigt ein PDF browser-nativ über <object data type="application/pdf"> mit <iframe>-Fallback und
// bietet IMMER einen Download-Link an (auch wenn die Inline-Anzeige scheitert oder vom Browser/Policy
// blockiert wird). Lädt das Dokument nicht selbst — der Browser rendert die URL. Lade-/Fehler-/Sperr-
// Zustand laufen über den EINEN ViewState-Vertrag (useViewState) + werden zentral angesagt.
//
// GENERISCH: keine Domänen-Literale — Titel/Dateiname/URL kommen aus props (kein „Bescheid"/„Hund").
// DEP-FREI: rein browser-nativ, KEIN pdfjs. Prod-Upgrade wäre ein pdfjs-Textlayer (durchsuchbarer,
// selektierbarer Text + zuverlässige a11y/Tagging) — bewusst NICHT importiert, um die Vorlage schlank
// und paketfrei zu halten. Der native <object>-Pfad nutzt den eingebauten PDF-Reader des Browsers,
// der seinerseits Zoom/Suche/Vorlesen mitbringt.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): echte <button>/<a>, Toolbar als role="toolbar" mit aria-label,
// jeder Button mit aria-label + sichtbarem Text, dekorative Icons aria-hidden, sichtbarer Fokus
// (focus-visible:ring via Button), Ziel-Größe >=24px, Sperr-/Fehler-Information nie nur über Farbe
// (Icon + Klartext), dynamische Meldungen über die zentrale Ansage (StatusRegion/announcePoliteness),
// motion-reduce respektiert (keine Animationen).
import * as React from "react";
import { Download, ExternalLink, FileText, Lock, Printer } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { ErrorState } from "./ErrorState.js";
import { useStatusRegion } from "./StatusRegion.js";
import { useViewState, announcePoliteness } from "../hooks/use-view-state.js";

export interface PdfViewerProps {
  /** Quelle des PDF-Dokuments (gleicher Origin oder erlaubtes CORS — der Browser rendert sie nativ). */
  url: string;
  /** Sichtbarer Titel in der Toolbar + Basis für aria-Label (Default: „Dokument"). */
  title?: string;
  /** Dateiname für den Download (Default: aus title/url abgeleitet). */
  filename?: string;
  /** Zugriff gesperrt (z. B. fehlende Berechtigung / noch nicht freigegeben) → Hinweis statt Inhalt. */
  restricted?: boolean;
  className?: string;
}

/** Leitet einen sicheren Download-Dateinamen aus filename/title/url ab (immer mit .pdf). */
function resolveFilename(filename: string | undefined, title: string, url: string): string {
  const base =
    filename?.trim() ||
    title.trim() ||
    decodeURIComponent(url.split(/[?#]/)[0]?.split("/").pop() ?? "").trim() ||
    "dokument";
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
}

/**
 * Barrierearmer, browser-nativer PDF-Viewer mit garantiertem Download-Fallback.
 *
 * @example
 * <PdfViewer url={nachweis.url} title={nachweis.bezeichnung} filename={nachweis.dateiname} />
 * <PdfViewer url={akte.url} title="Vorgang" restricted={!darfSehen} />
 */
export function PdfViewer({ url, title = "Dokument", filename, restricted = false, className }: PdfViewerProps) {
  const { announce } = useStatusRegion();
  const view = useViewState<{ url: string }>({
    initial: restricted ? "forbidden" : "loading",
    messages: {
      loading: "Dokument wird geladen …",
      ready: `${title} geladen.`,
      error: "Dokument konnte nicht geladen werden.",
      forbidden: "Für dieses Dokument fehlt die Berechtigung.",
    },
  });

  const downloadName = resolveFilename(filename, title, url);
  // Native PDF-Viewer-Hinweise an die URL hängen (vom Browser-Reader interpretiert, sonst ignoriert).
  const viewerSrc = `${url}${url.includes("#") ? "" : "#view=FitH"}`;

  // restricted ist ein Eingabe-Zustand → bei Änderung den ViewState resynchronisieren.
  React.useEffect(() => {
    if (restricted) view.set("forbidden");
    else view.start();
    // view-Methoden sind stabil (useCallback); nur auf restricted reagieren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted]);

  const status = view.state.status;
  const isRestricted = status === "forbidden";
  const isError = status === "error";
  const isLoading = status === "loading" || status === "idle";

  // Jede Transition zentral ansagen (loading/ready/error/forbidden).
  React.useEffect(() => {
    if (view.state.message) announce(view.state.message, announcePoliteness(status));
  }, [announce, status, view.state.message]);

  const handleLoaded = React.useCallback(() => {
    if (!restricted) view.succeed({ url });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted, url]);

  const handleError = React.useCallback(() => {
    if (!restricted) view.fail({ code: "render_failed" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restricted]);

  // Drucken: separates Fenster mit dem PDF öffnen und dessen Druckdialog auslösen. Schlägt das fehl
  // (Popup-Blocker), bleibt der „In neuem Tab öffnen"-/Download-Pfad als manueller Druckweg.
  const handlePrint = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const printWin = window.open(url, "_blank", "noopener");
    if (!printWin) {
      announce("Druck-Fenster wurde blockiert. Bitte das Dokument in einem neuen Tab öffnen und dort drucken.", "assertive");
      return;
    }
    const triggerPrint = () => {
      try {
        printWin.focus();
        printWin.print();
      } catch {
        // Cross-Origin/Policy kann window.print verhindern — das Dokument ist dennoch geöffnet.
      }
    };
    printWin.addEventListener?.("load", triggerPrint);
    // Fallback, falls das load-Event (bei nativem PDF-Plugin) nicht feuert.
    window.setTimeout(triggerPrint, 800);
  }, [url, announce]);

  const docLabel = `${title} (PDF)`;

  return (
    <section
      className={cn("flex flex-col overflow-hidden rounded-xl border border-border bg-card", className)}
      aria-label={docLabel}
    >
      {/* ── Toolbar ────────────────────────────────────────────────────────────── */}
      <div
        role="toolbar"
        aria-label={`Werkzeuge für ${title}`}
        aria-orientation="horizontal"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium text-foreground" title={title}>
            {title}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {/* Download — IMMER verfügbar, auch bei Sperre/Fehler. Echtes <a download>. */}
          <Button asChild size="sm" variant="outline" aria-label={`${title} herunterladen`}>
            <a href={url} download={downloadName}>
              <Download aria-hidden="true" />
              <span>Herunterladen</span>
            </a>
          </Button>

          {/* In neuem Tab öffnen — funktioniert unabhängig vom Inline-Render. */}
          <Button asChild size="sm" variant="ghost" aria-label={`${title} in neuem Tab öffnen`}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" />
              <span>Neuer Tab</span>
            </a>
          </Button>

          {/* Drucken — nur sinnvoll, wenn der Inhalt freigegeben ist. */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handlePrint}
            disabled={isRestricted}
            aria-label={`${title} drucken`}
          >
            <Printer aria-hidden="true" />
            <span>Drucken</span>
          </Button>
        </div>
      </div>

      {/* ── Inhalt: gesperrt → Hinweis · Fehler → ErrorState · sonst nativer Viewer ─ */}
      <div className="relative min-h-[28rem] flex-1 bg-surface">
        {isRestricted ? (
          <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-status-warn-soft text-status-warn">
              <Lock aria-hidden="true" className="size-6" />
            </span>
            <p className="font-medium text-foreground">Dokument gesperrt</p>
            <p className="max-w-prose text-sm text-muted-foreground">
              {view.state.message ?? "Für dieses Dokument fehlt die Berechtigung."} Sie können es bei Bedarf weiterhin
              herunterladen oder in einem neuen Tab öffnen.
            </p>
          </div>
        ) : isError ? (
          <div className="p-4">
            <ErrorState
              title="Dokument konnte nicht geladen werden"
              description="Die Vorschau konnte im Browser nicht angezeigt werden. Laden Sie das Dokument herunter oder öffnen Sie es in einem neuen Tab."
              icon={FileText}
              onRetry={() => view.start()}
              retryLabel="Erneut versuchen"
              actions={
                <>
                  <Button asChild size="sm" variant="outline" aria-label={`${title} herunterladen`}>
                    <a href={url} download={downloadName}>
                      <Download aria-hidden="true" />
                      <span>Herunterladen</span>
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" aria-label={`${title} in neuem Tab öffnen`}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden="true" />
                      <span>In neuem Tab öffnen</span>
                    </a>
                  </Button>
                </>
              }
            />
          </div>
        ) : (
          <>
            {isLoading && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface"
              >
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="size-4" />
                  Dokument wird geladen …
                </span>
              </div>
            )}
            {/*
              Browser-nativer PDF-Pfad: <object> rendert den eingebauten Reader (Zoom/Suche/Vorlesen).
              Kann der Browser application/pdf nicht inline darstellen, greift der <object>-Body:
              ein <iframe>-Fallback und — falls auch das scheitert — IMMER der Download-/Tab-Link.
            */}
            <object
              data={viewerSrc}
              type="application/pdf"
              aria-label={docLabel}
              title={docLabel}
              className="h-full min-h-[28rem] w-full"
              onLoad={handleLoaded}
              onError={handleError}
            >
              <iframe
                src={viewerSrc}
                title={docLabel}
                className="h-full min-h-[28rem] w-full border-0"
                onLoad={handleLoaded}
                onError={handleError}
              />
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <FileText aria-hidden="true" className="size-8 text-muted-foreground" />
                <p className="font-medium text-foreground">Vorschau nicht verfügbar</p>
                <p className="max-w-prose text-sm text-muted-foreground">
                  Ihr Browser kann dieses PDF nicht direkt anzeigen. Bitte laden Sie das Dokument herunter oder öffnen
                  Sie es in einem neuen Tab.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild size="sm" variant="default" aria-label={`${title} herunterladen`}>
                    <a href={url} download={downloadName}>
                      <Download aria-hidden="true" />
                      <span>Herunterladen</span>
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" aria-label={`${title} in neuem Tab öffnen`}>
                    <a href={url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden="true" />
                      <span>In neuem Tab öffnen</span>
                    </a>
                  </Button>
                </div>
              </div>
            </object>
          </>
        )}
      </div>
    </section>
  );
}
