// fachverfahren-kit/components/NachweisBrowser — Dokumentenmappe eines Vorgangs: alle Nachweise mit
// Status (eingereicht/geprüft/fehlend/abgelehnt), Provenienz, Vorschau-Andocken und Anforderungs-CTA.
//
// Zweck: gibt der/dem Sachbearbeitenden bzw. Antragstellenden EINEN Überblick über die Nachweislage eines
// Vorgangs — was liegt vor, was wurde geprüft, was fehlt (blockierend, wenn Pflicht), was wurde abgelehnt.
// Pflicht-Lücken werden sichtbar UND nicht-visuell hervorgehoben; ein Vollständigkeits-Hinweis fasst die offene
// Anzahl zusammen. Die Vorschau dockt das vorhandene DocumentPreview-Primitive in einen Dialog an (die App kann
// über `onVorschau` stattdessen einen eigenen PdfViewer öffnen).
//
// GENERISCH + DEP-FREI: keine Domänen-Literale, alle Inhalte (Titel, Status, Quelle, URL) kommen ausschließlich
// aus props. Keine eigene I/O; die Aktionen (Anfordern/Upload/Vorschau) sind Sache des Aufrufers.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): Liste mit role="list"/"listitem", jeder Eintrag ist fokussierbar; Status
// trägt IMMER Text neben dem Farb-Badge (Farbe nie alleiniges Merkmal), zusätzlich ein Icon (dekorativ,
// aria-hidden). Pflicht-Lücken sind über aria-Beschreibung kenntlich, nicht nur farblich. Echte <button>-Aktionen
// mit sichtbarem Fokus-Ring (focus-visible:ring-2) und Zielgröße >=24px. Der Vollständigkeits-Hinweis wird über
// die zentrale Ansage (useStatusRegion) gemeldet. Übergänge respektieren prefers-reduced-motion.
import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileQuestion,
  FileText,
  Inbox,
  Upload,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.js";
import { DocumentPreview } from "./DocumentPreview.js";
import { EmptyState } from "./EmptyState.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Bearbeitungsstand eines einzelnen Nachweises. */
export type NachweisStatus =
  | "eingereicht"
  | "geprueft"
  | "fehlend"
  | "abgelehnt";

/** Ein einzelner Nachweis in der Dokumentenmappe. Vollständig props-getrieben. */
export interface NachweisEintrag {
  /** Stabile, eindeutige ID (für Aktionen, Keys und aria-Verknüpfung). */
  id: string;
  /** Anzeigetitel des Nachweises (generisch, z.B. „Meldebescheinigung"). */
  titel: string;
  /** Bearbeitungsstand. */
  status: NachweisStatus;
  /** Pflicht-Nachweis? Fehlt ein Pflicht-Nachweis, ist die Mappe blockierend unvollständig. */
  pflicht: boolean;
  /** Quelle des Dokuments (Object-/Data-/http(s)-URL) für die Vorschau. Fehlt → keine Vorschau. */
  url?: string;
  /** Provenienz/Herkunft (z.B. „BundID", „Upload", „Register XY"). */
  quelle?: string;
}

export interface NachweisBrowserProps {
  /** Alle Nachweise des Vorgangs. Leer → EmptyState. */
  nachweise: NachweisEintrag[];
  /** Vorschau angefordert. Ist der Handler gesetzt, übernimmt die App (z.B. eigener PdfViewer); sonst dockt der Browser die eingebaute Dialog-Vorschau an. */
  onVorschau?: ((id: string) => void) | undefined;
  /** „Anfordern"-CTA für einen fehlenden Nachweis. */
  onAnfordern?: ((id: string) => void) | undefined;
  /** „Hochladen"-CTA (z.B. für fehlende oder abgelehnte Nachweise). */
  onUpload?: ((id: string) => void) | undefined;
  /** Sichtbare Überschrift der Mappe (generisch). */
  titel?: string;
  className?: string;
}

/** Status-Darstellung: Ton + sichtbarer Text + dekoratives Icon. Farbe ist NIE alleiniges Merkmal. */
interface StatusDarstellung {
  label: string;
  tone: "ok" | "info" | "warn" | "block";
  icon: LucideIcon;
}

const STATUS_DARSTELLUNG: Record<NachweisStatus, StatusDarstellung> = {
  geprueft: { label: "Geprüft", tone: "ok", icon: CheckCircle2 },
  eingereicht: { label: "Eingereicht", tone: "info", icon: Clock },
  fehlend: { label: "Fehlend", tone: "warn", icon: FileQuestion },
  abgelehnt: { label: "Abgelehnt", tone: "block", icon: XCircle },
};

/** Gilt der Nachweis als „offen" (noch zu erledigen)? Fehlend und abgelehnt sind offen. */
function istOffen(n: NachweisEintrag): boolean {
  return n.status === "fehlend" || n.status === "abgelehnt";
}

/** Blockiert dieser Nachweis den Vorgang? Nur Pflicht-Nachweise, die noch offen sind. */
function istBlockierend(n: NachweisEintrag): boolean {
  return n.pflicht && istOffen(n);
}

/** Baut den Vollständigkeits-Hinweis als Klartext (auch für die Ansage). */
function vollstaendigkeitsText(nachweise: NachweisEintrag[]): {
  text: string;
  blockierend: boolean;
} {
  const blockierend = nachweise.filter(istBlockierend).length;
  const offen = nachweise.filter(istOffen).length;
  if (blockierend > 0) {
    return {
      text: `${blockierend} Pflicht-Nachweis${blockierend === 1 ? "" : "e"} fehlt noch — der Vorgang ist blockiert.`,
      blockierend: true,
    };
  }
  if (offen > 0) {
    return {
      text: `${offen} Nachweis${offen === 1 ? "" : "e"} offen, aber keine Pflicht-Lücke.`,
      blockierend: false,
    };
  }
  return { text: "0 offen — alle Nachweise vollständig.", blockierend: false };
}

/**
 * Dokumentenmappe: Liste aller Nachweise eines Vorgangs mit Status, Provenienz, Vorschau-Andocken und
 * Anforderungs-CTA für fehlende Nachweise.
 */
export function NachweisBrowser({
  nachweise,
  onVorschau,
  onAnfordern,
  onUpload,
  titel = "Nachweise",
  className,
}: NachweisBrowserProps) {
  const { announce } = useStatusRegion();
  const summaryId = React.useId();

  // Eingebaute Dialog-Vorschau (nur genutzt, wenn die App `onVorschau` NICHT selbst übernimmt).
  const [vorschauId, setVorschauId] = React.useState<string | null>(null);
  const vorschauEintrag = React.useMemo(
    () => nachweise.find((n) => n.id === vorschauId) ?? null,
    [nachweise, vorschauId],
  );

  const { text: hinweisText, blockierend } = React.useMemo(
    () => vollstaendigkeitsText(nachweise),
    [nachweise],
  );

  // Vollständigkeits-Hinweis über die zentrale Ansage melden (Blockierung dringlich = assertive).
  React.useEffect(() => {
    if (nachweise.length === 0) return;
    announce(hinweisText, blockierend ? "assertive" : "polite");
  }, [announce, hinweisText, blockierend, nachweise.length]);

  const handleVorschau = React.useCallback(
    (id: string) => {
      if (onVorschau) {
        onVorschau(id);
        return;
      }
      setVorschauId(id);
    },
    [onVorschau],
  );

  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="gap-2 space-y-0">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{titel}</CardTitle>
          <Badge
            tone={
              blockierend ? "block" : nachweise.some(istOffen) ? "warn" : "ok"
            }
          >
            {nachweise.some(istOffen)
              ? `${nachweise.filter(istOffen).length} offen`
              : "0 offen"}
          </Badge>
        </div>
        {nachweise.length > 0 && (
          <CardDescription
            id={summaryId}
            className={cn(
              "flex items-center gap-1.5",
              blockierend && "text-status-block",
            )}
          >
            {blockierend ? (
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{hinweisText}</span>
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {nachweise.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Keine Nachweise"
            description="Für diesen Vorgang sind noch keine Nachweise hinterlegt."
            as="h3"
          />
        ) : (
          <ul
            role="list"
            aria-describedby={summaryId}
            className="flex list-none flex-col gap-2"
          >
            {nachweise.map((n) => (
              <NachweisZeile
                key={n.id}
                eintrag={n}
                onVorschau={n.url ? () => handleVorschau(n.id) : undefined}
                onAnfordern={onAnfordern ? () => onAnfordern(n.id) : undefined}
                onUpload={onUpload ? () => onUpload(n.id) : undefined}
              />
            ))}
          </ul>
        )}
      </CardContent>

      {/* Eingebaute Vorschau, angedockt im Dialog (DocumentPreview). Nur aktiv, wenn die App nicht selbst übernimmt. */}
      {!onVorschau && (
        <Dialog
          open={vorschauEintrag !== null}
          onOpenChange={(open) => {
            if (!open) setVorschauId(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{vorschauEintrag?.titel ?? "Vorschau"}</DialogTitle>
              {vorschauEintrag?.quelle && (
                <DialogDescription>
                  Quelle: {vorschauEintrag.quelle}
                </DialogDescription>
              )}
            </DialogHeader>
            {vorschauEintrag && (
              <DocumentPreview
                url={vorschauEintrag.url ?? null}
                dateiname={vorschauEintrag.titel}
                titel={vorschauEintrag.titel}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

interface NachweisZeileProps {
  eintrag: NachweisEintrag;
  onVorschau?: (() => void) | undefined;
  onAnfordern?: (() => void) | undefined;
  onUpload?: (() => void) | undefined;
}

/** Eine fokussierbare Zeile der Mappe: Icon · Titel + Provenienz · Status-Badge · Aktionen. */
function NachweisZeile({
  eintrag,
  onVorschau,
  onAnfordern,
  onUpload,
}: NachweisZeileProps) {
  const darstellung = STATUS_DARSTELLUNG[eintrag.status];
  const StatusIcon = darstellung.icon;
  const blockierend = istBlockierend(eintrag);
  const beschreibungId = React.useId();

  // Klartext-Beschreibung des Zustands (für Screenreader, nicht nur über Farbe).
  const zustandText = blockierend
    ? `${darstellung.label}. Pflicht-Nachweis — blockiert den Vorgang.`
    : eintrag.pflicht
      ? `${darstellung.label}. Pflicht-Nachweis.`
      : `${darstellung.label}. Optional.`;

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface p-3",
        "transition-colors duration-150 ease-out motion-reduce:transition-none",
        "focus-within:ring-2 focus-within:ring-ring",
        blockierend && "border-status-block/40 bg-status-block-soft",
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground"
        aria-hidden="true"
      >
        <FileText className="size-5" aria-hidden="true" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {eintrag.titel}
          </span>
          {eintrag.pflicht && (
            <Badge tone="neu" aria-hidden="true">
              Pflicht
            </Badge>
          )}
          <Badge tone={darstellung.tone}>
            <StatusIcon className="size-3" aria-hidden="true" />
            {darstellung.label}
          </Badge>
        </div>
        {eintrag.quelle && (
          <span className="truncate text-xs text-muted-foreground">
            Quelle: {eintrag.quelle}
          </span>
        )}
        {/* Vollständige, nicht nur farbliche Zustandsbeschreibung für assistive Technik. */}
        <span id={beschreibungId} className="sr-only">
          {zustandText}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onVorschau && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onVorschau}
            aria-describedby={beschreibungId}
            aria-label={`Vorschau öffnen: ${eintrag.titel}`}
          >
            <FileText aria-hidden="true" />
            Vorschau
          </Button>
        )}
        {onUpload && istOffen(eintrag) && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onUpload}
            aria-describedby={beschreibungId}
            aria-label={`Nachweis hochladen: ${eintrag.titel}`}
          >
            <Upload aria-hidden="true" />
            Hochladen
          </Button>
        )}
        {onAnfordern && eintrag.status === "fehlend" && (
          <Button
            type="button"
            variant={blockierend ? "default" : "outline"}
            size="sm"
            onClick={onAnfordern}
            aria-describedby={beschreibungId}
            aria-label={`Nachweis anfordern: ${eintrag.titel}`}
          >
            <FileQuestion aria-hidden="true" />
            Anfordern
          </Button>
        )}
      </div>
    </li>
  );
}
