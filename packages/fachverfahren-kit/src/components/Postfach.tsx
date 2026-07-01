// fachverfahren-kit/components/Postfach — Nutzer-Postfach für Bescheide/Nachrichten mit Zustellnachweis.
//
// Master-Detail: links eine fokussierbare Liste (ungelesen hervorgehoben über Text + Badge, NICHT nur Farbe),
// rechts das gewählte Element mit Metadaten, Zustellnachweis und Dokument-Vorschau-Link. Bescheide zeigen den
// Zustellnachweis inkl. Bekanntgabedatum und — bei zustellung.fiktion — den Hinweis auf die Bekanntgabefiktion.
//
// RECHTLICH RELEVANT: Das Bekanntgabedatum (§ 41 VwVfG) bestimmt den Beginn der Rechtsbehelfsfrist. Bei
// Zustellungsfiktion (z. B. 3-Tages-Fiktion bei Bekanntgabe durch die Post) gilt der Bescheid als am
// fiktiven Tag bekanntgegeben — der Fristlauf hängt an diesem Datum. Diese Komponente STELLT das Datum nur
// dar; die Berechnung/Setzung der Frist ist Sache des aufrufenden Fachverfahrens.
//
// GENERISCH + DEP-FREI: keine Domänen-Literale, alle Inhalte kommen aus props. Datums-Formatierung via Intl,
// stabil-absolut (kein Date.now → keine Hydration-Diskrepanz).
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): Liste als role="listbox" mit echten fokussierbaren <button>-Einträgen,
// ungelesen zusätzlich über aria-label kenntlich (nicht nur Farbe/Fett), Pfeiltasten-Navigation, sichtbarer
// Fokus (focus-visible:ring-2), Ziel-Größe >= 24px, Icons dekorativ (aria-hidden), motion-reduce respektiert,
// dynamische Auswahl-Meldung über die zentrale Ansage (useStatusRegion).
import * as React from "react";
import {
  CheckCheck,
  FileText,
  Inbox,
  Mail,
  ShieldCheck,
  Stamp,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { Separator } from "../ui/separator.js";
import { EmptyState } from "./EmptyState.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Zustellnachweis einer Nachricht/eines Bescheids — bekanntgabe/fiktion sind rechtlich relevant. */
export interface PostfachZustellung {
  /** ISO-Zeitstempel der technischen Zustellung (Eingang im Postfach des Empfängers). */
  zugestelltAmIso: string;
  /** ISO-Datum der rechtlichen Bekanntgabe (§ 41 VwVfG) — maßgeblich für den Fristlauf. */
  bekanntgabeAmIso?: string;
  /** true = Bekanntgabe gilt kraft Fiktion (z. B. 3-Tages-Fiktion); wird als Hinweis ausgewiesen. */
  fiktion?: boolean;
}

/** Eine Postfach-Nachricht. Bescheide tragen i. d. R. einen Zustellnachweis. */
export interface PostfachNachricht {
  /** Stabile fachliche ID (Schlüssel + Handler-Argument). */
  id: string;
  /** Betreff-/Titelzeile. */
  betreff: string;
  /** ISO-Zeitstempel des Eingangs im Postfach. */
  eingangIso: string;
  /** true = bereits gelesen; false = ungelesen (wird hervorgehoben). */
  gelesen: boolean;
  /** Art des Eintrags — steuert Icon/Beschriftung; Default 'nachricht'. */
  typ?: "bescheid" | "nachricht";
  /** Zustellnachweis (vor allem bei Bescheiden) inkl. Bekanntgabedatum/Fiktion. */
  zustellung?: PostfachZustellung;
  /** Optionale URL des hinterlegten Dokuments (Vorschau/Download im Detailbereich). */
  dokumentUrl?: string;
}

export interface PostfachProps {
  /** Die anzuzeigenden Nachrichten (neueste zuerst empfohlen — die Reihenfolge bestimmt der Aufrufer). */
  nachrichten: PostfachNachricht[];
  /** Wird beim Öffnen/Auswählen eines Eintrags aufgerufen (z. B. als gelesen markieren, Detail laden). */
  onOeffnen?: ((id: string) => void) | undefined;
  /** Überschrift der Liste (generisch überschreibbar). Default „Postfach". */
  titel?: string | undefined;
  className?: string;
}

// ── Anzeige-Helfer (generisch, verfahrens-agnostisch) ─────────────────────────────────────────

/** ISO → de-DE Datum (stabil-absolut). Bei ungültigem Wert wird der Roh-String durchgereicht. */
function formatDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** ISO → de-DE Datum + Uhrzeit (für Eingangs-/Zustellzeitpunkte). */
function formatZeitpunkt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Anzeige-Label für den Typ (generisch — keine Domänen-Literale). */
function typLabel(typ: PostfachNachricht["typ"]): string {
  return typ === "bescheid" ? "Bescheid" : "Nachricht";
}

// ── Detailbereich ────────────────────────────────────────────────────────────────────────────

interface PostfachDetailProps {
  nachricht: PostfachNachricht;
}

/** Zustellnachweis-Block: technische Zustellung + Bekanntgabedatum (§ 41 VwVfG) + ggf. Fiktions-Hinweis. */
function Zustellnachweis({
  zustellung,
}: {
  zustellung: PostfachZustellung;
}): React.ReactElement {
  return (
    <section
      aria-label="Zustellnachweis"
      className="rounded-lg border border-status-info/30 bg-status-info-soft p-4"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="size-4 text-status-info" aria-hidden="true" />
        Zustellnachweis
      </h4>

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Zugestellt am</dt>
        <dd className="font-medium text-foreground">
          <time dateTime={zustellung.zugestelltAmIso}>
            {formatZeitpunkt(zustellung.zugestelltAmIso)}
          </time>
        </dd>

        {zustellung.bekanntgabeAmIso && (
          <>
            <dt className="text-muted-foreground">Bekanntgabe am</dt>
            <dd className="font-medium text-foreground">
              <time dateTime={zustellung.bekanntgabeAmIso}>
                {formatDatum(zustellung.bekanntgabeAmIso)}
              </time>
            </dd>
          </>
        )}
      </dl>

      {zustellung.fiktion && (
        // Bekanntgabe gilt KRAFT FIKTION — der Fristlauf hängt am fiktiven Datum (rechtlich relevant).
        <p className="mt-3 flex items-start gap-2 text-sm text-foreground">
          <Stamp
            className="mt-0.5 size-4 shrink-0 text-status-warn"
            aria-hidden="true"
          />
          <span>
            <span className="font-semibold">
              Hinweis zur Bekanntgabefiktion (§ 41 VwVfG):
            </span>{" "}
            Der Bescheid gilt am genannten Tag als bekanntgegeben. Ab diesem
            Datum läuft die Rechtsbehelfsfrist, auch wenn Sie ihn später zur
            Kenntnis nehmen.
          </span>
        </p>
      )}
    </section>
  );
}

function PostfachDetail({
  nachricht,
}: PostfachDetailProps): React.ReactElement {
  const istBescheid = nachricht.typ === "bescheid";

  return (
    <article
      aria-labelledby="postfach-detail-betreff"
      className="flex flex-col gap-4"
    >
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={istBescheid ? "info" : "neu"}>
            {istBescheid ? (
              <Stamp className="size-3" aria-hidden="true" />
            ) : (
              <Mail className="size-3" aria-hidden="true" />
            )}
            {typLabel(nachricht.typ)}
          </Badge>
          {!nachricht.gelesen && (
            <Badge tone="warn">
              {/* Status auch im Text, nicht nur über die Badge-Farbe. */}
              Ungelesen
            </Badge>
          )}
        </div>

        <h3
          id="postfach-detail-betreff"
          className="text-lg font-semibold leading-snug text-foreground"
        >
          {nachricht.betreff}
        </h3>

        <p className="text-sm text-muted-foreground">
          Eingegangen am{" "}
          <time dateTime={nachricht.eingangIso} className="text-foreground">
            {formatZeitpunkt(nachricht.eingangIso)}
          </time>
        </p>
      </header>

      <Separator />

      {nachricht.zustellung ? (
        <Zustellnachweis zustellung={nachricht.zustellung} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Für diese Nachricht liegt kein förmlicher Zustellnachweis vor.
        </p>
      )}

      {nachricht.dokumentUrl && (
        <div>
          <Button asChild variant="outline" size="sm">
            <a
              href={nachricht.dokumentUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="size-4" aria-hidden="true" />
              Dokument öffnen
              <span className="sr-only"> (öffnet in neuem Tab)</span>
            </a>
          </Button>
        </div>
      )}
    </article>
  );
}

// ── Listeneintrag ────────────────────────────────────────────────────────────────────────────

interface PostfachListItemProps {
  nachricht: PostfachNachricht;
  ausgewaehlt: boolean;
  onSelect: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  refForFocus: (el: HTMLButtonElement | null) => void;
}

function PostfachListItem({
  nachricht,
  ausgewaehlt,
  onSelect,
  onKeyDown,
  refForFocus,
}: PostfachListItemProps): React.ReactElement {
  const ungelesen = !nachricht.gelesen;
  const istBescheid = nachricht.typ === "bescheid";

  // Vollständiges aria-label: Typ, Lese-Status (nicht nur visuell!), Betreff, Eingangsdatum.
  const label = [
    typLabel(nachricht.typ),
    ungelesen ? "ungelesen" : "gelesen",
    nachricht.betreff,
    `eingegangen am ${formatDatum(nachricht.eingangIso)}`,
  ].join(", ");

  return (
    <li role="presentation">
      <button
        ref={refForFocus}
        type="button"
        role="option"
        aria-selected={ausgewaehlt}
        aria-label={label}
        tabIndex={ausgewaehlt ? 0 : -1}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full min-h-[44px] flex-col gap-1 border-l-2 px-4 py-3 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          "motion-reduce:transition-none",
          ausgewaehlt
            ? "border-l-primary bg-secondary"
            : "border-l-transparent hover:bg-muted",
          ungelesen && !ausgewaehlt && "bg-status-info-soft/40",
        )}
      >
        <span className="flex items-center gap-2">
          {istBescheid ? (
            <Stamp
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <Mail
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              ungelesen
                ? "font-semibold text-foreground"
                : "font-normal text-foreground",
            )}
          >
            {nachricht.betreff}
          </span>
          {ungelesen && (
            // Status redundant als sichtbarer Text-Marker — nicht allein über Farbe/Fettung.
            <Badge tone="warn" className="shrink-0">
              Neu
            </Badge>
          )}
        </span>

        <span className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
          <span>{typLabel(nachricht.typ)}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={nachricht.eingangIso}>
            {formatDatum(nachricht.eingangIso)}
          </time>
        </span>
      </button>
    </li>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────────────────────

/**
 * Master-Detail-Postfach. Links die fokussierbare Liste (Pfeiltasten-Navigation, ungelesen über Text +
 * Badge + aria-label kenntlich), rechts das gewählte Element mit Zustellnachweis und Dokument-Link.
 * Bei leerer Liste tritt ein EmptyState an die Stelle der Liste.
 */
export function Postfach({
  nachrichten,
  onOeffnen,
  titel = "Postfach",
  className,
}: PostfachProps): React.ReactElement {
  const { announce } = useStatusRegion();
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const [aktiveId, setAktiveId] = React.useState<string | null>(
    () => nachrichten[0]?.id ?? null,
  );

  // Auswahl gültig halten, wenn sich die Liste ändert (z. B. Nachricht entfernt).
  React.useEffect(() => {
    if (nachrichten.length === 0) {
      setAktiveId(null);
      return;
    }
    if (!nachrichten.some((n) => n.id === aktiveId)) {
      setAktiveId(nachrichten[0]?.id ?? null);
    }
  }, [nachrichten, aktiveId]);

  const aktiveNachricht = React.useMemo(
    () => nachrichten.find((n) => n.id === aktiveId) ?? null,
    [nachrichten, aktiveId],
  );

  const ungeleseneAnzahl = React.useMemo(
    () => nachrichten.filter((n) => !n.gelesen).length,
    [nachrichten],
  );

  const oeffne = React.useCallback(
    (nachricht: PostfachNachricht) => {
      setAktiveId(nachricht.id);
      announce(
        `${typLabel(nachricht.typ)} geöffnet: ${nachricht.betreff}`,
        "polite",
      );
      onOeffnen?.(nachricht.id);
    },
    [announce, onOeffnen],
  );

  // Pfeiltasten-Navigation in der Listbox (Home/End/Up/Down) — Fokus folgt der Auswahl.
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number;
      switch (event.key) {
        case "ArrowDown":
          nextIndex = Math.min(index + 1, nachrichten.length - 1);
          break;
        case "ArrowUp":
          nextIndex = Math.max(index - 1, 0);
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = nachrichten.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const ziel = nachrichten[nextIndex];
      if (ziel) {
        setAktiveId(ziel.id);
        itemRefs.current[nextIndex]?.focus();
      }
    },
    [nachrichten],
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Inbox className="size-5 text-muted-foreground" aria-hidden="true" />
          {titel}
        </h2>
        {ungeleseneAnzahl > 0 ? (
          <Badge tone="warn">
            <CheckCheck className="size-3" aria-hidden="true" />
            {ungeleseneAnzahl} ungelesen
          </Badge>
        ) : (
          nachrichten.length > 0 && (
            <span className="text-xs text-muted-foreground">Alles gelesen</span>
          )
        )}
      </header>

      <Separator />

      {nachrichten.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={Inbox}
            title="Keine Nachrichten"
            description="In Ihrem Postfach liegen derzeit keine Bescheide oder Nachrichten."
          />
        </div>
      ) : (
        <div className="grid gap-0 md:grid-cols-[minmax(16rem,22rem)_1fr]">
          <ul
            role="listbox"
            aria-label={`${titel} — Nachrichtenliste`}
            className="divide-y divide-border border-b border-border md:border-b-0 md:border-r"
          >
            {nachrichten.map((nachricht, index) => (
              <PostfachListItem
                key={nachricht.id}
                nachricht={nachricht}
                ausgewaehlt={nachricht.id === aktiveId}
                onSelect={() => oeffne(nachricht)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                refForFocus={(el) => {
                  itemRefs.current[index] = el;
                }}
              />
            ))}
          </ul>

          <div className="p-4 md:p-6">
            {aktiveNachricht ? (
              <PostfachDetail nachricht={aktiveNachricht} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Wählen Sie links eine Nachricht aus, um sie zu lesen.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
