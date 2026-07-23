// fachverfahren-kit/components/BescheidView — der GENERISCHE, rechtsförmliche Bescheid/die Bescheinigung.
//
// Rendert aus EINEM Vorgang + der LeistungConfig ein verwaltungs-seriöses, druckbares Dokument: Briefkopf
// (config.kommune/label), Aktenzeichen (vorgangsnummer + Datum aus eingangIso), Tenor/Festsetzung aus
// vorgang.berechnung (Betrag/Label/Begründung/Positionen), Rechtsgrundlagen aus config.rechtsgrundlagen sowie
// eine REGIME-NEUTRALE Rechtsbehelfsbelehrung (Widerspruch/Einspruch/Klage). Ist ein eingefrorener
// `belehrung`-Snapshot gesetzt (bestandskräftiger Bescheid), rendert die Belehrung DARAUS — nie aus der
// lebenden Config. „Als PDF herunterladen" ruft window.print() — KEINE PDF-Lib, das Druck-Layout entsteht
// ausschließlich über Tailwind print:-Modifier (Bildschirm-Chrome wird ausgeblendet).
//
// VOLLSTÄNDIG CONFIG-GETRIEBEN: keine Domänen-Literale. Alles kommt aus props/config/Vorgang. Ein zweites
// Verfahren (Gewerbe/Parkausweis/Bauantrag) rendert ohne jede Änderung an dieser Datei einen gültigen Bescheid.
import { useMemo, type ReactElement } from "react";
import { Building2, Download, Scale } from "lucide-react";

import type {
  Berechnung,
  LeistungConfig,
  RechtsbehelfConfig,
  Vorgang,
} from "../types.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Separator } from "../ui/separator.js";
import { formatBetrag as formatBetragKit } from "../format.js";

/** Die EINGEFRORENE Rechtsbehelfs-/Bekanntgabe-Belehrung, wie sie beim Erlass festgeschrieben wurde. */
export interface BescheidBelehrung {
  rechtsbehelf: RechtsbehelfConfig;
  fiktionTage: number;
  fiktionNorm: string;
}

export interface BescheidViewProps<T = Record<string, unknown>> {
  vorgang: Vorgang<T>;
  config: LeistungConfig<T>;
  /**
   * Die EINGEFRORENE Belehrung eines bestandskräftigen Bescheids. Ist sie gesetzt, rendert die
   * Rechtsbehelfsbelehrung AUSSCHLIESSLICH aus diesem selbsttragenden Snapshot (regime-neutral:
   * Widerspruch/Einspruch/Klage) — NIEMALS aus der (lebenden) `config`, sonst schriebe eine spätere
   * Regime-/Fristen-Umstellung einen VA von 2024 rückwirkend um. Fehlt sie (SB-Vorschau vor Erlass),
   * fällt die Belehrung auf den generischen, config-getriebenen Widerspruchs-Text zurück.
   */
  belehrung?: BescheidBelehrung;
  /**
   * Optionale URL zum AMTLICHEN, server-generierten Bescheid-PDF (owner-scoped Download, hash-beweisbar).
   * Ist sie gesetzt, bietet die Ansicht einen echten Datei-Download an (statt nur `window.print()`); der
   * Server bleibt die Wahrheit über die Bytes. Fehlt sie, bleibt allein die Druck-Aktion (SB-Vorschau/DEV).
   */
  pdfDownloadUrl?: string;
}

/** Name des Rechtsbehelfs für den Belehrungstext. */
function rechtsbehelfName(art: RechtsbehelfConfig["art"]): string {
  return art === "einspruch"
    ? "Einspruch"
    : art === "klage"
      ? "Klage"
      : "Widerspruch";
}

/** Verb: „erhoben" (Widerspruch/Klage) bzw. „eingelegt" (Einspruch) — grammatisch korrekt je Regime. */
function rechtsbehelfVerb(art: RechtsbehelfConfig["art"]): string {
  return art === "einspruch" ? "eingelegt" : "erhoben";
}

/** Fristdauer als Text: „einem Monat", „zwei Wochen", „14 Tagen" (Dativ, für „innerhalb …"). */
function fristText(
  wert: number,
  einheit: RechtsbehelfConfig["fristEinheit"],
): string {
  const eins = wert === 1;
  const wortEins: Record<RechtsbehelfConfig["fristEinheit"], string> = {
    monat: "einem Monat",
    woche: "einer Woche",
    tag: "einem Tag",
  };
  const wortPlural: Record<RechtsbehelfConfig["fristEinheit"], string> = {
    monat: "Monaten",
    woche: "Wochen",
    tag: "Tagen",
  };
  return eins ? wortEins[einheit] : `${wert} ${wortPlural[einheit]}`;
}

// ── Anzeige-Helfer (generisch, leistungs-agnostisch) ─────────────────────────────────────────
/** Betrag inkl. Einheit formatieren: Euro-Einheiten als Währung, sonst Zahl + Einheit. */
function formatBetrag(betrag: number, einheit: string): string {
  return formatBetragKit(betrag, einheit);
}

/** Ordinalzahl-Wort für die Bekanntgabefiktion („gilt am {n}. Tag als bekannt gegeben"): 1–7 ausgeschrieben,
 *  sonst „N." als Fallback. Speist sich aus config.zustellung.fiktionTage (Default 4 seit PostModG) — EINE Wahrheit,
 *  statt eine Frist im Prosatext zu backen. */
function ordinalTag(n: number): string {
  const w: Record<number, string> = {
    1: "ersten",
    2: "zweiten",
    3: "dritten",
    4: "vierten",
    5: "fünften",
    6: "sechsten",
    7: "siebten",
  };
  return w[n] ?? `${n}.`;
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
  belehrung,
  pdfDownloadUrl,
}: BescheidViewProps<T>): ReactElement {
  const berechnung: Berechnung | undefined = vorgang.berechnung;
  const datum = useMemo(
    () => formatDatum(vorgang.eingangIso),
    [vorgang.eingangIso],
  );
  // Die Belehrung stammt entweder aus dem EINGEFRORENEN Snapshot (bestandskräftiger Bescheid, regime-
  // neutral) oder — nur als SB-Vorschau — aus der lebenden config.zustellung. Der eingefrorene Pfad
  // gewinnt und liest NIE aus der config.
  const rb = belehrung?.rechtsbehelf ?? config.zustellung?.rechtsbehelf;
  const fiktionTage =
    belehrung?.fiktionTage ?? config.zustellung?.fiktionTage ?? 4;

  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      {/* Aktions-Leiste — NUR am Bildschirm, im Druck ausgeblendet (print:hidden) */}
      <div className="mb-6 flex items-center justify-end gap-2 print:hidden">
        {pdfDownloadUrl ? (
          <>
            {/* Echter, server-generierter Bescheid als Datei-Download (owner-scoped, hash-beweisbar). */}
            <Button asChild>
              <a
                href={pdfDownloadUrl}
                download
                aria-label="Amtlichen Bescheid als PDF herunterladen"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Amtliches PDF herunterladen
              </a>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
            >
              Drucken
            </Button>
          </>
        ) : (
          <Button
            type="button"
            onClick={() => window.print()}
            aria-label="Bescheid als PDF herunterladen"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Als PDF herunterladen
          </Button>
        )}
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

          {berechnung && berechnung.status === "provisional" ? (
            // VORLÄUFIG ⇒ KEIN verbindlicher Tenor: ein Bescheid ist die ENDGÜLTIGE Festsetzung. Solange die Berechnung
            // provisorisch ist (Eingaben stehen aus / Annahme-/Platzhalterwert), darf hier kein festsetzender Betrag
            // erscheinen (tiefer App-Audit: 0 € wurde als definitive Festsetzung gezeigt).
            <div className="mt-3">
              <p className="text-sm leading-relaxed text-foreground print:text-black">
                Noch keine endgültige Festsetzung — die Berechnung ist vorläufig
                (erforderliche Angaben stehen aus). Ein verbindlicher Bescheid
                wird erst nach abgeschlossener Prüfung erteilt.
              </p>
              <p className="mt-2 text-sm text-muted-foreground print:text-black">
                {berechnung.label}:{" "}
                {formatBetrag(berechnung.betrag, berechnung.einheit)}{" "}
                (vorläufig)
              </p>
            </div>
          ) : berechnung ? (
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

              {/* Begründung (Tatbestand → Rechtsfolge). M5 — der Bescheid trägt die RECHTLICHE Fassung
                  (`begruendungRecht`, inkl. §/Norm); fehlt sie, gilt die kanonische `begruendung`. Die
                  bürgernahe Fassung (`begruendungBuerger`) erscheint dagegen in der Antrags-/Bürger-Sicht. */}
              {(berechnung.begruendungRecht ?? berechnung.begruendung) && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black">
                    Begründung
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground print:text-black">
                    {berechnung.begruendungRecht ?? berechnung.begruendung}
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
          {rb ? (
            // REGIME-NEUTRALER, data-driven Text — für ein AO-Verfahren „Einspruch" statt „Widerspruch".
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground print:text-black">
              Gegen diesen Bescheid kann innerhalb von{" "}
              {fristText(rb.fristWert, rb.fristEinheit)} nach Bekanntgabe{" "}
              {rechtsbehelfName(rb.art)} bei {rb.stelle}{" "}
              {rechtsbehelfVerb(rb.art)} werden ({rb.norm}). Die Frist beginnt
              mit dem Tag der Bekanntgabe dieses Bescheides. Erfolgt die
              Bekanntgabe durch die Post im Inland, gilt der Bescheid am{" "}
              {ordinalTag(fiktionTage)} Tag nach Aufgabe zur Post als bekannt
              gegeben. Wird der {rechtsbehelfName(rb.art)} nicht oder nicht
              fristgerecht {rechtsbehelfVerb(rb.art)}, wird der Bescheid
              bestandskräftig.
            </p>
          ) : (
            // Fallback (keine Rechtsbehelf-Config): generische Widerspruchs-Belehrung wie bisher.
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground print:text-black">
              Gegen diesen Bescheid kann innerhalb eines Monats nach Bekanntgabe
              Widerspruch erhoben werden. Der Widerspruch ist schriftlich oder
              zur Niederschrift bei der erlassenden Stelle ({config.kommune})
              einzulegen. Die Frist beginnt mit dem Tag der Bekanntgabe dieses
              Bescheides. Erfolgt die Bekanntgabe durch die Post im Inland, gilt
              der Bescheid am {ordinalTag(fiktionTage)} Tag nach Aufgabe zur
              Post als bekannt gegeben. Wird der Widerspruch nicht oder nicht
              fristgerecht erhoben, wird der Bescheid bestandskräftig.
            </p>
          )}
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
