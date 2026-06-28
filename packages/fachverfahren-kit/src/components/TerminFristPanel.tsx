// fachverfahren-kit/components/TerminFristPanel — Fristen-Überwachung + Terminbuchung mit ICS-Export.
//
// GENERISCH + DEP-LEICHT: keine Domänen-Literale — Fristen, Slots und Buchungs-Logik kommen ausschließlich
// über Props. Countdown rein mit Intl.RelativeTimeFormat/Intl.DateTimeFormat (kein date-fns/Zeitzonen-Paket).
// Der ICS-Export ist browser-nativ (data-URL aus encodeURIComponent eines VCALENDAR-Strings) — kein ics-/
// blob-Bibliotheks-Import.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): Status MIT Text + Tag (nie nur Farbe), überfällige Fristen tragen
// role="alert" und werden assertive über die zentrale StatusRegion angesagt, Buchungs-Ergebnisse polite.
// Daten stets als <time dateTime>, Icons dekorativ (aria-hidden), echte <button>/<a>, sichtbarer Fokus,
// Ziel-Größe >=24px, motion-reduce respektiert. Die Zeitzone (Europe/Berlin) ist explizit ausgewiesen.
import * as React from "react";
import { AlarmClock, CalendarPlus, CheckCircle2, Clock, Download, TriangleAlert } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Badge } from "../ui/badge.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card.js";
import { useStatusRegion } from "./StatusRegion.js";

// ── Typen ────────────────────────────────────────────────────────────────────────────────────────

/** Eine zu überwachende Frist. `status` ist optional und wird sonst aus der Fälligkeit abgeleitet. */
export interface FristItem {
  id: string;
  titel: string;
  /** Fälligkeit als ISO-8601-Zeitstempel (z. B. "2026-07-01T12:00:00+02:00"). */
  faelligIso: string;
  status?: "offen" | "gewahrt";
}

/** Ein buchbarer Terminslot. */
export interface TerminSlot {
  id: string;
  /** Start als ISO-8601-Zeitstempel. */
  startIso: string;
  /** Dauer in Minuten. */
  dauerMin: number;
}

export interface TerminFristPanelProps {
  /** Zu überwachende Fristen. Leer/undefiniert → Fristen-Block entfällt. */
  fristen?: FristItem[] | undefined;
  /** Buchbare Terminslots. Leer/undefiniert → Buchungs-Block entfällt. */
  slots?: TerminSlot[] | undefined;
  /** Bucht den Slot (asynchron). Erfolg/Fehler werden lokal + über die zentrale Ansage gespiegelt. */
  onBuchen?: ((slotId: string) => Promise<void>) | undefined;
  /** Überschrift des Panels. */
  titel?: string | undefined;
  /** Beschreibung unter der Überschrift. */
  beschreibung?: string | undefined;
  className?: string | undefined;
}

/** Abgeleiteter Frist-Zustand (Tag-Ton + Text). */
type FristTon = "offen" | "bald" | "ueberfaellig" | "gewahrt";

// ── Konstanten + Helfer ──────────────────────────────────────────────────────────────────────────

/** Alle Datums-/Zeit-Anzeigen explizit in deutscher Amtssprache + Europe/Berlin. */
const ZEITZONE = "Europe/Berlin";
const MS_PRO_TAG = 24 * 60 * 60 * 1000;
const BALD_GRENZE_TAGE = 3;

const datumFmt = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: ZEITZONE,
});
const relFmt = new Intl.RelativeTimeFormat("de-DE", { numeric: "auto" });

/** Ganztägige Differenz (gerundet) für eine stabile, sprunghafte Countdown-Anzeige. */
function tageBis(zielMs: number, jetztMs: number): number {
  return Math.round((zielMs - jetztMs) / MS_PRO_TAG);
}

/** Menschliche Relativ-Angabe ("in 2 Tagen", "vor 1 Tag") — Tage, sonst Stunden, sonst Minuten. */
function relativ(zielMs: number, jetztMs: number): string {
  const diffMs = zielMs - jetztMs;
  const absMs = Math.abs(diffMs);
  if (absMs >= MS_PRO_TAG) return relFmt.format(tageBis(zielMs, jetztMs), "day");
  if (absMs >= 60 * 60 * 1000) return relFmt.format(Math.round(diffMs / (60 * 60 * 1000)), "hour");
  return relFmt.format(Math.round(diffMs / (60 * 1000)), "minute");
}

/** Leitet den Frist-Ton ab. Explizit "gewahrt" hat Vorrang; sonst aus der Fälligkeit. */
function tonFuer(frist: FristItem, jetztMs: number): FristTon {
  if (frist.status === "gewahrt") return "gewahrt";
  const zielMs = new Date(frist.faelligIso).getTime();
  if (Number.isNaN(zielMs)) return "offen";
  if (zielMs < jetztMs) return "ueberfaellig";
  if (tageBis(zielMs, jetztMs) <= BALD_GRENZE_TAGE) return "bald";
  return "offen";
}

const TON_META: Record<
  FristTon,
  { label: string; tone: "ok" | "warn" | "block" | "neu"; Icon: typeof Clock }
> = {
  offen: { label: "Offen", tone: "neu", Icon: Clock },
  bald: { label: "Bald fällig", tone: "warn", Icon: AlarmClock },
  ueberfaellig: { label: "Überfällig", tone: "block", Icon: TriangleAlert },
  gewahrt: { label: "Gewahrt", tone: "ok", Icon: CheckCircle2 },
};

/** Faltet einen ISO-Zeitstempel ins kompakte VCALENDAR-Format (UTC, "Z"). */
function icsZeit(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Maskiert Zeichen mit Sonderbedeutung im ICS-Textwert (RFC 5545). */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Baut eine ICS-data-URL für einen Slot. Leerer String, wenn der Slot nicht datierbar ist. */
function icsDataUrl(slot: TerminSlot, titel: string): string {
  const start = new Date(slot.startIso);
  if (Number.isNaN(start.getTime())) return "";
  const endeMs = start.getTime() + slot.dauerMin * 60 * 1000;
  const dtStart = icsZeit(slot.startIso);
  const dtEnd = icsZeit(new Date(endeMs).toISOString());
  const dtStamp = icsZeit(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//fachverfahren-kit//TerminFristPanel//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(slot.id)}@fachverfahren-kit`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsText(titel)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // CRLF-getrennt + RFC-5545-konform; data-URL via encodeURIComponent (kein Blob/URL.createObjectURL nötig).
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

/** Lesbarer Dateiname für den ICS-Download. */
function icsDateiname(titel: string): string {
  const base = titel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "termin"}.ics`;
}

// ── Komponente ───────────────────────────────────────────────────────────────────────────────────

/**
 * Überwacht Fristen (mit abgeleitetem Countdown/Status) und ermöglicht das Buchen von Terminslots.
 * Ein gebuchter Termin lässt sich als ICS-Datei (data-URL-Download) in den eigenen Kalender übernehmen.
 *
 * @example
 * <TerminFristPanel
 *   fristen={[{ id: "f1", titel: "Stellungnahme einreichen", faelligIso: "2026-07-01T12:00:00+02:00" }]}
 *   slots={[{ id: "s1", startIso: "2026-07-03T09:00:00+02:00", dauerMin: 30 }]}
 *   onBuchen={async (id) => { await api.buchen(id); }}
 * />
 */
export function TerminFristPanel({
  fristen = [],
  slots = [],
  onBuchen,
  titel = "Fristen und Termine",
  beschreibung = `Fristen werden laufend überwacht. Alle Zeiten in der Zeitzone Europe/Berlin.`,
  className,
}: TerminFristPanelProps) {
  const { announce } = useStatusRegion();

  // "Jetzt" tickt minütlich, damit Countdown/Status ohne Reload aktuell bleiben.
  const [jetztMs, setJetztMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setJetztMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(t);
  }, []);

  // Buchungs-Zustand je Slot: laufend, gebucht (mit Titel für ICS) oder Fehler.
  const [buchung, setBuchung] = React.useState<
    Record<string, { phase: "laden" | "gebucht" | "fehler"; titel?: string }>
  >({});

  // Überfällige Fristen einmalig assertive ansagen (nicht bei jedem Minuten-Tick erneut spammen).
  const angesagteUeberfaellige = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    for (const frist of fristen) {
      if (tonFuer(frist, jetztMs) === "ueberfaellig" && !angesagteUeberfaellige.current.has(frist.id)) {
        angesagteUeberfaellige.current.add(frist.id);
        announce(`Frist überfällig: ${frist.titel}.`, "assertive");
      }
    }
  }, [fristen, jetztMs, announce]);

  const buchen = React.useCallback(
    async (slot: TerminSlot) => {
      if (!onBuchen) return;
      const slotTitel = terminTitel(slot);
      setBuchung((b) => ({ ...b, [slot.id]: { phase: "laden" } }));
      announce(`Termin wird gebucht: ${slotTitel}.`, "polite");
      try {
        await onBuchen(slot.id);
        setBuchung((b) => ({ ...b, [slot.id]: { phase: "gebucht", titel: slotTitel } }));
        announce(`Termin gebucht: ${slotTitel}. Kalender-Export verfügbar.`, "polite");
      } catch {
        setBuchung((b) => ({ ...b, [slot.id]: { phase: "fehler" } }));
        announce(`Termin konnte nicht gebucht werden: ${slotTitel}.`, "assertive");
      }
    },
    [onBuchen, announce],
  );

  const hatFristen = fristen.length > 0;
  const hatSlots = slots.length > 0;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" aria-hidden="true" />
          {titel}
        </CardTitle>
        <CardDescription>{beschreibung}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* ── Fristen ────────────────────────────────────────────────────────────────────────── */}
        {hatFristen && (
          <section aria-label="Fristen">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Fristen</h3>
            <ul className="space-y-2">
              {fristen.map((frist) => {
                const ton = tonFuer(frist, jetztMs);
                const meta = TON_META[ton];
                const istUeberfaellig = ton === "ueberfaellig";
                const zielMs = new Date(frist.faelligIso).getTime();
                const datierbar = !Number.isNaN(zielMs);
                const TonIcon = meta.Icon;
                return (
                  <li
                    key={frist.id}
                    // Überfällige Fristen sind eine dringende Meldung — als Alert ausgezeichnet.
                    role={istUeberfaellig ? "alert" : undefined}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border p-3",
                      istUeberfaellig ? "border-status-block/40 bg-status-block-soft" : "border-border bg-surface",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{frist.titel}</p>
                      {datierbar ? (
                        <p className="text-sm text-muted-foreground">
                          Fällig{" "}
                          <time dateTime={frist.faelligIso}>{datumFmt.format(zielMs)}</time>
                          {ton !== "gewahrt" && (
                            <>
                              {" · "}
                              <span className={cn(istUeberfaellig && "font-medium text-foreground")}>
                                {relativ(zielMs, jetztMs)}
                              </span>
                            </>
                          )}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Kein gültiges Fälligkeitsdatum.</p>
                      )}
                    </div>
                    {/* Status MIT Text + Icon — Information nie nur über die Farbe. */}
                    <Badge tone={meta.tone}>
                      <TonIcon className="size-3" aria-hidden="true" />
                      {meta.label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── Termine buchen ─────────────────────────────────────────────────────────────────── */}
        {hatSlots && (
          <section aria-label="Terminbuchung">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Termin buchen</h3>
            <ul className="space-y-2">
              {slots.map((slot) => {
                const startMs = new Date(slot.startIso).getTime();
                const datierbar = !Number.isNaN(startMs);
                const slotTitel = terminTitel(slot);
                const zustand = buchung[slot.id];
                const phase = zustand?.phase;
                const laden = phase === "laden";
                const gebucht = phase === "gebucht";
                const fehler = phase === "fehler";
                const icsUrl = gebucht ? icsDataUrl(slot, zustand?.titel ?? slotTitel) : "";
                return (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-md border border-border bg-surface p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {datierbar ? (
                          <time dateTime={slot.startIso}>{datumFmt.format(startMs)}</time>
                        ) : (
                          "Termin"
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Dauer: {slot.dauerMin}&nbsp;Minuten
                        {fehler && (
                          <span className="ml-2 inline-flex items-center gap-1 text-foreground">
                            <TriangleAlert className="size-3.5 text-status-block" aria-hidden="true" />
                            Buchung fehlgeschlagen
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {gebucht ? (
                        <>
                          <Badge tone="ok">
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            Gebucht
                          </Badge>
                          {icsUrl && (
                            <Button asChild variant="outline" size="sm">
                              <a
                                href={icsUrl}
                                download={icsDateiname(slotTitel)}
                                aria-label={`Termin ${slotTitel} als Kalenderdatei herunterladen`}
                              >
                                <Download aria-hidden="true" />
                                Zum Kalender (.ics)
                              </a>
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant={fehler ? "outline" : "default"}
                          size="sm"
                          onClick={() => void buchen(slot)}
                          disabled={laden || !onBuchen || !datierbar}
                          aria-busy={laden || undefined}
                          aria-label={`Termin ${slotTitel} buchen`}
                        >
                          <CalendarPlus
                            aria-hidden="true"
                            className={cn(laden && "animate-pulse motion-reduce:animate-none")}
                          />
                          {laden ? "Wird gebucht…" : fehler ? "Erneut buchen" : "Buchen"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Alle Zeiten in der Zeitzone Europe/Berlin. Der Kalender-Export (.ics) berücksichtigt die
              Zeitzone automatisch.
            </p>
          </section>
        )}

        {!hatFristen && !hatSlots && (
          <p className="text-sm text-muted-foreground">Keine Fristen oder Termine vorhanden.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** Sprechender Termin-Titel aus dem Startdatum (für Ansage, ICS-SUMMARY und Dateinamen). */
function terminTitel(slot: TerminSlot): string {
  const ms = new Date(slot.startIso).getTime();
  return Number.isNaN(ms) ? "Termin" : `Termin am ${datumFmt.format(ms)}`;
}
