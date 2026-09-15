// fachverfahren-kit/components/VorgangDetail — die GENERISCHE Vorgangs-Detailsicht (Antragsdaten · KI · Berechnung ·
// Audit-Trail). Abgeleitet aus etablierten Public-Sector-UX-Mustern für die Vorgangs-Detailsicht: KI-Vorschlag-Karte,
// strukturierte Datensektionen, Audit-Trail. ABER streng config-getrieben: die Sektionen kommen aus `config.detailSektionen`
// (verschachtelte Pfade in `vorgang.antragsdaten`), nicht aus Domänen-Literalen. Ein zweites Verfahren
// rendert unverändert.
import { useId } from "react";
import { Database, FileText, ShieldCheck, Sparkles } from "lucide-react";
import type { DetailSektion, LeistungConfig, Vorgang } from "../types.js";
import type { KiAssistPort } from "../lib/ai-assist.js";
import { useAiAssist } from "../hooks/use-ai-assist.js";
import { cn } from "../lib/cn.js";
import { formatBetrag as formatBetragKit } from "../format.js";
import { Button } from "../ui/button.js";
import { ErrorState } from "./ErrorState.js";
import { KiVorschlag } from "./KiVorschlag.js";
import { KiAssistPanel, type KiRisikoklasse } from "./KiAssistPanel.js";

/** Liest einen verschachtelten Pfad ("a.b.c") aus einem Objekt — defensiv, ohne Annahmen über die Form. */
export function getPfad(obj: unknown, pfad: string): unknown {
  return pfad.split(".").reduce<unknown>((acc, key) => {
    if (
      acc &&
      typeof acc === "object" &&
      key in (acc as Record<string, unknown>)
    ) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Does a field carry a value? The ONE emptiness rule: `formatWert` renders "—" by it, the detail sections hide
 *  empty fields by it, and the case reviewer learns filled/empty by it. */
function isFilled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

/** Formatiert einen unbekannten Wert lesbar (Boolean → Ja/Nein, leer → „—") — generisch, keine Domänen-Logik. */
export function formatWert(value: unknown): string {
  if (!isFilled(value)) return "—";
  if (typeof value === "boolean") return value ? "Ja" : "Nein";
  if (typeof value === "number")
    return new Intl.NumberFormat("de-DE").format(value);
  return String(value);
}

/** Betrag + Einheit lesbar machen — delegiert an den EINEN Kit-Formatierer (kein zweiter, divergierender Formatierer:
 *  die lokale Variante zeigte „120 EUR" statt „120,00 €"). Der Status-Hinweis erfolgt separat am Render-Ort. */
function formatBetrag(betrag: number, einheit: string): string {
  return formatBetragKit(betrag, einheit);
}

/** Ein Label/Wert-Paar — wie `Info` in der Referenz. */
function Feld({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** Eine Datensektion (Titel + Felder), gerendert aus einer `DetailSektion` über die Antragsdaten. */
function Sektion<T>({
  sektion,
  antragsdaten,
}: {
  sektion: DetailSektion;
  antragsdaten: T;
}) {
  // Hide fields without a value, so optional entries (e.g. a missing chip number) do not bloat the view.
  const felder = sektion.felder
    .map((f) => ({ ...f, wert: getPfad(antragsdaten, f.pfad) }))
    .filter((f) => isFilled(f.wert));
  if (felder.length === 0) return null;

  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{sektion.titel}</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {felder.map((f) => (
          <Feld key={f.pfad} label={f.label} value={formatWert(f.wert)} />
        ))}
      </dl>
    </section>
  );
}

/** KI-Vorschlag-Karte mit der subsumierten Berechnung (Betrag + Begründung) — Referenz: KI-Vorschlag-Section. */
function BerechnungsKarte({
  vorgang,
  schwelleAutonom,
  flagLabel,
}: {
  vorgang: Vorgang;
  schwelleAutonom?: number;
  flagLabel?: (flag: string) => string;
}) {
  const b = vorgang.berechnung;
  // HERKUNFT NICHT VERWISCHEN: `berechnung` stammt aus dem REINEN Interpreter (die `tarif`-Regeln der
  // Config), nicht aus einem Modell — deshalb heißt diese Karte „Berechnungsvorschlag" und nicht
  // „KI-Vorschlag". Die Vorfassung trug die KI-Überschrift über der Regel-Ausgabe und spiegelte
  // zusätzlich `b.begruendung` in die KI-Einschätzung; damit sah deterministische Subsumtion wie
  // Modell-Leistung aus. Die KI-Einschätzung wird DARUNTER separat gezeigt — nur wenn es sie gibt.
  const ki = vorgang.ki;

  return (
    <section className="overflow-hidden rounded-md border border-status-info/30 bg-status-info-soft">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-info">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Berechnungsvorschlag · Sie entscheiden
          </span>
          {b && (
            <>
              <div className="mt-3 text-3xl font-semibold text-foreground">
                {formatBetrag(b.betrag, b.einheit)}
                {b.status === "provisional" ? (
                  <span className="ml-2 align-middle text-sm font-medium text-muted-foreground">
                    (vorläufig)
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium text-foreground">
                {b.label}
              </p>
              <p className="mt-2 text-sm text-foreground">{b.begruendung}</p>
              {b.positionen && b.positionen.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-status-info/20 pt-3 text-sm">
                  {b.positionen.map((p, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-4 text-foreground"
                    >
                      <span>{p.label}</span>
                      <span className="font-mono tabular-nums">
                        {formatBetrag(p.betrag, b.einheit)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      {/* KI-Einschätzung NUR bei tatsächlicher Bewertung: ohne gebundenes Modell bleibt `ki`
          ungesetzt — dann entfällt der Block, statt eine 0-Konfidenz zu zeigen, die es nie gab. */}
      {ki ? (
        <div className="border-t border-status-info/20 bg-card/40 p-3">
          <KiVorschlag
            ki={ki}
            {...(schwelleAutonom !== undefined ? { schwelleAutonom } : {})}
            {...(flagLabel ? { flagLabel } : {})}
          />
        </div>
      ) : null}
    </section>
  );
}

/** Audit-Trail / Historie des Vorgangs — append-only, revisionssicher (Referenz: Audit-Trail-Section). */
export function AuditTrail({ history }: { history: Vorgang["history"] }) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <FileText
          className="h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-foreground">Audit-Trail</h2>
      </div>
      <ol className="mt-3 space-y-3">
        {history.map((h, i) => (
          <li key={i} className="relative pl-4 text-sm">
            <span className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full bg-status-info" />
            <div className="text-foreground">{h.aktion}</div>
            {h.detail && (
              <div className="text-xs text-foreground/80">{h.detail}</div>
            )}
            <div className="text-xs text-muted-foreground">
              {new Date(h.ts).toLocaleString("de-DE", {
                dateStyle: "short",
                timeStyle: "short",
              })}{" "}
              · {h.rolle}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Strukturierte Übergabe ans Fachverfahren — die Vorgangsdaten als Schema (Referenz: „Strukturierte Übergabe"). */
function StrukturierteUebergabe({ vorgang }: { vorgang: Vorgang }) {
  const schema = {
    vorgangsnummer: vorgang.vorgangsnummer,
    status: vorgang.status,
    antragsdaten: vorgang.antragsdaten,
    ...(vorgang.berechnung
      ? {
          ergebnis: {
            betrag: vorgang.berechnung.betrag,
            einheit: vorgang.berechnung.einheit,
          },
        }
      : {}),
  };
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-status-info" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">
          Strukturierte Übergabe ans Fachverfahren
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Diese Vorgangsdaten gehen — kein manuelles Abtippen — als Schema an das
        Fachverfahren.
      </p>
      <pre className="mt-3 overflow-x-auto rounded-sm border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
        {JSON.stringify(schema, null, 2)}
      </pre>
    </section>
  );
}

// ── THE REVIEWER BEHIND THE MASK (Z3) ────────────────────────────────────────────────────────────────
// The composable used to be reachable only on a chat page of its own; the mask — where the caseworker decides —
// named none. The reviewer now sits here: it checks THIS case on request and answers with ONE transparent
// suggestion. The decision stays in the EntscheidungPanel; the kit only renders what a port returns.

/** A reviewer the case detail can ask — a named, responsible body behind a KiAssistPort. */
export interface CaseReviewer {
  /** The reviewing body's display name — the suggestion is attributed to a named body, not to "the AI". */
  label: string;
  /** Risk class of what this reviewer can return. Its caller knows the backend's cap; the kit does not guess it. */
  riskClass: KiRisikoklasse;
  /** Runs one review per request; the result carries `reviewErforderlich: true` (HITL in the type). */
  port: KiAssistPort;
}

/**
 * The signals a reviewer receives for one case — PII-poor by construction. The applicant's VALUES stay in the
 * browser: names, addresses and free text are personal data, and a reviewer backend may hand its input to a model
 * as it is. What travels is what the config DECLARES plus the case's own state: which declared fields are filled,
 * which evidence is required and submitted, what the rules computed, which steps the state machine offers from
 * here, and the procedure's legal bases.
 */
export function caseReviewContext<T>(
  config: LeistungConfig<T>,
  vorgang: Vorgang<T>,
): Record<string, unknown> {
  const state = config.statusMachine.states.find(
    (s) => s.key === vorgang.status,
  );
  const calculation = vorgang.berechnung;
  return {
    status: state?.label ?? vorgang.status,
    nextSteps: config.statusMachine.transitions
      .filter((t) => t.from === vorgang.status)
      .map((t) => t.label),
    fields: config.detailSektionen.flatMap((section) =>
      section.felder.map((f) => ({
        section: section.titel,
        field: f.label,
        filled: isFilled(getPfad(vorgang.antragsdaten, f.pfad)),
      })),
    ),
    evidence: vorgang.nachweise.map((n) => ({
      document: n.label,
      required: n.erforderlich === true,
      submitted: n.hochgeladen === true,
    })),
    ...(calculation
      ? {
          calculation: {
            result: calculation.label,
            amount: calculation.betrag,
            unit: calculation.einheit,
            status: calculation.status,
            derivation: calculation.begruendung,
          },
        }
      : {}),
    legalBases: config.rechtsgrundlagen.map((r) => ({
      norm: r.norm,
      title: r.titel,
    })),
  };
}

/** The technical cause of a failed review, when the port's error carries one — shown behind a disclosure. */
function causeOf(error: unknown): string | undefined {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : undefined;
}

/** The reviewer's section in the mask: request → ONE transparent suggestion → the human decides. */
function CaseReviewSection<T>({
  reviewer,
  config,
  vorgang,
}: {
  reviewer: CaseReviewer;
  config: LeistungConfig<T>;
  vorgang: Vorgang<T>;
}) {
  const headingId = useId();
  const busyText = `${reviewer.label} prüft den Vorgang …`;
  const review = useAiAssist(reviewer.port, {
    ladeMeldung: busyText,
    erfolgMeldung: "Prüfvorschlag verfügbar.",
  });
  const requestReview = () => {
    void review.anfragen({
      text: config.label,
      kontext: caseReviewContext(config, vorgang),
    });
  };
  // A failed review is a NAMED situation with a retry — never a silence that reads like "nothing to object".
  const failed =
    !review.laedt && !review.vorschlag && review.state.error !== undefined;
  const cause = causeOf(review.state.error);

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-border bg-card p-5"
    >
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-status-info" aria-hidden="true" />
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {`Prüfung durch ${reviewer.label}`}
        </h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Die zuständige Stelle prüft diesen Vorgang auf Vollständigkeit und
        Stimmigkeit. Ihr Ergebnis ist ein Vorschlag — entscheiden können nur
        Sie.
      </p>
      {review.vorschlag ? (
        <KiAssistPanel
          className="mt-3"
          vorschlag={{
            wert: review.vorschlag.wert,
            quelle: review.vorschlag.quelle,
            konfidenz: review.vorschlag.konfidenz,
            begruendung: review.vorschlag.begruendung,
          }}
          risikoklasse={reviewer.riskClass}
          funktionsName="Prüfung des Vorgangs"
          onVerwerfen={review.zuruecksetzen}
        />
      ) : failed ? (
        <ErrorState
          inline
          className="mt-3"
          title="Die Prüfung konnte gerade nicht erstellt werden."
          description={
            <>
              <p>
                {`${review.state.message ?? ""} Das heißt nicht, dass es nichts zu beanstanden gibt.`.trim()}
              </p>
              {cause ? (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer">
                    Technische Ursache
                  </summary>
                  <p className="mt-1">{cause}</p>
                </details>
              ) : null}
            </>
          }
          onRetry={requestReview}
        />
      ) : (
        <Button
          type="button"
          size="sm"
          className="mt-3"
          onClick={requestReview}
          disabled={review.laedt}
          aria-busy={review.laedt}
        >
          {review.laedt ? busyText : "Prüfung anfordern"}
        </Button>
      )}
    </section>
  );
}

export interface VorgangDetailProps<T = Record<string, unknown>> {
  /** Die Leistungs-Config — liefert `detailSektionen`, KI-Schwelle, Status-Definitionen. */
  config: LeistungConfig<T>;
  /** Der anzuzeigende Vorgang. */
  vorgang: Vorgang<T>;
  /** Optionale Übersetzung eines KI-Flag-Schlüssels (data-driven aus der Leistung). */
  flagLabel?: (flag: string) => string;
  /** Strukturierte Übergabe (Schema-Vorschau) anzeigen. Default: true. */
  zeigeUebergabe?: boolean;
  /** The reviewer behind the mask (see `CaseReviewer`). Omitted ⇒ no reviewer section — the mask as before. */
  reviewer?: CaseReviewer;
  className?: string;
}

/** Die Detailsicht eines Vorgangs: KI-Vorschlag/Berechnung, Datensektionen aus der Config, Audit-Trail. */
export function VorgangDetail<T = Record<string, unknown>>({
  config,
  vorgang,
  flagLabel,
  zeigeUebergabe = true,
  reviewer,
  className,
}: VorgangDetailProps<T>) {
  // Optionaler transparenter KI-Vorschlag (KiAssistPanel) — NUR wenn die Config das Signal trägt.
  // Additiv: die bestehende BerechnungsKarte/KiVorschlag-Sicht bleibt als Fallback unverändert.
  const kiVorschlag = config.ki?.vorschlag;

  return (
    <div className={cn("space-y-6", className)}>
      {kiVorschlag ? (
        <KiAssistPanel
          vorschlag={{
            wert: kiVorschlag.wert,
            quelle: kiVorschlag.quelle,
            konfidenz: kiVorschlag.konfidenz,
            begruendung: kiVorschlag.begruendung,
          }}
          funktionsName={kiVorschlag.funktionsName}
          risikoklasse={kiVorschlag.risikoklasse}
        />
      ) : null}

      <BerechnungsKarte
        vorgang={vorgang as Vorgang}
        {...(config.ki ? { schwelleAutonom: config.ki.schwelleAutonom } : {})}
        {...(flagLabel ? { flagLabel } : {})}
      />

      {/* The reviewer's check sits right under the rule-based proposal it may question. Keyed by the case: a
          suggestion belongs to ONE case and must not survive a switch to the next. */}
      {reviewer ? (
        <CaseReviewSection
          key={vorgang.id}
          reviewer={reviewer}
          config={config}
          vorgang={vorgang}
        />
      ) : null}

      {config.detailSektionen.map((sektion, i) => (
        <Sektion
          key={i}
          sektion={sektion}
          antragsdaten={vorgang.antragsdaten}
        />
      ))}

      {zeigeUebergabe && (
        <StrukturierteUebergabe vorgang={vorgang as Vorgang} />
      )}

      <AuditTrail history={vorgang.history} />
    </div>
  );
}
