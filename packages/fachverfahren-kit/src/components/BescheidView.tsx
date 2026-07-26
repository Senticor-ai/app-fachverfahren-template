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
// W1 — DER EINE BELEHRUNGSSATZ-BAUER (SDK): Web UND PDF mounten dasselbe Modul, statt je einen eigenen Satz
// zu bauen. Vorher wichen die beiden Fassungen ab (PDF schrieb `${rb.art}` roh und verdrahtete das Verb hart auf
// „erhoben"), und BEIDE nannten weder Sitz noch Form — jeder Mangel für sich macht die Belehrung unrichtig
// (Frist ein Jahr statt Regelfrist, § 356 Abs. 2 AO / § 58 Abs. 2 VwGO). Reuse = Modul mounten, nicht nachbauen.
import {
  fehlendeBelehrungsSlots,
  formatRechtsbehelfsbelehrung,
} from "@senticor/public-sector-sdk";

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
  /**
   * DIE PFLICHTANGABEN DES VERWALTUNGSAKTS (Phase 5, W5) — dieselben generischen Slots wie im PDF-Renderer.
   *
   * WARUM (adversariales Fachaudit M1-M4): der Web-Bescheid rendert bislang Briefkopf → Tenor → Begründung →
   * Belehrung. Inhaltsadressat, Regelungszeitraum, Leistungsgebot und Unterschrift/Automations-Vermerk waren
   * strukturell nicht vorgesehen. Rechtsfolgen: fehlender Inhaltsadressat und eine nicht erkennbare Behörde ⇒
   * NICHTIGKEIT (§ 125 Abs. 1, Abs. 2 Nr. 1 AO); fehlendes Leistungsgebot ⇒ nicht vollstreckbar (§ 254 Abs. 1 AO);
   * fehlender Zeitraum ⇒ Bestimmtheitsmangel (§ 119 Abs. 1 AO); fehlende Unterschrift ⇒ Formmangel
   * (§ 119 Abs. 3 S. 2 AO).
   *
   * Alle Slots OPTIONAL: fehlt einer, rendert die Fläche ihn nicht (bedingte Pflichten wie das Leistungsgebot
   * gelten ohnehin nur beim Zahlungs-VA). Ob eine Pflicht VERLETZT ist, entscheidet das Gate über die
   * Verfassungs-Liste — nicht dieser Renderer.
   */
  pflichtangaben?: {
    adressat?: { name: string; anschrift?: string; vertreter?: string };
    behoerde?: { name: string; anschrift?: string };
    zeitraum?: string;
    leistungsgebot?: {
      betrag: number;
      waehrung?: string;
      faelligkeiten?: { datum: string; betrag: number }[];
      zahlungsempfaenger?: string;
      iban?: string;
      kassenzeichen?: string;
      verwendungszweck?: string;
    };
    unterschrift?: { name?: string; maschinell: boolean; vermerk?: string };
    /** true ⇒ ENTWURF, nicht erlassen: das Dokument sagt das sichtbar, statt wie ein echter Bescheid auszusehen. */
    entwurf?: boolean;
  };
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
  belehrung,
  pdfDownloadUrl,
  pflichtangaben,
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
  // Die Fiktions-NORM gehört zur EIGENEN Verfahrensschiene (AO: § 122 Abs. 2 AO · VwVfG: § 41 Abs. 2 VwVfG).
  // Sie wird NICHT mehr defaultet: ein AO-Verfahren, dessen Bescheid die VwVfG-Norm nennt, belehrt falsch.
  const fiktionNorm = belehrung?.fiktionNorm ?? config.zustellung?.fiktionNorm;
  // DER EINE SATZ. Fehlt ein Pflicht-Slot (Art/Stelle/Sitz/Frist/Form/Norm) oder die Fiktionsnorm, wird KEIN
  // Text erfunden — die Fläche zeigt einen sichtbaren Fehlzustand. Der frühere hart kodierte Widerspruchs-
  // Fallback erzeugte für ein AO-Verfahren eine juristisch falsche Belehrung (Audit-Befund S1).
  const belehrungsSatz = useMemo(() => {
    if (!rb || !fiktionNorm) return null;
    if (fehlendeBelehrungsSlots(rb).length > 0) return null;
    try {
      return formatRechtsbehelfsbelehrung(rb, { fiktionTage, fiktionNorm });
    } catch {
      return null;
    }
  }, [rb, fiktionTage, fiktionNorm]);
  const belehrungFehlt =
    belehrungsSatz === null
      ? [
          ...fehlendeBelehrungsSlots(rb),
          ...(fiktionNorm ? [] : ["bekanntgabe-fiktionsnorm"]),
        ]
      : [];

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
        {/* ── ENTWURFS-KENNZEICHNUNG: solange nicht erlassen, sagt das Dokument es SICHTBAR ─────────── */}
        {pflichtangaben?.entwurf && (
          <p
            role="status"
            className="mb-6 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-amber-900 print:border-black print:bg-transparent print:text-black"
          >
            Entwurf — nicht erlassen. Dieses Dokument ist kein wirksamer
            Verwaltungsakt.
          </p>
        )}

        {/* ── Briefkopf: absendende Stelle + Leistung ───────────────────────────────── */}
        <header className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-3">
            <Building2
              className="mt-0.5 h-7 w-7 shrink-0 text-primary print:text-black"
              aria-hidden="true"
            />
            <div>
              <p className="text-lg font-semibold leading-tight text-foreground print:text-black">
                {pflichtangaben?.behoerde?.name ?? config.kommune}
              </p>
              {pflichtangaben?.behoerde?.anschrift && (
                <p className="text-xs text-muted-foreground print:text-black">
                  {pflichtangaben.behoerde.anschrift}
                </p>
              )}
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

        {/* ── Inhaltsadressat (§ 119 Abs. 1, § 157 Abs. 1 S. 2 AO) ──────────────────── */}
        {pflichtangaben?.adressat?.name && (
          <section aria-labelledby="bescheid-adressat" className="mt-8">
            <h2
              id="bescheid-adressat"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
            >
              Inhaltsadressat
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground print:text-black">
              {pflichtangaben.adressat.name}
              {pflichtangaben.adressat.vertreter && (
                <>
                  <br />
                  vertreten durch: {pflichtangaben.adressat.vertreter}
                </>
              )}
              {pflichtangaben.adressat.anschrift && (
                <>
                  <br />
                  {pflichtangaben.adressat.anschrift}
                </>
              )}
            </p>
          </section>
        )}

        {/* ── Regelungs-/Erhebungszeitraum (bedingte Pflicht) ────────────────────────── */}
        {pflichtangaben?.zeitraum && (
          <section aria-labelledby="bescheid-zeitraum" className="mt-6">
            <h2
              id="bescheid-zeitraum"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
            >
              Regelungszeitraum
            </h2>
            <p className="mt-2 text-sm text-foreground print:text-black">
              {pflichtangaben.zeitraum}
            </p>
          </section>
        )}

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

        {/* ── Leistungsgebot (§ 254 Abs. 1 AO — ohne es ist der Anspruch nicht vollstreckbar) ─────── */}
        {pflichtangaben?.leistungsgebot && (
          <section aria-labelledby="bescheid-leistungsgebot" className="mt-6">
            <h2
              id="bescheid-leistungsgebot"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
            >
              Leistungsgebot
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground print:text-black">
              Zu zahlen:{" "}
              {formatBetrag(
                pflichtangaben.leistungsgebot.betrag,
                pflichtangaben.leistungsgebot.waehrung ?? "EUR",
              )}
              .
            </p>
            {(pflichtangaben.leistungsgebot.faelligkeiten ?? []).length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground print:text-black">
                {pflichtangaben.leistungsgebot.faelligkeiten!.map((f) => (
                  <li key={`${f.datum}-${f.betrag}`}>
                    fällig am {f.datum}:{" "}
                    {formatBetrag(
                      f.betrag,
                      pflichtangaben.leistungsgebot!.waehrung ?? "EUR",
                    )}
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-2 space-y-1 text-sm text-muted-foreground print:text-black">
              {pflichtangaben.leistungsgebot.zahlungsempfaenger && (
                <div>
                  <dt className="inline">Zahlungsempfänger: </dt>
                  <dd className="inline">
                    {pflichtangaben.leistungsgebot.zahlungsempfaenger}
                  </dd>
                </div>
              )}
              {pflichtangaben.leistungsgebot.iban && (
                <div>
                  <dt className="inline">IBAN: </dt>
                  <dd className="inline font-mono">
                    {pflichtangaben.leistungsgebot.iban}
                  </dd>
                </div>
              )}
              {pflichtangaben.leistungsgebot.kassenzeichen && (
                <div>
                  <dt className="inline">Kassenzeichen: </dt>
                  <dd className="inline font-mono">
                    {pflichtangaben.leistungsgebot.kassenzeichen}
                  </dd>
                </div>
              )}
              {pflichtangaben.leistungsgebot.verwendungszweck && (
                <div>
                  <dt className="inline">Verwendungszweck: </dt>
                  <dd className="inline">
                    {pflichtangaben.leistungsgebot.verwendungszweck}
                  </dd>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* ── Rechtsbehelfsbelehrung (generisch) ────────────────────────────────────── */}
        <section aria-labelledby="bescheid-rechtsbehelf" className="mt-2">
          <h2
            id="bescheid-rechtsbehelf"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground print:text-black"
          >
            Rechtsbehelfsbelehrung
          </h2>
          {belehrungsSatz ? (
            // DER EINE, geteilte Satz — identisch mit dem PDF (SDK-Bauer). Er nennt Art · Stelle · SITZ ·
            // Frist · FORM · Norm und die Bekanntgabe-Fiktion der EIGENEN Schiene.
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground print:text-black">
              {belehrungsSatz}
            </p>
          ) : (
            // KEIN erfundener Ersatztext: fehlt das Regime, ist der Mangel SICHTBAR statt stillschweigend
            // durch eine (für dieses Verfahren womöglich falsche) Standard-Belehrung überdeckt.
            <p
              role="alert"
              className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-destructive print:border-black print:bg-transparent print:text-black"
            >
              Rechtsbehelfsbelehrung nicht verfügbar — das Verfahren hat kein
              vollständiges Rechtsbehelfs-Regime deklariert (fehlend:{" "}
              {belehrungFehlt.join(", ")}). Ohne vollständige Belehrung darf
              dieser Bescheid nicht erlassen werden; eine unvollständige
              Belehrung verlängert die Rechtsbehelfsfrist auf ein Jahr.
            </p>
          )}
        </section>

        {/* ── Unterschrift / Fußzeile ───────────────────────────────────────────────── */}
        <footer className="mt-10 flex items-end justify-between gap-6 text-sm text-muted-foreground print:text-black">
          <p>
            {pflichtangaben?.behoerde?.name ?? config.kommune}
            <br />
            {/* § 119 Abs. 3 S. 2 AO: Namenswiedergabe ODER ausdrücklicher Automations-Vermerk — eines von beidem
                MUSS dastehen. Vorher stand hier nur „Im Auftrag" ohne Namen und ohne Vermerk. */}
            {pflichtangaben?.unterschrift?.name ? (
              <span className="text-foreground print:text-black">
                {pflichtangaben.unterschrift.name}
              </span>
            ) : pflichtangaben?.unterschrift?.maschinell ? (
              <span className="text-muted-foreground print:text-black">
                {pflichtangaben.unterschrift.vermerk ??
                  "Dieser Bescheid wurde maschinell erstellt und ist ohne Unterschrift gültig."}
              </span>
            ) : (
              <span className="text-muted-foreground print:text-black">
                Im Auftrag
              </span>
            )}
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
