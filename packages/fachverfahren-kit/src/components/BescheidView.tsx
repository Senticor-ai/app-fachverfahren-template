// fachverfahren-kit/components/BescheidView — der GENERISCHE, rechtsförmliche Bescheid/die Bescheinigung.
//
// Rendert aus EINEM Vorgang + der LeistungConfig ein verwaltungs-seriöses, druckbares Dokument: Briefkopf
// (config.kommune/label), Aktenzeichen (vorgangsnummer + Datum aus eingangIso), Tenor/Festsetzung aus
// vorgang.berechnung (Betrag/Label/Begründung/Positionen), Rechtsgrundlagen aus config.rechtsgrundlagen sowie
// eine generische Rechtsbehelfsbelehrung. „Als PDF herunterladen" ruft window.print() — KEINE PDF-Lib, das
// Druck-Layout entsteht ausschließlich über Tailwind print:-Modifier (Bildschirm-Chrome wird ausgeblendet).
//
// VOLLSTÄNDIG CONFIG-GETRIEBEN: keine Domänen-Literale. Alles kommt aus props/config/Vorgang. Ein zweites
// Verfahren (Gewerbe/Parkausweis/Bauantrag) rendert ohne jede Änderung an dieser Datei einen gültigen Bescheid.
import { useMemo, type ReactElement } from "react";
import { Building2, Download, Scale } from "lucide-react";

import type { Berechnung, LeistungConfig, Vorgang } from "../types.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Separator } from "../ui/separator.js";
import { formatBetrag as formatBetragKit } from "../format.js";

export interface BescheidViewProps<T = Record<string, unknown>> {
  vorgang: Vorgang<T>;
  config: LeistungConfig<T>;
}

// ── Anzeige-Helfer (generisch, leistungs-agnostisch) ─────────────────────────────────────────
/** Betrag inkl. Einheit formatieren: Euro-Einheiten als Währung, sonst Zahl + Einheit. */
function formatBetrag(betrag: number, einheit: string): string {
  return formatBetragKit(betrag, einheit);
}

/** ISO-Zeitstempel stabil-absolut als Datum rendern (kein Date.now() → keine Hydration-Diskrepanz). */
function formatDatum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function BescheidView<T = Record<string, unknown>>({
  vorgang,
  config,
}: BescheidViewProps<T>): ReactElement {
  const berechnung: Berechnung | undefined = vorgang.berechnung;
  const datum = useMemo(
    () => formatDatum(vorgang.eingangIso),
    [vorgang.eingangIso],
  );

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      {/* Aktions-Leiste — NUR am Bildschirm, im Druck ausgeblendet (print:hidden) */}
      <div className="mb-6 flex items-center justify-end print:hidden">
        <Button
          type="button"
          onClick={() => window.print()}
          aria-label="Bescheid als PDF herunterladen"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Als PDF herunterladen
        </Button>
      </div>

      {/* Das Dokument — am Bildschirm als Karte, im Druck randlos/ohne Schatten (print:*) */}
      <article
        aria-label={`Bescheid zum Vorgang ${vorgang.vorgangsnummer}`}
        className={cn(
          "rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm",
          "print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none",
        )}
      >
        {/* ── Briefkopf: absendende Stelle + Leistung ───────────────────────────────── */}
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            <Building2
              className="mt-0.5 h-7 w-7 shrink-0 text-primary print:text-black"
              aria-hidden="true"
            />
            <div>
              <p className="text-lg font-semibold leading-tight text-foreground print:text-black">
                {config.kommune}
              </p>
              <p className="text-sm text-muted-foreground print:text-black">
                {config.label}
              </p>
            </div>
          </div>
          <dl className="text-right text-sm leading-relaxed text-muted-foreground print:text-black">
            <div className="flex justify-end gap-2">
              <dt className="uppercase tracking-wide">Aktenzeichen</dt>
              <dd className="font-mono font-medium text-foreground print:text-black">
                {vorgang.vorgangsnummer}
              </dd>
            </div>
            <div className="mt-1 flex justify-end gap-2">
              <dt className="uppercase tracking-wide">Datum</dt>
              <dd className="text-foreground print:text-black">
                <time dateTime={vorgang.eingangIso}>{datum}</time>
              </dd>
            </div>
          </dl>
        </header>

        <Separator className="my-6 print:bg-black/20" />

        {/* ── Dokumenttitel ─────────────────────────────────────────────────────────── */}
        <h1 className="text-2xl font-bold tracking-tight text-foreground print:text-black">
          Bescheid
        </h1>
        <p className="mt-1 text-sm text-muted-foreground print:text-black">
          zur Leistung {config.label}
        </p>

        {/* ── Tenor / Festsetzung aus vorgang.berechnung ────────────────────────────── */}
        <section aria-labelledby="bescheid-tenor" className="mt-8">
          <h2
            id="bescheid-tenor"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
          >
            Tenor
          </h2>

          {berechnung ? (
            <div className="mt-3">
              <p className="text-sm leading-relaxed text-foreground print:text-black">
                Es wird festgesetzt:
              </p>
              <div className="mt-3 rounded-md border border-border bg-background p-4 print:border-black/30 print:bg-white">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-muted-foreground print:text-black">
                    {berechnung.label}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums text-foreground print:text-black">
                    {formatBetrag(berechnung.betrag, berechnung.einheit)}
                  </span>
                </div>

                {berechnung.positionen && berechnung.positionen.length > 0 && (
                  <table className="mt-4 w-full border-collapse text-sm">
                    <caption className="sr-only">
                      Einzelpositionen der Festsetzung für Vorgang{" "}
                      {vorgang.vorgangsnummer}
                    </caption>
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground print:border-black/30 print:text-black">
                        <th scope="col" className="py-1.5 font-medium">
                          Position
                        </th>
                        <th
                          scope="col"
                          className="py-1.5 text-right font-medium"
                        >
                          Betrag
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {berechnung.positionen.map((p, i) => (
                        <tr
                          key={i}
                          className="border-b border-border last:border-b-0 print:border-black/15"
                        >
                          <td className="py-1.5 text-foreground print:text-black">
                            {p.label}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-foreground print:text-black">
                            {formatBetrag(p.betrag, berechnung.einheit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Begründung (Tatbestand → Rechtsfolge) */}
              {berechnung.begruendung && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black">
                    Begründung
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground print:text-black">
                    {berechnung.begruendung}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p
              role="status"
              className="mt-3 rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground print:border-black/30 print:bg-white print:text-black"
            >
              Für diesen Vorgang liegt noch keine Festsetzung vor. Der Bescheid
              kann erst nach abgeschlossener Bearbeitung erteilt werden.
            </p>
          )}
        </section>

        {/* ── Rechtsgrundlagen aus config.rechtsgrundlagen ──────────────────────────── */}
        {config.rechtsgrundlagen.length > 0 && (
          <section aria-labelledby="bescheid-rechtsgrundlagen" className="mt-8">
            <h2
              id="bescheid-rechtsgrundlagen"
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
            >
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              Rechtsgrundlagen
            </h2>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground print:text-black">
              {config.rechtsgrundlagen.map((r) => (
                <li
                  key={r.norm}
                  className="flex flex-wrap items-baseline gap-x-2"
                >
                  <span className="font-medium">{r.norm}</span>
                  <span className="text-muted-foreground print:text-black">
                    — {r.titel}
                  </span>
                  {r.satzung && (
                    <span className="text-xs uppercase tracking-wide text-muted-foreground print:text-black">
                      (Satzung)
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Separator className="my-8 print:bg-black/20" />

        {/* ── Rechtsbehelfsbelehrung (generisch) ────────────────────────────────────── */}
        <section aria-labelledby="bescheid-rechtsbehelf" className="mt-2">
          <h2
            id="bescheid-rechtsbehelf"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
          >
            Rechtsbehelfsbelehrung
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground print:text-black">
            Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe
            Widerspruch erhoben werden. Der Widerspruch ist schriftlich oder zur
            Niederschrift bei der erlassenden Stelle ({config.kommune})
            einzulegen. Die Frist beginnt mit dem Tag der Bekanntgabe dieses
            Bescheides. Erfolgt die Bekanntgabe durch die Post im Inland, gilt
            der Bescheid am dritten Tag nach Aufgabe zur Post als bekannt
            gegeben. Wird der Widerspruch nicht oder nicht fristgerecht erhoben,
            wird der Bescheid bestandskräftig.
          </p>
        </section>

        {/* ── Unterschrift / Fußzeile ───────────────────────────────────────────────── */}
        <footer className="mt-10 flex items-end justify-between gap-6 text-sm text-muted-foreground print:text-black">
          <p>
            {config.kommune}
            <br />
            <span className="text-muted-foreground print:text-black">
              Im Auftrag
            </span>
          </p>
          <p className="text-right">
            Aktenzeichen{" "}
            <span className="font-mono text-foreground print:text-black">
              {vorgang.vorgangsnummer}
            </span>
          </p>
        </footer>
      </article>
    </section>
  );
}
