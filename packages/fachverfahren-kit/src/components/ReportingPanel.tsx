// components/ReportingPanel — die GENERISCHE Reporting-/Export-Sicht für die Aufsicht (Backend-Surface).
//
// Aggregiert den gesamten Vorgangs-Bestand zu Aufsichts-Kennzahlen — vollständig CONFIG-GETRIEBEN, KEINE
// Domänen-Literale: Status-Achse aus `config.statusMachine.states`, Beträge generisch über `Vorgang.berechnung`,
// die KI-Autonom-Schwelle aus `config.ki.schwelleAutonom`. Liefert KPI-Karten + dep-freie CSS-Balken (kein
// Chart-Lib) und einen rein dep-freien CSV-Export via Blob + Download. Barrierefrei nach BITV 2.0 / WCAG 2.2 AA:
// jeder Balken hat eine Text-Alternative, eine SR-only-Tabelle ist der zugängliche Fallback, der Export-Button ist
// tastatur-bedienbar mit sichtbarem Fokus-Ring; Animationen respektieren prefers-reduced-motion.
import * as React from "react";
import { useMemo, type ReactElement } from "react";
import { BarChart3, Download, FileBarChart, Sparkles } from "lucide-react";

import type { LeistungConfig, StatusDef, Vorgang } from "../types.js";
import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Skeleton, SkeletonCard } from "../ui/skeleton.js";
import { EmptyState } from "./EmptyState.js";
import { useStatusRegion } from "./StatusRegion.js";
import { kiKennzahlen } from "../lib/ki-kennzahlen.js";

export interface ReportingPanelProps<T = Record<string, unknown>> {
  vorgaenge: Vorgang<T>[];
  config: LeistungConfig<T>;
  /**
   * Zeigt layout-treue Lade-Platzhalter statt der Auswertung an (z. B. während der Bestand nachgeladen wird).
   * Default `false` — bestehendes Verhalten bleibt unverändert. Die Lade-ANSAGE läuft über useStatusRegion.
   */
  loading?: boolean | undefined;
}

// ── Aggregat-Helfer (rein, deterministisch — kein Date.now()/Random) ─────────────────────────────

/** Zählt Vorgänge je StatusDef-Schlüssel über den GESAMTEN Bestand (auch leere Status werden mit 0 geführt). */
function zaehleJeStatus<T>(
  vorgaenge: Vorgang<T>[],
  states: StatusDef[],
): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of states) m[s.key] = 0;
  for (const v of vorgaenge) m[v.status] = (m[v.status] ?? 0) + 1;
  return m;
}

/** Summiert alle gesetzten Festsetzungs-Beträge. Einheit aus der ersten vorhandenen Berechnung (generisch). */
function summiereBetraege<T>(vorgaenge: Vorgang<T>[]): {
  summe: number;
  einheit: string;
  anzahl: number;
} {
  let summe = 0;
  let einheit = "";
  let anzahl = 0;
  for (const v of vorgaenge) {
    if (!v.berechnung) continue;
    summe += v.berechnung.betrag;
    anzahl += 1;
    if (!einheit) einheit = v.berechnung.einheit;
  }
  return { summe, einheit, anzahl };
}

// Die KI-Aggregation lebt in lib/ki-kennzahlen (EINE Wahrheit, geteilt mit AufsichtDashboard) — sie
// war hier lokal nachgebaut und teilte durch den Gesamtbestand statt durch die bewerteten Vorgänge.

// ── Format-Helfer ────────────────────────────────────────────────────────────────────────────────

/** Betrag inkl. Einheit formatieren (Euro-Einheiten als Währung, sonst Zahl + Einheit) — leistungs-agnostisch. */
function formatBetrag(betrag: number, einheit: string): string {
  if (einheit && /eur/i.test(einheit)) {
    const wert = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(betrag);
    // Periodizität (z.B. "EUR/Jahr") als Suffix erhalten, ohne sie zu erfinden.
    const suffix = einheit.replace(/^\s*eur\s*\/?\s*/i, "");
    return suffix ? `${wert} / ${suffix}` : wert;
  }
  const zahl = new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 2,
  }).format(betrag);
  return einheit ? `${zahl} ${einheit}` : zahl;
}

/** Prozent-Anteil als ganzzahliger String (0..100), für Quote + Balkenbreite. */
function prozent(anteil: number): number {
  return Math.round(anteil * 100);
}

/** Eingang stabil-absolut (kein Date.now() → keine Hydration-Diskrepanz, ISO-tauglich für CSV). */
function eingangText(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── CSV-Export (dep-frei: RFC-4180-konform via Blob + verstecktem Download-Anker) ───────────────

/** Maskiert einen Zellwert RFC-4180-konform (umschließende Quotes bei Trennzeichen/Quote/Zeilenumbruch). */
function csvZelle(wert: string): string {
  if (/[";\n\r]/.test(wert)) return `"${wert.replace(/"/g, '""')}"`;
  return wert;
}

/** Baut den CSV-Text aus den Vorgängen (Spalten: vorgangsnummer/status/betrag/eingang) — Semikolon-getrennt (DE-Excel). */
function baueCsv<T>(
  vorgaenge: Vorgang<T>[],
  statusLabel: Record<string, string>,
): string {
  const kopf = ["vorgangsnummer", "status", "betrag", "eingang"];
  const zeilen = vorgaenge.map((v) => {
    const betrag = v.berechnung ? String(v.berechnung.betrag) : "";
    return [
      v.vorgangsnummer,
      statusLabel[v.status] ?? v.status,
      betrag,
      v.eingangIso,
    ]
      .map(csvZelle)
      .join(";");
  });
  // Voranstehendes BOM, damit Excel UTF-8 (Umlaute) korrekt erkennt.
  return "﻿" + [kopf.join(";"), ...zeilen].join("\r\n");
}

/** Erzeugt den CSV-Blob und löst den Download aus — vollständig dep-frei, ohne Seiteneffekt im SSR. */
function exportiereCsv<T>(
  vorgaenge: Vorgang<T>[],
  statusLabel: Record<string, string>,
  dateibasis: string,
): void {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof Blob === "undefined"
  )
    return;
  const csv = baueCsv(vorgaenge, statusLabel);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anker = document.createElement("a");
  anker.href = url;
  anker.download = `${dateibasis || "reporting"}-export.csv`;
  document.body.appendChild(anker);
  anker.click();
  document.body.removeChild(anker);
  URL.revokeObjectURL(url);
}

// ── Komponente ─────────────────────────────────────────────────────────────────────────────────

export function ReportingPanel<T = Record<string, unknown>>({
  vorgaenge,
  config,
  loading = false,
}: ReportingPanelProps<T>): ReactElement {
  const states = config.statusMachine.states;
  const gesamt = vorgaenge.length;

  // Dynamische Lade-/Leer-Ansage über die EINE zentrale Live-Region (kein eigenes aria-live im Widget).
  const { announce } = useStatusRegion();
  React.useEffect(() => {
    if (loading) announce("Reporting wird geladen.", "polite");
    else if (gesamt === 0)
      announce("Reporting geladen. Noch keine Vorgänge im Bestand.", "polite");
    else
      announce(
        `Reporting geladen. ${gesamt} ${gesamt === 1 ? "Vorgang" : "Vorgänge"} ausgewertet.`,
        "polite",
      );
  }, [announce, loading, gesamt]);

  const statusLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of states) m[s.key] = s.label;
    return m;
  }, [states]);

  const countByStatus = useMemo(
    () => zaehleJeStatus(vorgaenge, states),
    [vorgaenge, states],
  );
  const maxCount = useMemo(
    () =>
      states.reduce((max, s) => Math.max(max, countByStatus[s.key] ?? 0), 0),
    [states, countByStatus],
  );

  const betraege = useMemo(() => summiereBetraege(vorgaenge), [vorgaenge]);

  const schwelle = config.ki?.schwelleAutonom ?? 1;
  const ki = useMemo(
    () => kiKennzahlen(vorgaenge, schwelle),
    [vorgaenge, schwelle],
  );

  // Ton → Balkenfarbe (rein visuell über die vorhandenen Status-Tokens, kein Fach-Inhalt).
  const toneClass: Record<StatusDef["tone"], string> = {
    neu: "bg-status-neu",
    info: "bg-status-info",
    warn: "bg-status-warn",
    ok: "bg-status-ok",
    block: "bg-status-block",
  };

  // ── Ladezustand: layout-treue Skeletons (kein Layout-Shift), Ansage via StatusRegion ──────────────
  if (loading) {
    return (
      <section
        aria-labelledby="reporting-titel"
        aria-busy="true"
        className="mx-auto w-full max-w-5xl px-6 py-8"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h1
            id="reporting-titel"
            className="text-2xl font-semibold text-foreground"
          >
            Reporting für die Aufsicht
          </h1>
        </div>
        <Skeleton className="mt-2 h-4 w-64" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <SkeletonCard className="mt-6" />
      </section>
    );
  }

  // ── Leerzustand: ein ruhiger EmptyState tritt an die Stelle der gesamten Auswertung ───────────────
  if (gesamt === 0) {
    return (
      <section
        aria-labelledby="reporting-titel"
        className="mx-auto w-full max-w-5xl px-6 py-8"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h1
            id="reporting-titel"
            className="text-2xl font-semibold text-foreground"
          >
            Reporting für die Aufsicht
          </h1>
        </div>
        <EmptyState
          icon={FileBarChart}
          title="Noch keine Auswertung möglich"
          description={`Für ${config.label} (${config.kommune}) sind noch keine Vorgänge im Bestand. Sobald Vorgänge erfasst sind, erscheinen hier Kennzahlen, die Statusverteilung und der CSV-Export.`}
          className="mt-6"
        />
      </section>
    );
  }

  return (
    // Root ist eine `section` (KEIN `main`): die FachverfahrenShell stellt bereits den `main`-Landmark
    // bereit — ein zweites `main` wäre ein verschachtelter Landmark (ungültiges HTML, WCAG 1.3.1/BITV).
    <section
      aria-labelledby="reporting-titel"
      className="mx-auto w-full max-w-5xl px-6 py-8"
    >
      {/* Kopf */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-foreground" aria-hidden="true" />
            <h1
              id="reporting-titel"
              className="text-2xl font-semibold text-foreground"
            >
              Reporting für die Aufsicht
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {gesamt} {gesamt === 1 ? "Vorgang" : "Vorgänge"} · {config.label} ·{" "}
            {config.kommune}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => exportiereCsv(vorgaenge, statusLabel, config.id)}
          disabled={gesamt === 0}
          aria-disabled={gesamt === 0}
          aria-label="Vorgänge als CSV-Datei exportieren"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Als CSV exportieren
        </Button>
      </div>

      {/* KPI-Karten */}
      <section
        aria-label="Kennzahlen"
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <KpiKarte
          titel="Vorgänge gesamt"
          wert={new Intl.NumberFormat("de-DE").format(gesamt)}
          sub="im gesamten Bestand"
        />
        <KpiKarte
          titel="Summe Festsetzungen"
          wert={
            betraege.anzahl > 0
              ? formatBetrag(betraege.summe, betraege.einheit)
              : "—"
          }
          sub={
            betraege.anzahl > 0
              ? `aus ${betraege.anzahl} ${betraege.anzahl === 1 ? "Festsetzung" : "Festsetzungen"}`
              : "keine Festsetzung erfasst"
          }
        />
        <KpiKarte
          titel="KI-autonom-Quote"
          // Bezugsgröße ist `ki.bewertet` (Vorgänge MIT Modell-Bewertung), nicht `gesamt`: ohne
          // gebundenen Adapter ist kein Vorgang bewertet — dann ist die Quote bezugslos und die
          // Kachel sagt das offen, statt „0 %" wie einen Messwert auszuweisen.
          wert={ki.aktiv ? `${prozent(ki.autonomQuote)} %` : "—"}
          sub={
            ki.aktiv
              ? `${ki.autonomFaehig} von ${ki.bewertet} bewertet · Konfidenz ≥ ${prozent(schwelle)} %, ohne Hinweise`
              : gesamt > 0
                ? "kein KI-Modell aktiv"
                : "kein Bestand"
          }
          icon={
            <Sparkles className="h-4 w-4 text-status-info" aria-hidden="true" />
          }
        />
      </section>

      {/* Verteilung je Status — dep-freie CSS-Balken + SR-Tabelle als zugänglicher Fallback */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Vorgänge je Status</CardTitle>
        </CardHeader>
        <CardContent>
          {gesamt === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Vorgänge im Bestand.
            </p>
          ) : (
            <>
              {/* Textalternative zum Diagramm: Hinweis auf den tabellarischen Fallback (WCAG 1.1.1).
                  Sichtbar UND nicht nur über Farbe — assistive Technik erhält dieselben Daten als Tabelle. */}
              <p className="mb-3 text-xs text-muted-foreground">
                Balkendiagramm der Statusverteilung. Eine gleichwertige
                Datentabelle steht für Screenreader zur Verfügung.
              </p>
              {/* Visuelle Balken — pro Balken eine Text-Alternative (aria-hidden auf der Grafik, Text sichtbar). */}
              <ul className="grid gap-3" aria-hidden="true">
                {states.map((s) => {
                  const count = countByStatus[s.key] ?? 0;
                  const breite =
                    maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
                  const anteil = gesamt > 0 ? prozent(count / gesamt) : 0;
                  return (
                    <li
                      key={s.key}
                      className="grid grid-cols-[10rem_1fr_auto] items-center gap-3"
                    >
                      <span
                        className="truncate text-sm text-foreground"
                        title={s.label}
                      >
                        {s.label}
                      </span>
                      <span className="relative block h-2.5 overflow-hidden rounded-full bg-secondary">
                        <span
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-500",
                            toneClass[s.tone] ?? "bg-status-info",
                          )}
                          style={{ width: `${breite}%` }}
                        />
                      </span>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {count} · {anteil} %
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Zugänglicher Fallback: dieselben Daten als echte Tabelle, nur für Screenreader. */}
              <table className="sr-only">
                <caption>
                  Verteilung der {gesamt} Vorgänge je Status, mit absoluter
                  Anzahl und Anteil am Gesamtbestand.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Anzahl</th>
                    <th scope="col">Anteil in Prozent</th>
                  </tr>
                </thead>
                <tbody>
                  {states.map((s) => {
                    const count = countByStatus[s.key] ?? 0;
                    const anteil = gesamt > 0 ? prozent(count / gesamt) : 0;
                    return (
                      <tr key={s.key}>
                        <th scope="row">{s.label}</th>
                        <td>{count}</td>
                        <td>{anteil}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </CardContent>
      </Card>

      {/* Export-Hinweis (Begründung der Spalten — für die Aufsicht nachvollziehbar) */}
      <p className="mt-4 text-xs text-muted-foreground">
        Der CSV-Export enthält je Vorgang die Spalten Vorgangsnummer, Status,
        Betrag und Eingang (Semikolon-getrennt, UTF-8). Stand der Auswertung:{" "}
        {gesamt > 0 ? eingangText(neuesterEingang(vorgaenge)) : "—"}.
      </p>
    </section>
  );
}

/** Liefert den jüngsten Eingang-ISO im Bestand (für den „Stand der Auswertung"-Hinweis) — stabil, ohne Now(). */
function neuesterEingang<T>(vorgaenge: Vorgang<T>[]): string {
  let max = vorgaenge[0]!.eingangIso;
  for (const v of vorgaenge) if (v.eingangIso > max) max = v.eingangIso;
  return max;
}

// ── KPI-Karte ────────────────────────────────────────────────────────────────────────────────────
function KpiKarte({
  titel,
  wert,
  sub,
  icon,
}: {
  titel: string;
  wert: string;
  sub: string;
  icon?: ReactElement | undefined;
}): ReactElement {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {titel}
          </span>
          {icon}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
          {wert}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
