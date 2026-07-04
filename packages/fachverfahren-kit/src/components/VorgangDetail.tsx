// fachverfahren-kit/components/VorgangDetail — die GENERISCHE Vorgangs-Detailsicht (Antragsdaten · KI · Berechnung ·
// Audit-Trail). Abgeleitet aus etablierten Public-Sector-UX-Mustern für die Vorgangs-Detailsicht: KI-Vorschlag-Karte,
// strukturierte Datensektionen, Audit-Trail. ABER streng config-getrieben: die Sektionen kommen aus `config.detailSektionen`
// (verschachtelte Pfade in `vorgang.antragsdaten`), nicht aus Domänen-Literalen. Ein zweites Verfahren
// rendert unverändert.
import { Database, FileText, Sparkles } from "lucide-react";
import type {
  DetailSektion,
  KiEinschaetzung,
  LeistungConfig,
  Vorgang,
} from "../types.js";
import { cn } from "../lib/cn.js";
import { formatBetrag as formatBetragKit } from "../format.js";
import { KiVorschlag } from "./KiVorschlag.js";
import { KiAssistPanel } from "./KiAssistPanel.js";

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

/** Formatiert einen unbekannten Wert lesbar (Boolean → Ja/Nein, leer → „—") — generisch, keine Domänen-Logik. */
export function formatWert(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
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
  // Felder ohne Wert ausblenden, damit optionale Angaben (z.B. fehlende Chip-Nr.) die Sicht nicht aufblähen.
  const felder = sektion.felder
    .map((f) => ({ ...f, wert: getPfad(antragsdaten, f.pfad) }))
    .filter((f) => f.wert !== undefined && f.wert !== null && f.wert !== "");
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
  // Begründung der Subsumtion in die KI-Anzeige spiegeln (KI assistiert, Mensch entscheidet).
  const ki: KiEinschaetzung = b?.begruendung
    ? { ...vorgang.ki, begruendung: vorgang.ki.begruendung ?? b.begruendung }
    : vorgang.ki;

  return (
    <section className="overflow-hidden rounded-md border border-status-info/30 bg-status-info-soft">
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-status-info">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            KI-Vorschlag · Sie entscheiden
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
      <div className="border-t border-status-info/20 bg-card/40 p-3">
        <KiVorschlag
          ki={ki}
          {...(schwelleAutonom !== undefined ? { schwelleAutonom } : {})}
          {...(flagLabel ? { flagLabel } : {})}
        />
      </div>
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

export interface VorgangDetailProps<T = Record<string, unknown>> {
  /** Die Leistungs-Config — liefert `detailSektionen`, KI-Schwelle, Status-Definitionen. */
  config: LeistungConfig<T>;
  /** Der anzuzeigende Vorgang. */
  vorgang: Vorgang<T>;
  /** Optionale Übersetzung eines KI-Flag-Schlüssels (data-driven aus der Leistung). */
  flagLabel?: (flag: string) => string;
  /** Strukturierte Übergabe (Schema-Vorschau) anzeigen. Default: true. */
  zeigeUebergabe?: boolean;
  className?: string;
}

/** Die Detailsicht eines Vorgangs: KI-Vorschlag/Berechnung, Datensektionen aus der Config, Audit-Trail. */
export function VorgangDetail<T = Record<string, unknown>>({
  config,
  vorgang,
  flagLabel,
  zeigeUebergabe = true,
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
