// fachverfahren-kit/components/NotificationCenter — EPHEMERE In-App-Benachrichtigungen.
//
// ABGRENZUNG (wichtig): Dies ist NICHT das Postfach und KEINE förmliche Zustellung. Das `Postfach` hält
// rechtlich relevante Bescheide/Nachrichten mit Zustellnachweis und Bekanntgabedatum (§ 41 VwVfG) dauerhaft
// vor — daran hängt der Fristlauf. Das NotificationCenter dagegen zeigt nur FLÜCHTIGE, sitzungsnahe Hinweise
// des laufenden Bedienflusses (z. B. „Entwurf gespeichert", „Prüfung abgeschlossen"). Es begründet KEINE
// Bekanntgabe und KEINE Frist. Ein Verfahren darf hier niemals eine förmliche Zustellung abbilden.
//
// GENERISCH + DEP-FREI: keine Domänen-Literale, alle Inhalte kommen aus Props (DATEN-getrieben). Datums-
// Anzeige stabil-absolut via Intl (kein Date.now → keine Hydration-Diskrepanz).
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): als benannte Region (role="region" + aria-label) ausgezeichnet,
// ungelesen zusätzlich über Text + Badge kenntlich (NIE nur über Farbe), Typ mehrkanalig (Farbe + Icon +
// sr-only-Präfix), echte <button>-Bedienelemente >= 24px, sichtbarer Fokus aus den Primitiven, Icons
// dekorativ (aria-hidden), motion-reduce respektiert. Ansagen laufen über die zentrale StatusRegion.
import * as React from "react";
import {
  AlertTriangle,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  Info,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";
import { EmptyState } from "./EmptyState.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Ton einer Benachrichtigung — mappt 1:1 auf die Status-Tokens der styles.css. */
export type BenachrichtigungTyp = "info" | "ok" | "warn" | "block";

/** Eine flüchtige In-App-Benachrichtigung. */
export interface Benachrichtigung {
  /** Stabile ID (Schlüssel + Handler-Argument). */
  id: string;
  /** Kurze Titelzeile. */
  titel: string;
  /** Optionaler erläuternder Text. */
  text?: string;
  /** Ton/Schweregrad — steuert Farbe + Icon + sr-Präfix. Default "info". */
  typ?: BenachrichtigungTyp;
  /** true = gelesen; false/undefiniert = ungelesen (wird hervorgehoben). */
  gelesen?: boolean;
  /** Optionaler ISO-Zeitstempel des Eingangs (für die Zeit-Anzeige). */
  zeitIso?: string;
}

export interface NotificationCenterProps {
  /** Die anzuzeigenden Benachrichtigungen (Reihenfolge bestimmt der Aufrufer — neueste zuerst empfohlen). */
  benachrichtigungen: Benachrichtigung[];
  /** Markiert eine einzelne Benachrichtigung als gelesen. */
  onMarkiereGelesen?: ((id: string) => void) | undefined;
  /** Markiert alle als gelesen (Kopf-Aktion). Nur wenn gesetzt, erscheint die Aktion. */
  onAlleGelesen?: (() => void) | undefined;
  /** Überschrift der Region. Default „Benachrichtigungen". */
  titel?: string;
  className?: string;
}

/** Anzeige-Meta je Ton: Icon, Akzentfarbe, Badge-Ton und sr-only-Präfix (Bedeutung nie nur über Farbe). */
const TYP_META: Record<
  BenachrichtigungTyp,
  {
    Icon: LucideIcon;
    akzent: string;
    badge: "info" | "ok" | "warn" | "block";
    srPrefix: string;
  }
> = {
  info: {
    Icon: Info,
    akzent: "text-status-info",
    badge: "info",
    srPrefix: "Hinweis:",
  },
  ok: {
    Icon: CheckCircle2,
    akzent: "text-status-ok",
    badge: "ok",
    srPrefix: "Erfolg:",
  },
  warn: {
    Icon: AlertTriangle,
    akzent: "text-status-warn",
    badge: "warn",
    srPrefix: "Warnung:",
  },
  block: {
    Icon: XCircle,
    akzent: "text-status-block",
    badge: "block",
    srPrefix: "Fehler:",
  },
};

const zeitFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** ISO → de-DE Datum + Uhrzeit (stabil-absolut). Ungültige Werte werden ausgeblendet. */
function formatZeit(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return zeitFmt.format(d);
}

interface ListItemProps {
  eintrag: Benachrichtigung;
  onMarkiereGelesen?: ((id: string) => void) | undefined;
  onGelesenAnsage: (titel: string) => void;
}

function BenachrichtigungItem({
  eintrag,
  onMarkiereGelesen,
  onGelesenAnsage,
}: ListItemProps): React.JSX.Element {
  const typ: BenachrichtigungTyp = eintrag.typ ?? "info";
  const meta = TYP_META[typ];
  const TypIcon = meta.Icon;
  const ungelesen = !eintrag.gelesen;
  const zeit = formatZeit(eintrag.zeitIso);

  return (
    <li
      className={cn(
        "flex items-start gap-3 px-4 py-3 transition-colors",
        ungelesen && "bg-status-info-soft/30",
      )}
    >
      <TypIcon
        className={cn("mt-0.5 size-5 shrink-0", meta.akzent)}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {/* sr-only-Präfix trägt den Typ für assistive Technik — nie nur über Farbe/Icon. */}
            <span className="sr-only">{meta.srPrefix} </span>
            {eintrag.titel}
          </p>
          {ungelesen && (
            // Status redundant als sichtbarer Text — nicht allein über Hintergrund/Farbe.
            <Badge tone="warn" className="shrink-0">
              Ungelesen
            </Badge>
          )}
        </div>
        {eintrag.text && (
          <p className="mt-1 text-sm text-muted-foreground">{eintrag.text}</p>
        )}
        {zeit && (
          <p className="mt-1 text-xs text-muted-foreground">
            <time dateTime={eintrag.zeitIso}>{zeit}</time>
          </p>
        )}
      </div>
      {ungelesen && onMarkiereGelesen && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            onMarkiereGelesen(eintrag.id);
            onGelesenAnsage(eintrag.titel);
          }}
          aria-label={`Benachrichtigung als gelesen markieren: ${eintrag.titel}`}
        >
          <Check aria-hidden="true" />
          Gelesen
        </Button>
      )}
    </li>
  );
}

/**
 * Liste flüchtiger In-App-Benachrichtigungen mit Lese-Status. Ungelesene sind über Text + Badge kenntlich,
 * der Typ mehrkanalig (Farbe + Icon + sr-Präfix). Bei leerer Liste tritt ein EmptyState an ihre Stelle.
 *
 * @example
 * <NotificationCenter
 *   benachrichtigungen={[{ id: "n1", titel: "Entwurf gespeichert", typ: "ok" }]}
 *   onMarkiereGelesen={(id) => markiere(id)}
 * />
 */
export function NotificationCenter({
  benachrichtigungen,
  onMarkiereGelesen,
  onAlleGelesen,
  titel = "Benachrichtigungen",
  className,
}: NotificationCenterProps): React.JSX.Element {
  const { announce } = useStatusRegion();

  const ungeleseneAnzahl = React.useMemo(
    () => benachrichtigungen.filter((n) => !n.gelesen).length,
    [benachrichtigungen],
  );

  const ansageGelesen = React.useCallback(
    (eintragTitel: string) =>
      announce(`Als gelesen markiert: ${eintragTitel}.`, "polite"),
    [announce],
  );

  const alleGelesen = React.useCallback(() => {
    onAlleGelesen?.();
    announce("Alle Benachrichtigungen als gelesen markiert.", "polite");
  }, [onAlleGelesen, announce]);

  return (
    <section
      role="region"
      aria-label={titel}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <BellRing
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          {titel}
          {ungeleseneAnzahl > 0 && (
            <Badge tone="warn" className="ml-1">
              {ungeleseneAnzahl} ungelesen
            </Badge>
          )}
        </h2>
        {ungeleseneAnzahl > 0 && onAlleGelesen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={alleGelesen}
          >
            <CheckCheck aria-hidden="true" />
            Alle als gelesen
          </Button>
        )}
      </header>

      {benachrichtigungen.length === 0 ? (
        <div className="p-4">
          <EmptyState
            icon={BellRing}
            title="Keine Benachrichtigungen"
            description="Es liegen derzeit keine Benachrichtigungen vor."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {benachrichtigungen.map((eintrag) => (
            <BenachrichtigungItem
              key={eintrag.id}
              eintrag={eintrag}
              onMarkiereGelesen={onMarkiereGelesen}
              onGelesenAnsage={ansageGelesen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
