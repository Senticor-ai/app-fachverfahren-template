// fachverfahren-kit/components/EPaymentPanel — verbindliche Bezahl-UI für Gebühren (Prüfen → Zahlen → Beleg).
//
// GENERISCH: keine Domänen-Literale. Betrag, Positionen, Währung und die wählbaren Zahlarten kommen
// ausschließlich aus props/Config — ein zweites Verfahren (HR-Gebühr, Web-Shop) läuft unverändert.
// BEWUSST OHNE KI und OHNE Optimistic-UI: der Zahlstatus ist verbindlich und folgt allein der Server-
// Antwort (onZahlen). Kein Doppel-Submit (Button disabled während submitting), bei Fehler bleibt der
// Betrag erhalten und kann erneut bezahlt werden.
//
// BARRIEREFREI (BITV 2.0 / WCAG 2.2 AA): echtes <form>, <fieldset>/<legend> für die Zahlart-Radios
// (native role=radio, Pfeiltasten via RadioGroup), sichtbarer Fokus (focus-visible:ring-2), jede
// Zustandsänderung wird über die zentrale Ansage (aria-live) angesagt, Information nie nur über Farbe
// (Icon + Text), Icons dekorativ (aria-hidden), Ziel-Größe der Aktionen ≥ 24px, motion-reduce respektiert.
import * as React from "react";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

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
import { Separator } from "../ui/separator.js";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group.js";
import { announcePoliteness, useViewState } from "../hooks/use-view-state.js";
import { StatusRegion } from "./StatusRegion.js";
import { formatBetrag as formatBetragKit } from "../format.js";

/** Eine Gebührenposition der Aufschlüsselung (Check-Your-Answers vor dem Zahlen). */
export interface EPaymentPosition {
  /** Bezeichnung der Position (generisch, aus der Config). */
  bezeichnung: string;
  /** Teilbetrag in derselben Währung wie der Gesamtbetrag. */
  betrag: number;
}

/** Eine wählbare Zahlart (z. B. giropay, Lastschrift, Kreditkarte) — rein aus der Config. */
export interface EPaymentZahlart {
  /** Stabile, server-bekannte Kennung (wird an onZahlen übergeben). */
  id: string;
  /** Menschenlesbares Label für das Radio. */
  label: string;
}

export interface EPaymentPanelProps {
  /** Zu zahlender Gesamtbetrag. */
  betrag: number;
  /** ISO-4217-Währungscode (Default: EUR). */
  waehrung?: string | undefined;
  /** Optionale Aufschlüsselung; Summe sollte dem Gesamtbetrag entsprechen. */
  positionen?: readonly EPaymentPosition[] | undefined;
  /** Wählbare Zahlarten (mindestens eine erwartet). */
  zahlarten: readonly EPaymentZahlart[];
  /**
   * Verbindlicher Server-Zahlvorgang. Resolved = bezahlt (Beleg), rejected = fehlgeschlagen.
   * KEIN Optimistic-UI: der Erfolg wird erst nach Resolve angezeigt.
   */
  onZahlen: (zahlartId: string) => Promise<void>;
  /** Optionale Überschrift (Default: „Gebühr bezahlen"). */
  titel?: string | undefined;
  /** Wird nach erfolgreichem Zahlen aufgerufen (z. B. weiter zum Bescheid). */
  onFertig?: (() => void) | undefined;
  className?: string | undefined;
}

/** Daten des Erfolgs-Belegs (rein clientseitig erfasst — die Verbindlichkeit liegt im Server-Resolve). */
interface Beleg {
  readonly zahlartId: string;
  readonly zahlartLabel: string;
  readonly betrag: number;
  readonly zeitpunkt: string;
}

/**
 * Formatiert einen Betrag verbindlich als Währung im deutschen Locale.
 * Fällt bei unbekannter Währung NICHT auf rohe Zahlen zurück, sondern nutzt Intl-Default.
 */
function formatBetrag(value: number, waehrung: string): string {
  // Zentrale, cent-bewusste Formatierung (format.ts) — teilt bei Währungs-Einheiten durch 100 + Währungs-Fallback.
  return formatBetragKit(value, waehrung);
}

/**
 * Verbindliche Bezahl-Karte: Aufschlüsselung prüfen → Zahlart wählen → „Jetzt X,XX € zahlen" →
 * Server-Antwort → Beleg oder Wiederholung. Treibt die Darstellung allein aus useViewState.
 *
 * @example
 * <EPaymentPanel
 *   betrag={42.5}
 *   positionen={[{ bezeichnung: "Grundgebühr", betrag: 40 }, { bezeichnung: "Zuschlag", betrag: 2.5 }]}
 *   zahlarten={[{ id: "giropay", label: "giropay" }, { id: "lastschrift", label: "SEPA-Lastschrift" }]}
 *   onZahlen={(id) => port.zahlen(id)}
 * />
 */
export function EPaymentPanel({
  betrag,
  waehrung = "EUR",
  positionen,
  zahlarten,
  onZahlen,
  titel = "Gebühr bezahlen",
  onFertig,
  className,
}: EPaymentPanelProps) {
  // EINE Zustands-Wahrheit: idle/ready = prüfen, loading = submitting, success = Beleg, error = fehlgeschlagen.
  const view = useViewState<Beleg>({
    initial: "ready",
    messages: {
      ready: "Bitte prüfen Sie die Gebühr und wählen Sie eine Zahlart.",
      loading: "Zahlung wird verarbeitet …",
      success: "Zahlung erfolgreich. Ein Beleg liegt vor.",
      error:
        "Die Zahlung ist fehlgeschlagen. Der Betrag ist erhalten — bitte erneut versuchen.",
    },
  });
  const status = view.state.status;
  const submitting = status === "loading";
  const bezahlt = status === "success";

  const [zahlartId, setZahlartId] = React.useState<string>(
    () => zahlarten[0]?.id ?? "",
  );
  const [fehlerHinweis, setFehlerHinweis] = React.useState<string | null>(null);

  // Eindeutige IDs für a11y-Verdrahtung (legend, Fehlertext) — stabil pro Instanz.
  const reactId = React.useId();
  const legendId = `${reactId}-zahlart`;
  const fehlerId = `${reactId}-fehler`;
  const summeId = `${reactId}-summe`;

  const betragText = formatBetrag(betrag, waehrung);
  const gewaehlte = zahlarten.find((z) => z.id === zahlartId);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Doppel-Submit-Schutz: während eines laufenden Server-Vorgangs nichts auslösen.
    if (submitting) return;
    if (!gewaehlte) {
      setFehlerHinweis("Bitte wählen Sie eine Zahlart aus.");
      return;
    }
    setFehlerHinweis(null);
    const id = gewaehlte.id;
    const label = gewaehlte.label;
    // Verbindlich: erst nach Server-Resolve gilt die Zahlung als erfolgt (kein Optimistic-UI).
    view.start();
    try {
      await onZahlen(id);
      view.complete({
        zahlartId: id,
        zahlartLabel: label,
        betrag,
        zeitpunkt: new Date().toISOString(),
      });
    } catch (error) {
      // Betrag bleibt unverändert erhalten; der Nutzer kann erneut zahlen.
      view.fail(error);
    }
  }

  return (
    <Card className={cn("w-full max-w-xl", className)}>
      {/* Zentrale Ansage jeder Zustandsänderung (aria-live), gekoppelt an die ViewState-Meldung. */}
      <StatusRegion
        message={view.state.message ?? ""}
        politeness={announcePoliteness(status)}
        busy={submitting}
      />

      {bezahlt ? (
        <BelegAnsicht
          beleg={view.state.data}
          waehrung={waehrung}
          titel={titel}
          onFertig={onFertig}
          formatBetrag={formatBetrag}
        />
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" aria-hidden="true" />
              {titel}
            </CardTitle>
            <CardDescription>
              Bitte prüfen Sie die Gebühr und wählen Sie eine Zahlart. Die
              Zahlung ist verbindlich.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* ── Aufschlüsselung / Check-Your-Answers ─────────────────────────────────────────── */}
            {positionen && positionen.length > 0 && (
              <section aria-labelledby={summeId}>
                <h3
                  id={summeId}
                  className="text-sm font-medium text-foreground"
                >
                  Gebührenaufschlüsselung
                </h3>
                <dl className="mt-2 divide-y divide-border rounded-md border border-border bg-surface">
                  {positionen.map((p, i) => (
                    <div
                      key={`${p.bezeichnung}-${i}`}
                      className="flex items-baseline justify-between gap-4 px-3 py-2"
                    >
                      <dt className="text-sm text-muted-foreground">
                        {p.bezeichnung}
                      </dt>
                      <dd className="text-sm font-medium tabular-nums text-foreground">
                        {formatBetrag(p.betrag, waehrung)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {/* Gesamtbetrag — prominent, mit Einheit (nie nur Zahl). */}
            <div className="flex items-baseline justify-between gap-4 rounded-md bg-status-info-soft px-3 py-3">
              <span className="text-sm font-medium text-foreground">
                Zu zahlender Betrag
              </span>
              <span className="text-lg font-semibold tabular-nums text-foreground">
                {betragText}
              </span>
            </div>

            <Separator />

            {/* ── Zahlart-Auswahl: fieldset/legend + RadioGroup (native role=radio) ────────────── */}
            <fieldset
              className="space-y-3"
              aria-describedby={fehlerHinweis ? fehlerId : undefined}
            >
              <legend
                id={legendId}
                className="text-sm font-medium text-foreground"
              >
                Zahlart wählen
              </legend>
              <RadioGroup
                aria-labelledby={legendId}
                value={zahlartId}
                onValueChange={(value) => {
                  setZahlartId(value);
                  setFehlerHinweis(null);
                  // Nach einem Fehlversuch zurück in den Prüf-Zustand, damit die Ansage stimmt.
                  if (status === "error") view.set("ready");
                }}
                disabled={submitting}
                className="gap-2"
              >
                {zahlarten.map((z) => {
                  const itemId = `${reactId}-za-${z.id}`;
                  return (
                    <label
                      key={z.id}
                      htmlFor={itemId}
                      className={cn(
                        "flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors ease-out motion-reduce:transition-none",
                        "hover:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                        zahlartId === z.id &&
                          "border-primary bg-status-info-soft",
                        submitting && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <RadioGroupItem id={itemId} value={z.id} />
                      <span className="text-foreground">{z.label}</span>
                    </label>
                  );
                })}
              </RadioGroup>

              {fehlerHinweis && (
                <p
                  id={fehlerId}
                  role="alert"
                  className="flex items-center gap-1.5 text-sm text-status-block"
                >
                  <XCircle
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {fehlerHinweis}
                </p>
              )}
            </fieldset>

            {/* ── Fehlerzustand des Server-Vorgangs (Betrag bleibt erhalten) ───────────────────── */}
            {status === "error" && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-status-block/30 bg-status-block-soft px-3 py-2 text-sm text-foreground"
              >
                <XCircle
                  className="mt-0.5 h-4 w-4 shrink-0 text-status-block"
                  aria-hidden="true"
                />
                <span>
                  {view.state.message ??
                    "Die Zahlung ist fehlgeschlagen. Der Betrag ist erhalten — bitte erneut versuchen."}
                </span>
              </p>
            )}
          </CardContent>

          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || !gewaehlte}
              aria-busy={submitting || undefined}
            >
              {submitting ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                  Zahlung wird verarbeitet …
                </>
              ) : status === "error" ? (
                <>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Erneut {betragText} zahlen
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Jetzt {betragText} zahlen
                </>
              )}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Mit dem Klick lösen Sie eine verbindliche Zahlung aus.
            </p>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}

EPaymentPanel.displayName = "EPaymentPanel";

// ── Beleg-Ansicht (Erfolgs-Zustand) ───────────────────────────────────────────────────────────────

interface BelegAnsichtProps {
  beleg: Beleg | undefined;
  waehrung: string;
  titel: string;
  onFertig: (() => void) | undefined;
  formatBetrag: (value: number, waehrung: string) => string;
}

/** Verbindlicher Beleg nach erfolgreicher Server-Zahlung. */
function BelegAnsicht({
  beleg,
  waehrung,
  titel,
  onFertig,
  formatBetrag: fmt,
}: BelegAnsichtProps) {
  const zeitText = beleg
    ? new Intl.DateTimeFormat("de-DE", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(beleg.zeitpunkt))
    : "";

  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-status-ok" aria-hidden="true" />
          Zahlung erfolgreich
        </CardTitle>
        <CardDescription>{titel} — Ihr Beleg liegt vor.</CardDescription>
      </CardHeader>

      <CardContent>
        <dl className="divide-y divide-border rounded-md border border-status-ok/30 bg-status-ok-soft">
          <div className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-sm text-muted-foreground">Betrag</dt>
            <dd className="text-sm font-semibold tabular-nums text-foreground">
              {beleg ? fmt(beleg.betrag, waehrung) : ""}
            </dd>
          </div>
          {beleg && (
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="text-sm text-muted-foreground">Zahlart</dt>
              <dd className="text-sm font-medium text-foreground">
                {beleg.zahlartLabel}
              </dd>
            </div>
          )}
          {beleg && (
            <div className="flex items-baseline justify-between gap-4 px-3 py-2">
              <dt className="text-sm text-muted-foreground">Zeitpunkt</dt>
              <dd className="text-sm font-medium text-foreground">
                {zeitText}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>

      {onFertig && (
        <CardFooter>
          <Button type="button" className="w-full" onClick={onFertig}>
            Weiter
          </Button>
        </CardFooter>
      )}
    </>
  );
}
