// fachverfahren-kit/components/DocumentPreview — generische Nachweis-/Bescheid-Vorschau, DEP-FREI.
//
// Zweck: ein einzelnes Dokument (Nachweis, Bescheid, Anlage) inline VORSCHAUEN — Bilder direkt als <img>, PDFs
// eingebettet über <iframe>/<embed> mit `title`, alle übrigen Typen als ruhiger Fallback mit Datei-Metadaten.
// Immer mit Datei-Name, lesbarer Größe und einem barrierefreien Download-Link. Behandelt sauber den LEEREN
// (kein Dokument) und den FEHLER-Zustand (Quelle nicht ladbar).
//
// REIN PROPS-GETRIEBEN: keine eigene I/O, kein State außer dem Bild-Lade-Fehler — die `url` (Object-URL,
// Data-URL oder http(s)) und die Metadaten kommen vollständig von außen. KEINE Domänen-Literale.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): eingebettete Frames tragen `title`, Bilder ein aussagekräftiges `alt`,
// der Lade-Fehler wird mit role="alert" gemeldet, der leere Zustand mit role="status"/aria-live, der Download-
// Link ist ein echter, tastaturbedienbarer Link mit Fokus-Ring und >=24px Zielgröße, Farbe ist nie alleiniges
// Unterscheidungsmerkmal (Icon + Text begleiten jeden Zustand), Übergänge respektieren prefers-reduced-motion.
import { useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  FileWarning,
  ImageIcon,
} from "lucide-react";

import { cn } from "../lib/utils.js";

/** Grobe Dokumentart — steuert, wie vorgeschaut wird. */
export type DokumentArt = "bild" | "pdf" | "andere";

export interface DocumentPreviewProps {
  /**
   * Quelle des Dokuments (Object-URL, Data-URL oder http(s)-URL). `undefined`/`null` → leerer Zustand.
   */
  url?: string | null;
  /** Anzeigename der Datei (z.B. „Meldebescheinigung.pdf"). */
  dateiname?: string;
  /** MIME-Typ der Datei (z.B. „application/pdf", „image/png"). Bestimmt zusammen mit dem Namen die `DokumentArt`. */
  mimeTyp?: string;
  /** Dateigröße in Bytes (für die lesbare Anzeige). */
  groesse?: number;
  /** Sichtbare Überschrift (generisch). */
  titel?: string;
  /** Höhe der Einbettung (Bild/PDF) in CSS-Pixeln. Default 420. */
  hoehe?: number;
  /** Erzwingt den Fehler-Zustand von außen (z.B. wenn das Laden der Quelle bereits fehlschlug). */
  fehler?: boolean;
  /** Inhalt des leeren Zustands (überschreibt den Default-Text). */
  leerHinweis?: ReactNode;
  /** Download anbieten (Default true). Aus, wenn die Quelle nicht heruntergeladen werden darf. */
  download?: boolean;
  className?: string;
}

/** Bytes menschenlesbar formatieren (de-DE, dep-frei). */
function formatGroesse(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const einheiten = ["KB", "MB", "GB", "TB"];
  let wert = bytes / 1024;
  let i = 0;
  while (wert >= 1024 && i < einheiten.length - 1) {
    wert /= 1024;
    i += 1;
  }
  const gerundet = wert >= 10 || Number.isInteger(wert) ? Math.round(wert) : Math.round(wert * 10) / 10;
  return `${new Intl.NumberFormat("de-DE").format(gerundet)} ${einheiten[i]}`;
}

/** Dokumentart aus MIME-Typ + Dateiendung ableiten (MIME hat Vorrang). */
function bestimmeArt(mimeTyp: string | undefined, dateiname: string | undefined): DokumentArt {
  const mime = (mimeTyp ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "bild";
  if (mime === "application/pdf") return "pdf";
  const name = (dateiname ?? "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return "bild";
  if (ext === "pdf") return "pdf";
  return "andere";
}

/**
 * Vorschau eines einzelnen Dokuments. Rein props-getrieben: rendert leeren Zustand, Fehler-Zustand oder die
 * passende Einbettung (Bild/PDF/Fallback) + Kopf mit Name/Größe + Download-Link.
 */
export function DocumentPreview({
  url,
  dateiname,
  mimeTyp,
  groesse,
  titel = "Vorschau",
  hoehe = 420,
  fehler = false,
  leerHinweis,
  download = true,
  className,
}: DocumentPreviewProps): ReactElement {
  const [bildFehler, setBildFehler] = useState(false);
  const statusId = useId();

  // Bild-Ladefehler zurücksetzen, sobald sich die Quelle ändert.
  useEffect(() => {
    setBildFehler(false);
  }, [url]);

  const hatQuelle = typeof url === "string" && url.length > 0;
  const art = bestimmeArt(mimeTyp, dateiname);
  const istFehler = fehler || (art === "bild" && bildFehler);
  const name = dateiname && dateiname.trim().length > 0 ? dateiname : "Dokument";
  const frameTitel = `${titel}: ${name}`;

  return (
    <section
      className={cn("overflow-hidden rounded-md border border-border bg-card", className)}
      aria-label={titel}
    >
      {/* Kopf: Icon + Name/Größe + Download. */}
      <header className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-muted-foreground"
            aria-hidden="true"
          >
            {art === "bild" ? (
              <ImageIcon className="size-4" />
            ) : (
              <FileText className="size-4" />
            )}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground" title={name}>
              {name}
            </div>
            <div className="text-[12px] tabular-nums text-muted-foreground">
              {groesse !== undefined ? formatGroesse(groesse) : "Größe unbekannt"}
              {mimeTyp && <> · {mimeTyp}</>}
            </div>
          </div>
        </div>

        {download && hatQuelle && !istFehler && (
          <a
            href={url as string}
            download={name}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground",
              "transition-colors duration-150 ease-out hover:bg-accent motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Herunterladen</span>
            <span className="sr-only"> — {name}</span>
          </a>
        )}
      </header>

      {/* Inhaltsbereich: leer / Fehler / Bild / PDF / Fallback. */}
      <div className="bg-background p-2">
        {!hatQuelle ? (
          <LeerZustand id={statusId} hinweis={leerHinweis} hoehe={hoehe} />
        ) : istFehler ? (
          <FehlerZustand name={name} url={url as string} download={download} hoehe={hoehe} />
        ) : art === "bild" ? (
          <div
            className="flex w-full items-center justify-center overflow-auto rounded-sm border border-border bg-card"
            style={{ minHeight: hoehe }}
          >
            <img
              src={url as string}
              alt={`Vorschau des Dokuments "${name}"`}
              onError={() => setBildFehler(true)}
              className="max-h-full max-w-full object-contain"
              style={{ maxHeight: hoehe }}
            />
          </div>
        ) : art === "pdf" ? (
          <iframe
            src={url as string}
            title={frameTitel}
            className="w-full rounded-sm border border-border bg-card"
            style={{ height: hoehe }}
          />
        ) : (
          <FallbackZustand name={name} hoehe={hoehe} />
        )}
      </div>
    </section>
  );
}

/** Leerer Zustand: kein Dokument ausgewählt — als role="status" für assistive Technik. */
function LeerZustand({
  id,
  hinweis,
  hoehe,
}: {
  id: string;
  hinweis: ReactNode;
  hoehe: number;
}): ReactElement {
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-border bg-card px-6 py-12 text-center"
      style={{ minHeight: hoehe }}
    >
      <span
        className="flex size-12 items-center justify-center rounded-lg bg-accent text-muted-foreground"
        aria-hidden="true"
      >
        <FileText className="size-6" />
      </span>
      <p className="max-w-prose text-sm text-muted-foreground">
        {hinweis ?? "Es liegt noch kein Dokument zur Vorschau vor."}
      </p>
    </div>
  );
}

/** Fehler-Zustand: Quelle nicht ladbar — role="alert"; bietet weiterhin den direkten Aufruf an. */
function FehlerZustand({
  name,
  url,
  download,
  hoehe,
}: {
  name: string;
  url: string;
  download: boolean;
  hoehe: number;
}): ReactElement {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-sm border border-border bg-card px-6 py-12 text-center"
      style={{ minHeight: hoehe }}
    >
      <span
        className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive"
        aria-hidden="true"
      >
        <AlertTriangle className="size-6" />
      </span>
      <div className="max-w-prose">
        <p className="text-sm font-medium text-foreground">Vorschau nicht verfügbar</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Das Dokument „{name}" konnte nicht angezeigt werden.
          {download && " Sie können es stattdessen herunterladen und lokal öffnen."}
        </p>
      </div>
      {download && (
        <a
          href={url}
          download={name}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-foreground",
            "transition-colors duration-150 ease-out hover:bg-accent motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Herunterladen
          <span className="sr-only"> — {name}</span>
        </a>
      )}
    </div>
  );
}

/** Fallback für nicht inline-vorschaubare Typen (Office/ZIP/…): ruhige Karte mit Hinweis. */
function FallbackZustand({ name, hoehe }: { name: string; hoehe: number }): ReactElement {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-sm border border-border bg-card px-6 py-12 text-center"
      style={{ minHeight: hoehe }}
    >
      <span
        className="flex size-12 items-center justify-center rounded-lg bg-accent text-muted-foreground"
        aria-hidden="true"
      >
        <FileWarning className="size-6" />
      </span>
      <p className="max-w-prose text-sm text-muted-foreground">
        Für „{name}" steht keine Inline-Vorschau zur Verfügung. Laden Sie die Datei über den
        Download oben herunter, um sie zu öffnen.
      </p>
    </div>
  );
}
