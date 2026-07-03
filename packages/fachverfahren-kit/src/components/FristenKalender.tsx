// fachverfahren-kit/components/FristenKalender — Monatskalender-Sicht auf Fristen/Termine als DATEN.
//
// ERGÄNZT (ersetzt NICHT) das TerminFristPanel: Während dort Fristen als Liste mit Countdown und Termin-Buchung
// stehen, gibt dieser Kalender einen räumlichen Monats-Überblick. Beide konsumieren dieselbe Idee „Frist/Termin
// als DATEN"; welche Sicht ein Verfahren zeigt, entscheidet der Aufrufer. Baut auf der bestehenden ui/calendar
// (react-day-picker) auf — Tastatur/Fokus/aria der Tageszellen liefert die Bibliothek.
//
// GENERISCH + DEP-LEICHT: keine Domänen-Literale; Einträge kommen ausschließlich über Props. Kein Date.now im
// Render (Auswahl-Zustand steuert die Komponente; der Kalender bestimmt seinen Startmonat selbst).
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): markierte Tage tragen die Information NICHT nur als Farbe — der
// barrierefreie Name der Tageszelle wird über `labelDayButton` um „N Einträge" ergänzt (aria-Text), und optisch
// erhält der Tag zusätzlich Fettung + Unterstreichung (Form, nicht nur Farbton). Die Auswahl eines Tages listet
// dessen Einträge mit Art (Text + Badge + Icon), Ansage über die zentrale StatusRegion, motion-reduce respektiert.
import * as React from "react";
import {
  AlarmClock,
  CalendarClock,
  CalendarDays,
  Info,
  type LucideIcon,
} from "lucide-react";
import { labelDayButton } from "react-day-picker";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Calendar } from "../ui/calendar.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Art eines Kalender-Eintrags — steuert Badge-Ton, Icon und sr-Präfix. */
export type KalenderEintragArt = "frist" | "termin" | "hinweis";

/** Ein Kalender-Eintrag als DATEN. */
export interface KalenderEintrag {
  /** ISO-Datum ("YYYY-MM-DD") oder ISO-Zeitstempel. */
  datum: string;
  /** Anzeige-Text des Eintrags. */
  label: string;
  /** Art des Eintrags. Default "termin". */
  art?: KalenderEintragArt;
}

export interface FristenKalenderProps {
  /** Die zu markierenden Fristen/Termine (DATEN-getrieben). */
  eintraege: KalenderEintrag[];
  /** Anfänglich gewählter Tag (kontrolliert, wenn zusammen mit onAuswahl genutzt). */
  ausgewaehlt?: Date | undefined;
  /** Auswahl-Callback (der gewählte Tag oder undefined bei Abwahl). */
  onAuswahl?: ((tag: Date | undefined) => void) | undefined;
  /** Überschrift. Default „Fristen und Termine". */
  titel?: string;
  /** Beschreibung unter der Überschrift. */
  beschreibung?: string;
  className?: string;
}

const ART_META: Record<
  KalenderEintragArt,
  {
    label: string;
    tone: "info" | "warn" | "neu";
    Icon: LucideIcon;
    srPrefix: string;
  }
> = {
  frist: { label: "Frist", tone: "warn", Icon: AlarmClock, srPrefix: "Frist:" },
  termin: {
    label: "Termin",
    tone: "info",
    Icon: CalendarClock,
    srPrefix: "Termin:",
  },
  hinweis: { label: "Hinweis", tone: "neu", Icon: Info, srPrefix: "Hinweis:" },
};

/** Lokaler Tages-Schlüssel "YYYY-MM-DD" aus einem Date (keine Zeitzonen-Verschiebung). */
function lokalerTagKey(d: Date): string {
  const jahr = d.getFullYear();
  const monat = String(d.getMonth() + 1).padStart(2, "0");
  const tag = String(d.getDate()).padStart(2, "0");
  return `${jahr}-${monat}-${tag}`;
}

/**
 * Tages-Schlüssel eines Eintrags. Reine Datumsangaben ("YYYY-MM-DD") werden als Kalendertag genommen
 * (keine TZ-Verschiebung); Zeitstempel werden lokal aufgelöst. `null` bei ungültigem Datum.
 */
function eintragTagKey(datum: string): string | null {
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) return datum;
  return lokalerTagKey(d);
}

/** "YYYY-MM-DD" → lokales Date (Mitternacht). Für die DayPicker-Modifier (Matcher als Date[]). */
function keyZuDate(key: string): Date {
  const teile = key.split("-");
  return new Date(Number(teile[0]), Number(teile[1]) - 1, Number(teile[2]));
}

const langesDatumFmt = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/**
 * Monatskalender, der Fristen/Termine markiert. Die Auswahl eines Tages listet dessen Einträge.
 *
 * @example
 * <FristenKalender
 *   eintraege={[{ datum: "2026-07-01", label: "Stellungnahme einreichen", art: "frist" }]}
 * />
 */
export function FristenKalender({
  eintraege,
  ausgewaehlt,
  onAuswahl,
  titel = "Fristen und Termine",
  beschreibung = "Wählen Sie einen Tag, um die zugehörigen Einträge zu sehen.",
  className,
}: FristenKalenderProps): React.JSX.Element {
  const { announce } = useStatusRegion();

  // Einträge nach Tages-Schlüssel gruppieren (ungültige Daten werden übersprungen).
  const eintraegeNachTag = React.useMemo(() => {
    const map = new Map<string, KalenderEintrag[]>();
    for (const eintrag of eintraege) {
      const key = eintragTagKey(eintrag.datum);
      if (!key) continue;
      const liste = map.get(key);
      if (liste) liste.push(eintrag);
      else map.set(key, [eintrag]);
    }
    return map;
  }, [eintraege]);

  // Markierte Tage als Date[] für den DayPicker-Modifier.
  const markierteTage = React.useMemo(
    () => [...eintraegeNachTag.keys()].map(keyZuDate),
    [eintraegeNachTag],
  );

  // Kontrolliert (ausgewaehlt gesetzt) ODER selbstgesteuert (interner Zustand).
  const [internAuswahl, setInternAuswahl] = React.useState<Date | undefined>(
    ausgewaehlt,
  );
  const istKontrolliert = ausgewaehlt !== undefined;
  const gewaehlt = istKontrolliert ? ausgewaehlt : internAuswahl;

  const handleAuswahl = React.useCallback(
    (tag: Date | undefined) => {
      if (!istKontrolliert) setInternAuswahl(tag);
      onAuswahl?.(tag);
      if (tag) {
        const anzahl = eintraegeNachTag.get(lokalerTagKey(tag))?.length ?? 0;
        announce(
          `${langesDatumFmt.format(tag)} gewählt. ${
            anzahl === 0
              ? "Keine Einträge."
              : `${anzahl} ${anzahl === 1 ? "Eintrag" : "Einträge"}.`
          }`,
          "polite",
        );
      }
    },
    [istKontrolliert, onAuswahl, eintraegeNachTag, announce],
  );

  const gewaehlteEintraege = gewaehlt
    ? (eintraegeNachTag.get(lokalerTagKey(gewaehlt)) ?? [])
    : [];

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <header className="px-4 py-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CalendarDays
            className="size-5 text-muted-foreground"
            aria-hidden="true"
          />
          {titel}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{beschreibung}</p>
      </header>

      <div className="flex flex-col gap-4 border-t border-border p-4 md:flex-row md:items-start">
        <Calendar
          mode="single"
          selected={gewaehlt}
          onSelect={handleAuswahl}
          modifiers={{ hatEintrag: markierteTage }}
          // Optischer Marker als FORM (Fettung + Unterstreichung), nicht nur Farbton.
          modifiersClassNames={{
            hatEintrag:
              "[&>button]:font-bold [&>button]:underline [&>button]:underline-offset-4 [&>button]:decoration-2",
          }}
          // Barrierefreier Name der Tageszelle um die Anzahl der Einträge ergänzen (aria-Text, nicht nur Farbe).
          labels={{
            labelDayButton: (date, modifiers, options, dateLib) => {
              const basis = labelDayButton(date, modifiers, options, dateLib);
              const anzahl =
                eintraegeNachTag.get(lokalerTagKey(date))?.length ?? 0;
              return anzahl > 0
                ? `${basis}, ${anzahl} ${anzahl === 1 ? "Eintrag" : "Einträge"}`
                : basis;
            },
          }}
          className="shrink-0"
        />

        {/* Einträge des gewählten Tages. */}
        <section
          aria-label="Einträge des gewählten Tages"
          className="min-w-0 flex-1"
        >
          {gewaehlt ? (
            <>
              <h3 className="text-sm font-semibold text-foreground">
                <time dateTime={lokalerTagKey(gewaehlt)}>
                  {langesDatumFmt.format(gewaehlt)}
                </time>
              </h3>
              {gewaehlteEintraege.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Keine Einträge an diesem Tag.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {gewaehlteEintraege.map((eintrag, index) => {
                    const art = eintrag.art ?? "termin";
                    const meta = ART_META[art];
                    const ArtIcon = meta.Icon;
                    return (
                      <li
                        key={`${eintrag.datum}-${index}`}
                        className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-3"
                      >
                        <p className="min-w-0 text-sm text-foreground">
                          <span className="sr-only">{meta.srPrefix} </span>
                          {eintrag.label}
                        </p>
                        <Badge tone={meta.tone} className="shrink-0">
                          <ArtIcon className="size-3" aria-hidden="true" />
                          {meta.label}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Wählen Sie einen Tag im Kalender aus. Tage mit Einträgen sind
              hervorgehoben.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
