// fachverfahren-kit/components/DossierAkte360 — die GENERISCHE 360°-Dossier-/Fallakte-Sicht (Case-Management).
//
// Das DOSSIER-Gegenstück zur antrags-zentrierten `VorgangDetail`: eine Person/ein Fall im Mittelpunkt, mit
// Stammdaten, Zielen (Ziel-Karten mit Schritten + Fortschritt %), Terminen/Fristen, Notizen/Vermerken und
// Verlauf/Audit — komponiert aus den bestehenden Kit-Primitiven (Tabs · DescriptionList · Card · Progress ·
// Badge · Timeline · EmptyState).
//
// STRENG rein präsentierend & domänen-neutral (Rule: „alles über Props"):
//   * KEIN `fetch`, kein Store, keine Netz-/State-Logik im Kit — Daten kommen ausschließlich als Props.
//   * KEINE Fach-Literale (kein „Handlungsfeld Sprache", kein „AufenthG"): Sektions-/UI-Beschriftungen sind
//     generische Dossier-Chrome mit deutschen Default-Labels, die der Aufrufer via `labels` vollständig
//     überschreiben kann. Ein zweites Verfahren rendert unverändert.
//   * Fortschritt wird rein abgeleitet: `fortschrittProzent` falls gesetzt, sonst aus den erledigten Schritten.
//
// Barrierefreiheit (BITV 2.2 AA / WCAG 2.2):
//   * Radix-Tabs (Rollen/Tastatur), Panels sind über ihren Trigger beschriftet.
//   * Fortschritt: `Progress` (role=progressbar) mit `aria-label`, zusätzlich sichtbarer %-Text.
//   * Schritt-Status wird NIE nur über Farbe/Häkchen getragen — jeder Schritt trägt eine `sr-only`-Ansage
//     („erledigt"/„offen"). Termine/Notizen nutzen `<time>` mit maschinenlesbarem `dateTime`.
//   * Leere Sektionen rendern `EmptyState` (role=status), nicht eine stumme leere Liste.
//   * Nur semantische Tokens, kein rohes Hex/oklch/px; Motion erbt Token-Transitions (reduced-motion-safe).
import { useId, type ReactElement, type ReactNode } from "react";
import {
  Calendar,
  Check,
  History,
  IdCard,
  StickyNote,
  Target,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";
import { Progress } from "../ui/progress.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs.js";
import {
  DescriptionList,
  type DescriptionListItem,
} from "./DescriptionList.js";
import { EmptyState } from "./EmptyState.js";
import { Timeline, type TimelineItem } from "./Timeline.js";

/** Ton eines Badges — 1:1 zum Badge-Vertrag (kein status-spezifisches Mapping). */
export type DossierTone = "neu" | "info" | "warn" | "ok" | "block";

/** Ein farbiges Kurz-Label (Status/Phase o. Ä.) — Inhalt + Ton kommen ausschließlich vom Aufrufer. */
export interface DossierBadge {
  label: ReactNode;
  tone?: DossierTone;
}

/** Ein Schritt eines Ziels (Teilaufgabe) — reine Daten. */
export interface DossierZielSchritt {
  id: string;
  label: ReactNode;
  erledigt?: boolean;
}

/** Ein Ziel (z. B. ein Integrationsziel) mit optionaler Kategorie, Status, Frist, Fortschritt + Schritten. */
export interface DossierZiel {
  id: string;
  titel: ReactNode;
  /** Optionale Kategorie/Zuordnung (z. B. ein Handlungsfeld) als neutrales Chip-Label. */
  kategorie?: ReactNode;
  /** Optionaler Status als farbiges Badge. */
  status?: DossierBadge;
  /** Optionale Frist/Fälligkeit (bereits formatiert oder als Node). */
  frist?: ReactNode;
  /**
   * Fortschritt in Prozent (0–100). Fehlt der Wert, wird er aus `schritte` abgeleitet
   * (erledigte / gesamt); ohne Schritte gilt 0 %.
   */
  fortschrittProzent?: number;
  /** Teilschritte des Ziels. */
  schritte?: DossierZielSchritt[];
}

/** Ein Termin/eine Frist — reine Daten. */
export interface DossierTermin {
  id: string;
  titel: ReactNode;
  /** Zeitpunkt: `Date` → maschinenlesbar + lokalisiert; String → unverändert übernommen. */
  zeit?: string | Date;
  beschreibung?: ReactNode;
  /** Optionales Kurz-Label (z. B. „Bevorstehend"/„Überfällig") — Text + Ton vom Aufrufer. */
  badge?: DossierBadge;
}

/** Eine Notiz/ein Vermerk — reine Daten. */
export interface DossierNotiz {
  id: string;
  text: ReactNode;
  /** Urheber:in (z. B. Initialen/Name) — synthetisch/anonymisiert vom Aufrufer. */
  autor?: ReactNode;
  /** Zeitpunkt: `Date` → maschinenlesbar + lokalisiert; String → unverändert übernommen. */
  zeit?: string | Date;
}

/** Ein Kopf-Merkmal (Chip) — Label/Wert-Paar für die Kopfzeile (z. B. Sprache, Phase). */
export interface DossierMerkmal {
  label?: ReactNode;
  value: ReactNode;
  tone?: DossierTone;
}

/** Vollständig überschreibbare UI-Beschriftungen (deutsche Defaults). Keine Fach-Literale. */
export interface DossierAkte360Labels {
  stammdaten: string;
  ziele: string;
  termine: string;
  notizen: string;
  verlauf: string;
  fortschritt: string;
  schrittErledigt: string;
  schrittOffen: string;
  keineStammdaten: string;
  keineZiele: string;
  keineTermine: string;
  keineNotizen: string;
  keinVerlauf: string;
}

const DEFAULT_LABELS: DossierAkte360Labels = {
  stammdaten: "Stammdaten",
  ziele: "Ziele",
  termine: "Termine & Fristen",
  notizen: "Notizen",
  verlauf: "Verlauf",
  fortschritt: "Fortschritt",
  schrittErledigt: "erledigt",
  schrittOffen: "offen",
  keineStammdaten: "Keine Stammdaten hinterlegt.",
  keineZiele: "Noch keine Ziele angelegt.",
  keineTermine: "Keine Termine oder Fristen vorgemerkt.",
  keineNotizen: "Noch keine Notizen erfasst.",
  keinVerlauf: "Noch keine Verlaufseinträge.",
};

export interface DossierAkte360Props {
  /** Titel der Akte (i. d. R. der Anzeigename des Subjekts — synthetisch/anonymisiert vom Aufrufer). */
  titel: ReactNode;
  /** Optionaler Untertitel (z. B. Aktenzeichen/Fallnummer). */
  untertitel?: ReactNode;
  /** Optionale Kopf-Merkmale (Chips) — z. B. Sprache, Phase, Nationalität. */
  merkmale?: DossierMerkmal[];
  /** Optionaler Status-/Phasen-Slot rechts in der Kopfzeile (z. B. ein `StatusPill`). */
  kopfAktion?: ReactNode;
  /** Überschriften-Ebene des Titels (Default h2 — passt unter eine Seiten-h1). */
  as?: "h1" | "h2" | "h3";
  /** Stammdaten als Label/Wert-Paare (an `DescriptionList` durchgereicht). */
  stammdaten?: DescriptionListItem[];
  /** Ziele mit Schritten + Fortschritt. */
  ziele?: DossierZiel[];
  /** Termine/Fristen. */
  termine?: DossierTermin[];
  /** Notizen/Vermerke (bereits in Anzeige-Reihenfolge — die Komponente sortiert nicht). */
  notizen?: DossierNotiz[];
  /** Verlauf/Audit (append-only) — an das `Timeline`-Primitiv durchgereicht. */
  verlauf?: TimelineItem[];
  /** Welcher Tab initial offen ist. Default: `stammdaten`. */
  defaultTab?: "stammdaten" | "ziele" | "termine" | "notizen" | "verlauf";
  /** Überschreibbare Beschriftungen (deutsche Defaults). */
  labels?: Partial<DossierAkte360Labels>;
  className?: string;
}

/** Maschinenlesbarer `dateTime`-Wert: ISO bei `Date`, sonst der Rohstring. */
function zeitMachine(zeit: string | Date): string {
  return zeit instanceof Date ? zeit.toISOString() : zeit;
}

/** Sichtbarer Zeittext: lokalisiert bei `Date`, sonst der bereits formatierte Rohstring. */
function zeitText(zeit: string | Date): string {
  if (!(zeit instanceof Date)) return zeit;
  return zeit.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Fortschritt in Prozent: expliziter Wert (geklemmt) oder aus erledigten Schritten abgeleitet. */
function zielFortschritt(ziel: DossierZiel): number {
  if (typeof ziel.fortschrittProzent === "number") {
    return Math.min(100, Math.max(0, Math.round(ziel.fortschrittProzent)));
  }
  const schritte = ziel.schritte ?? [];
  if (schritte.length === 0) return 0;
  const erledigt = schritte.filter((s) => s.erledigt).length;
  return Math.round((erledigt / schritte.length) * 100);
}

/** Eine Ziel-Karte: Titel, Meta (Kategorie/Status/Frist), Fortschrittsbalken + Schritt-Checkliste. */
function ZielKarte({
  ziel,
  labels,
}: {
  ziel: DossierZiel;
  labels: DossierAkte360Labels;
}): ReactElement {
  const prozent = zielFortschritt(ziel);
  const schritte = ziel.schritte ?? [];
  const progressId = useId();

  return (
    <article className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 break-words text-sm font-semibold text-foreground">
            {ziel.titel}
          </h3>
          {ziel.status && (
            <Badge tone={ziel.status.tone} className="shrink-0">
              {ziel.status.label}
            </Badge>
          )}
        </div>

        {(ziel.kategorie !== undefined || ziel.frist !== undefined) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {ziel.kategorie !== undefined && (
              <Badge tone="neu">{ziel.kategorie}</Badge>
            )}
            {ziel.frist !== undefined && <span>Frist: {ziel.frist}</span>}
          </div>
        )}

        <div className="mt-1 flex items-center gap-3">
          <Progress
            value={prozent}
            aria-labelledby={progressId}
            className="h-1.5 flex-1"
          />
          <span
            id={progressId}
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
          >
            <span className="sr-only">{labels.fortschritt}: </span>
            {prozent}%
          </span>
        </div>

        {schritte.length > 0 && (
          <ul className="mt-2 space-y-2">
            {schritte.map((schritt) => {
              const erledigt = schritt.erledigt === true;
              return (
                <li
                  key={schritt.id}
                  className="flex items-start gap-2.5 text-sm text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
                      erledigt
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background",
                    )}
                  >
                    {erledigt && <Check className="h-3 w-3" />}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 break-words",
                      erledigt && "text-muted-foreground line-through",
                    )}
                  >
                    <span className="sr-only">
                      {erledigt ? labels.schrittErledigt : labels.schrittOffen}
                      :{" "}
                    </span>
                    {schritt.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

/** Ein Termin-/Frist-Eintrag als semantisches Listenelement. */
function TerminZeile({ termin }: { termin: DossierTermin }): ReactElement {
  return (
    <li className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"
          >
            <Calendar className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            {termin.zeit !== undefined && (
              <time
                dateTime={zeitMachine(termin.zeit)}
                className="text-xs tabular-nums text-muted-foreground"
              >
                {zeitText(termin.zeit)}
              </time>
            )}
            <div className="text-sm font-medium text-foreground">
              {termin.titel}
            </div>
            {termin.beschreibung !== undefined && (
              <div className="mt-0.5 text-sm text-muted-foreground">
                {termin.beschreibung}
              </div>
            )}
          </div>
        </div>
        {termin.badge && (
          <Badge tone={termin.badge.tone} className="shrink-0">
            {termin.badge.label}
          </Badge>
        )}
      </div>
    </li>
  );
}

/** Ein Notiz-/Vermerk-Eintrag. */
function NotizZeile({ notiz }: { notiz: DossierNotiz }): ReactElement {
  return (
    <li className="rounded-md border border-border bg-card p-4">
      {(notiz.autor !== undefined || notiz.zeit !== undefined) && (
        <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          {notiz.autor !== undefined && (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-secondary px-1.5 font-semibold text-foreground">
              {notiz.autor}
            </span>
          )}
          {notiz.zeit !== undefined && (
            <time dateTime={zeitMachine(notiz.zeit)} className="tabular-nums">
              {zeitText(notiz.zeit)}
            </time>
          )}
        </div>
      )}
      <p className="whitespace-pre-wrap text-sm text-foreground">
        {notiz.text}
      </p>
    </li>
  );
}

/** Leerzustand-Wrapper einer Sektion (einheitliches Icon + Text). */
function SektionLeer({
  icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}): ReactElement {
  return <EmptyState icon={icon} title={title} as="h3" />;
}

/**
 * 360°-Dossier-/Fallakte-Sicht (Case-Management): Stammdaten · Ziele · Termine/Fristen · Notizen · Verlauf,
 * komponiert aus den Kit-Primitiven. Rein präsentierend, streng props-getrieben, barrierefrei (BITV 2.2 AA).
 */
export function DossierAkte360({
  titel,
  untertitel,
  merkmale,
  kopfAktion,
  as = "h2",
  stammdaten = [],
  ziele = [],
  termine = [],
  notizen = [],
  verlauf = [],
  defaultTab = "stammdaten",
  labels: labelOverrides,
  className,
}: DossierAkte360Props): ReactElement {
  const labels: DossierAkte360Labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const Heading = as;

  return (
    <div className={cn("space-y-6", className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Heading className="break-words text-xl font-semibold text-foreground">
            {titel}
          </Heading>
          {untertitel !== undefined && (
            <p className="mt-0.5 text-sm text-muted-foreground">{untertitel}</p>
          )}
          {merkmale && merkmale.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {merkmale.map((merkmal, index) => (
                <Badge key={index} tone={merkmal.tone}>
                  {merkmal.label !== undefined && (
                    <span className="font-normal text-muted-foreground">
                      {merkmal.label}:
                    </span>
                  )}
                  {merkmal.value}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {kopfAktion !== undefined && (
          <div className="shrink-0">{kopfAktion}</div>
        )}
      </header>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="stammdaten">{labels.stammdaten}</TabsTrigger>
          <TabsTrigger value="ziele">{labels.ziele}</TabsTrigger>
          <TabsTrigger value="termine">{labels.termine}</TabsTrigger>
          <TabsTrigger value="notizen">{labels.notizen}</TabsTrigger>
          <TabsTrigger value="verlauf">{labels.verlauf}</TabsTrigger>
        </TabsList>

        <TabsContent value="stammdaten" className="mt-4">
          {stammdaten.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <DescriptionList items={stammdaten} />
            </div>
          ) : (
            <SektionLeer icon={IdCard} title={labels.keineStammdaten} />
          )}
        </TabsContent>

        <TabsContent value="ziele" className="mt-4">
          {ziele.length > 0 ? (
            <div className="space-y-3">
              {ziele.map((ziel) => (
                <ZielKarte key={ziel.id} ziel={ziel} labels={labels} />
              ))}
            </div>
          ) : (
            <SektionLeer icon={Target} title={labels.keineZiele} />
          )}
        </TabsContent>

        <TabsContent value="termine" className="mt-4">
          {termine.length > 0 ? (
            <ul className="space-y-2">
              {termine.map((termin) => (
                <TerminZeile key={termin.id} termin={termin} />
              ))}
            </ul>
          ) : (
            <SektionLeer icon={Calendar} title={labels.keineTermine} />
          )}
        </TabsContent>

        <TabsContent value="notizen" className="mt-4">
          {notizen.length > 0 ? (
            <ul className="space-y-3">
              {notizen.map((notiz) => (
                <NotizZeile key={notiz.id} notiz={notiz} />
              ))}
            </ul>
          ) : (
            <SektionLeer icon={StickyNote} title={labels.keineNotizen} />
          )}
        </TabsContent>

        <TabsContent value="verlauf" className="mt-4">
          {verlauf.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-5">
              <Timeline items={verlauf} aria-label={labels.verlauf} />
            </div>
          ) : (
            <SektionLeer icon={History} title={labels.keinVerlauf} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
