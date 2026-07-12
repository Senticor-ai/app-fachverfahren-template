// fachverfahren-kit/components/FourEyesReview — 4-Augen-UX für rechtsnahe Entscheidungen
// (Vorlage → Zweitprüfung → Freigabe/Ablehnung).
//
// GENERISCH: keine Domänen-Literale — Ersteller, Entscheidung, Begründung und IDs kommen ausschließlich
// aus den Props/der Config; verwendbar für jedes Fachverfahren (kommunal, HR, Web-Antrag …).
//
// KERN (Vier-Augen-Prinzip): Selbstfreigabe wird verhindert — ist der prüfende Nutzer zugleich der
// Ersteller der Vorlage, sind Freigeben/Ablehnen DEAKTIVIERT mit sichtbarem Hinweis. Diese UI ist die
// SICHTBARE Schicht; die verbindliche Durchsetzung MUSS serverseitig erfolgen (four-eyes-server) —
// ein clientseitiges `disabled` ist niemals eine Sicherheitsgrenze.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): Statuszeile als role="status" (höfliche Live-Ansage),
// Aktionen sind echte <button>, sichtbarer Fokus über die Button-Primitive, Pflicht-Begründung der
// Ablehnung wird per FormField/FormMessage validiert und role="alert" angesagt; Information nie nur über
// Farbe (Wording + Icon-Text tragen die Bedeutung), Icons dekorativ aria-hidden, motion-reduce respektiert.
import * as React from "react";
import { CheckCircle2, ShieldAlert, XCircle } from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import {
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from "../ui/form-field.js";
import { useStatusRegion } from "./StatusRegion.js";

/** Lebenszyklus einer rechtsnahen Entscheidung im Vier-Augen-Verfahren. */
export type FourEyesStatus =
  "entwurf" | "vorgelegt" | "inPruefung" | "freigegeben" | "abgelehnt";

/** Die zu prüfende Vorlage (vom Ersteller verfasst, alle Werte generisch aus der Config). */
export interface FourEyesVorlage {
  /** Stabile Kennung des Erstellers — Grundlage der Selbstfreigabe-Sperre. */
  erstellerId: string;
  /** Zeitpunkt der Erstellung als ISO-8601-String. */
  erstelltAmIso: string;
  /** Die getroffene fachliche Entscheidung (frei, domänenneutral). */
  entscheidung: string;
  /** Optionale Begründung des Erstellers. */
  begruendung?: string;
}

/** Kontext des aktuell prüfenden Nutzers. */
export interface FourEyesPruefer {
  /** Kennung des aktuell angemeldeten, prüfenden Nutzers. */
  aktuelleNutzerId: string;
}

export interface FourEyesReviewProps {
  /** Fachlicher Vorgang, zu dem diese Entscheidung gehört (für Ansagen/Tests). */
  vorgangId: string;
  /** Die vorgelegte Entscheidung samt Ersteller-Metadaten. */
  vorlage: FourEyesVorlage;
  /** Der prüfende Nutzer (zweite Person). */
  pruefer: FourEyesPruefer;
  /** Aktueller Status des Vorgangs. */
  status: FourEyesStatus;
  /** Legt den Entwurf zur Zweitprüfung vor (Ersteller-Aktion). */
  onVorlegen?: (() => Promise<void>) | undefined;
  /** Gibt die Vorlage frei (nur durch eine zweite Person). */
  onFreigeben?: (() => Promise<void>) | undefined;
  /** Lehnt die Vorlage mit Pflicht-Begründung ab (nur durch eine zweite Person). */
  onAblehnen?: ((grund: string) => Promise<void>) | undefined;
  /** Optionale zusätzliche Klassen. */
  className?: string | undefined;
}

type RunningAction = "vorlegen" | "freigeben" | "ablehnen" | null;

/** Statische, generische Darstellung je Status — Wording trägt die Bedeutung (nicht die Farbe allein). */
const STATUS_META: Record<
  FourEyesStatus,
  {
    label: string;
    tone: "neu" | "info" | "warn" | "ok" | "block";
    satz: string;
  }
> = {
  entwurf: {
    label: "Entwurf",
    tone: "neu",
    satz: "Entwurf — noch nicht zur Zweitprüfung vorgelegt.",
  },
  vorgelegt: {
    label: "Vorgelegt",
    tone: "info",
    satz: "Wartet auf Zweitprüfung durch eine zweite Person.",
  },
  inPruefung: {
    label: "In Prüfung",
    tone: "warn",
    satz: "In Zweitprüfung — Entscheidung steht aus.",
  },
  freigegeben: {
    label: "Freigegeben",
    tone: "ok",
    satz: "Freigegeben durch die Zweitprüfung.",
  },
  abgelehnt: {
    label: "Abgelehnt",
    tone: "block",
    satz: "Abgelehnt durch die Zweitprüfung.",
  },
};

/** Sichtbarer Hinweis bei Selbstfreigabe — exakt nach Spec, an einer Stelle für Sperre + Ansage. */
const SELBST_HINWEIS =
  "Vier-Augen-Prinzip: Freigabe nur durch eine zweite Person.";

function formatZeitpunkt(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(datum);
  } catch {
    return iso;
  }
}

/**
 * Vier-Augen-Prüfkarte. Zeigt die Vorlage, den Status als Live-Ansage und — sofern erlaubt — die
 * Aktionen Vorlegen/Freigeben/Ablehnen. Die Ablehnung erzwingt eine Pflicht-Begründung.
 *
 * Die Selbstfreigabe-Sperre (`istErsteller`) ist clientseitig nur die SICHTBARE Schicht; die
 * verbindliche Durchsetzung obliegt dem Server (four-eyes-server).
 */
export function FourEyesReview({
  vorgangId,
  vorlage,
  pruefer,
  status,
  onVorlegen,
  onFreigeben,
  onAblehnen,
  className,
}: FourEyesReviewProps) {
  const { announce } = useStatusRegion();

  // KERN: Selbstfreigabe verhindern — derselbe Nutzer darf seine eigene Vorlage nicht freigeben/ablehnen.
  const istErsteller = pruefer.aktuelleNutzerId === vorlage.erstellerId;

  const [grund, setGrund] = React.useState("");
  const [grundFehler, setGrundFehler] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState<RunningAction>(null);

  const meta = STATUS_META[status];
  const offen = status === "vorgelegt" || status === "inPruefung";
  const istEndstatus = status === "freigegeben" || status === "abgelehnt";

  // Entscheidungs-Aktionen sind nur in offenen Stati, durch eine zweite Person und mit Handler möglich.
  const kannEntscheiden = offen && !istErsteller;
  const grundId = React.useId();
  // Stabile, kollisionsfreie id für die sr-only-Begründung — NICHT aus dem freien `vorgangId`,
  // der ungültige Zeichen/Leerzeichen enthalten oder zwischen Karten kollidieren kann.
  const hinweisId = React.useId();

  // Status (und ggf. der Selbstfreigabe-Hinweis) wird höflich angesagt — EINE Ansage-Quelle.
  React.useEffect(() => {
    const satz =
      istErsteller && offen ? `${meta.satz} ${SELBST_HINWEIS}` : meta.satz;
    announce(satz, "polite");
  }, [announce, meta.satz, istErsteller, offen]);

  async function lauf(
    action: Exclude<RunningAction, null>,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (running !== null) {
      return;
    }
    setRunning(action);
    try {
      await fn();
    } catch {
      announce("Aktion fehlgeschlagen. Bitte erneut versuchen.", "assertive");
    } finally {
      setRunning(null);
    }
  }

  function handleVorlegen(): void {
    if (!onVorlegen) {
      return;
    }
    void lauf("vorlegen", () => onVorlegen());
  }

  function handleFreigeben(): void {
    if (!kannEntscheiden || !onFreigeben) {
      return;
    }
    void lauf("freigeben", () => onFreigeben());
  }

  function handleAblehnen(): void {
    if (!kannEntscheiden || !onAblehnen) {
      return;
    }
    const text = grund.trim();
    if (text.length === 0) {
      // Pflicht-Begründung: Validierung sichtbar + per role="alert" angesagt, Fokus auf das Feld.
      setGrundFehler("Bitte geben Sie eine Begründung für die Ablehnung an.");
      announce("Ablehnung benötigt eine Begründung.", "assertive");
      const el =
        typeof document !== "undefined"
          ? document.getElementById(grundId)
          : null;
      if (el instanceof HTMLElement) {
        el.focus();
      }
      return;
    }
    setGrundFehler(null);
    void lauf("ablehnen", () => onAblehnen(text));
  }

  const busy = running !== null;

  return (
    <Card className={cn("w-full", className)} data-vorgang-id={vorgangId}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Vier-Augen-Prüfung</CardTitle>
            <CardDescription>
              Zweitprüfung einer rechtsnahen Entscheidung. Freigabe nur durch
              eine zweite Person.
            </CardDescription>
          </div>
          {/* Badge trägt den Status redundant zur Live-Ansage; Bedeutung steht im Text, nicht in der Farbe. */}
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {/* Statuszeile als höfliche Live-Region — eine zweite Person erfährt den Stand sofort. */}
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm font-medium text-foreground"
        >
          {status === "vorgelegt"
            ? "Wartet auf Zweitprüfung durch eine zweite Person."
            : meta.satz}
        </p>

        {/* Die vorgelegte Entscheidung (generische Inhalte aus der Vorlage). */}
        <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-6 sm:gap-y-2">
          <dt className="font-medium text-muted-foreground">Erstellt von</dt>
          <dd className="text-foreground">{vorlage.erstellerId}</dd>

          <dt className="font-medium text-muted-foreground">Erstellt am</dt>
          <dd className="text-foreground">
            <time dateTime={vorlage.erstelltAmIso}>
              {formatZeitpunkt(vorlage.erstelltAmIso)}
            </time>
          </dd>

          <dt className="font-medium text-muted-foreground">Entscheidung</dt>
          <dd className="font-medium text-foreground">
            {vorlage.entscheidung}
          </dd>

          {vorlage.begruendung ? (
            <>
              <dt className="font-medium text-muted-foreground">Begründung</dt>
              <dd className="whitespace-pre-line text-foreground">
                {vorlage.begruendung}
              </dd>
            </>
          ) : null}
        </dl>

        {/* Selbstfreigabe-Sperre: sichtbarer, dauerhaft lesbarer Hinweis (nicht nur Live-Ansage). */}
        {istErsteller && offen ? (
          <div
            role="note"
            className="flex items-start gap-2 rounded-lg border border-status-warn/40 bg-status-warn-soft p-3 text-sm text-foreground"
          >
            <ShieldAlert
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{SELBST_HINWEIS}</span>
          </div>
        ) : null}

        {/* Pflicht-Begründung für die Ablehnung — nur zeigen, wenn eine Entscheidung möglich ist. */}
        {kannEntscheiden ? (
          <FormField id={grundId} invalid={grundFehler !== null}>
            <FormLabel required>Begründung bei Ablehnung</FormLabel>
            <FormControl>
              <textarea
                rows={3}
                value={grund}
                disabled={busy}
                aria-required="true"
                placeholder="Sachlicher Grund der Ablehnung"
                onChange={(e) => {
                  setGrund(e.target.value);
                  if (
                    grundFehler !== null &&
                    e.target.value.trim().length > 0
                  ) {
                    setGrundFehler(null);
                  }
                }}
                className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
              />
            </FormControl>
            <FormDescription>
              Bei Freigabe nicht erforderlich. Eine Ablehnung muss begründet
              werden.
            </FormDescription>
            <FormMessage>{grundFehler}</FormMessage>
          </FormField>
        ) : null}

        {istEndstatus ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {status === "freigegeben" ? (
              <CheckCircle2
                aria-hidden="true"
                className="size-4 shrink-0 text-status-ok"
              />
            ) : (
              <XCircle
                aria-hidden="true"
                className="size-4 shrink-0 text-status-block"
              />
            )}
            <span>{meta.satz}</span>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-end gap-2">
        {status === "entwurf" && onVorlegen ? (
          <Button
            type="button"
            variant="default"
            disabled={busy}
            aria-busy={running === "vorlegen" || undefined}
            onClick={handleVorlegen}
          >
            Zur Zweitprüfung vorlegen
          </Button>
        ) : null}

        {offen ? (
          <>
            <Button
              type="button"
              variant="destructive"
              disabled={!kannEntscheiden || busy || !onAblehnen}
              aria-busy={running === "ablehnen" || undefined}
              aria-describedby={istErsteller ? hinweisId : undefined}
              onClick={handleAblehnen}
            >
              Ablehnen
            </Button>
            <Button
              type="button"
              variant="default"
              disabled={!kannEntscheiden || busy || !onFreigeben}
              aria-busy={running === "freigeben" || undefined}
              aria-describedby={istErsteller ? hinweisId : undefined}
              onClick={handleFreigeben}
            >
              Freigeben
            </Button>
            {/* Versteckte Beschreibung verknüpft die gesperrten Aktionen mit dem Grund (Screenreader). */}
            {istErsteller ? (
              <span id={hinweisId} className="sr-only">
                {SELBST_HINWEIS}
              </span>
            ) : null}
          </>
        ) : null}
      </CardFooter>
    </Card>
  );
}
