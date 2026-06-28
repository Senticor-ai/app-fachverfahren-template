// fachverfahren-kit/components/AufsichtDashboard — die GENERISCHE Aufsichts-/Kennzahlen-Sicht.
//
// Operative Messschicht für JEDES kommunale Fachverfahren: aggregiert NUR den `VorgangPort` + die `LeistungConfig`
// (Status-Mix aus statusMachine.states, Summe vorgeschlagener Beträge aus Berechnung, KI-/Autonomie-Quote aus der
// ki.schwelleAutonom, pseudonymisierter Audit-Trail aus history). Kein Domänen-Literal — ein zweites Verfahren
// (Gewerbe/Parkausweis/Bauantrag) läuft ohne Baustein-Änderung.
//
// UX 1:1 aus lovable audit.tsx (KPI-Kacheln · Status-Balken · Summen-Kachel · Audit-Trail) im Reporting-Rahmen
// aus sift Reporting.tsx (Header + Card-Sektionen). Status-Farben ausschließlich über die Tokens (status-*).
import * as React from "react";
import { BarChart3, Database, History, Inbox } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card.js";
import { Badge } from "../ui/badge.js";
import { SkeletonCard, SkeletonTable } from "../ui/skeleton.js";
import { EmptyState } from "./EmptyState.js";
import { useStatusRegion } from "./StatusRegion.js";
import type {
  LeistungConfig,
  StatusDef,
  StatusTone,
  Vorgang,
  VorgangHistorie,
  VorgangPort,
} from "../types.js";

/** Aufsichts-Sicht — rein generisch über Config + Port; keine personenbezogenen Klartext-Daten. */
export interface AufsichtDashboardProps<T = Record<string, unknown>> {
  config: LeistungConfig<T>;
  port: VorgangPort<T>;
  /**
   * Lädt der Vorgangsbestand noch? Dann werden layout-treue Skeletons statt der Aggregate gezeigt
   * (kein Layout-Shift). Default `false` — bestehendes Verhalten bleibt unverändert.
   */
  loading?: boolean | undefined;
}

// ── Tone → Tailwind-Tokens (Füllung/Rahmen/Text) ────────────────────────────
// Mappt die 5 StatusTone-Werte auf die status-*-Tokens; `neu` hat kein eigenes Token → neutral (muted).
const TONE_FILL: Record<StatusTone, string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  info: "bg-status-info",
  block: "bg-status-block",
  neu: "bg-muted-foreground/40",
};
const TONE_BORDER: Record<StatusTone, string> = {
  ok: "border-status-ok/30",
  warn: "border-status-warn/30",
  info: "border-status-info/30",
  block: "border-status-block/30",
  neu: "border-border",
};
const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-status-ok",
  warn: "text-status-warn",
  info: "text-status-info",
  block: "text-status-block",
  neu: "text-muted-foreground",
};

/** Lokale, deterministische Währungsformatierung aus der Berechnung (Betrag + Einheit) — kein hartes „EUR". */
function formatBetrag(betrag: number, einheit: string): string {
  const waehrung = /eur|€/i.test(einheit) ? "EUR" : undefined;
  const zahl = waehrung
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(betrag)
    : new Intl.NumberFormat("de-DE").format(betrag);
  // Einheit-Suffix (z.B. „/Jahr") anhängen, falls die Berechnung es vorgibt und es nicht schon Teil der Währung ist.
  const suffix = einheit.replace(/^\s*eur\s*/i, "").replace(/^€/, "").trim();
  return suffix && suffix !== einheit.trim() ? `${zahl} ${suffix}` : zahl;
}

/** Pseudonymisiert eine Vorgangsnummer für den Audit-Trail (zeigt Präfix + verkürzten Hash, nie PII/Klartext). */
function pseudonym(vorgangsnummer: string): string {
  const teile = vorgangsnummer.split("-");
  const kopf = teile.slice(0, Math.max(1, teile.length - 1)).join("-");
  const tail = teile[teile.length - 1] ?? vorgangsnummer;
  // letzten Block maskieren — die laufende Nummer könnte zusammen mit Zeitstempel re-identifizieren.
  const masked = tail.length > 2 ? `${tail.slice(0, 1)}${"•".repeat(tail.length - 1)}` : "••";
  return teile.length > 1 ? `${kopf}-${masked}` : masked;
}

export function AufsichtDashboard<T = Record<string, unknown>>({
  config,
  port,
  loading = false,
}: AufsichtDashboardProps<T>): React.ReactElement {
  const { announce } = useStatusRegion();
  // Lade-/Fertig-Ansage zentral über die EINE Live-Region (BITV: Zustand nicht nur visuell).
  React.useEffect(() => {
    announce(loading ? "Kennzahlen werden geladen." : "Kennzahlen aktualisiert.", "polite");
  }, [loading, announce]);

  const vorgaenge: Vorgang<T>[] = port.list();
  const states: StatusDef[] = config.statusMachine.states;
  const total = vorgaenge.length;
  const schwelle = config.ki?.schwelleAutonom ?? 1;

  // ── Status-Mix: Count je StatusDef (data-driven über die States der Maschine) ──
  const counts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const v of vorgaenge) map.set(v.status, (map.get(v.status) ?? 0) + 1);
    return map;
  }, [vorgaenge]);

  // ── Summe vorgeschlagener Beträge (nur Vorschläge aus der Subsumtion, je Einheit getrennt) ──
  const summen = React.useMemo(() => {
    const byEinheit = new Map<string, number>();
    for (const v of vorgaenge) {
      if (!v.berechnung) continue;
      const e = v.berechnung.einheit;
      byEinheit.set(e, (byEinheit.get(e) ?? 0) + v.berechnung.betrag);
    }
    return [...byEinheit.entries()].map(([einheit, betrag]) => ({ einheit, betrag }));
  }, [vorgaenge]);

  // ── KI-/Autonomie-Quote: Anteil „autonom-fähig" = confidence ≥ Schwelle UND 0 Flags ──
  const autonomFaehig = React.useMemo(
    () => vorgaenge.filter((v) => v.ki.confidence >= schwelle && v.ki.flags.length === 0).length,
    [vorgaenge, schwelle],
  );
  const autonomQuote = total ? Math.round((autonomFaehig / total) * 100) : 0;
  const avgConfidence = total
    ? Math.round((vorgaenge.reduce((s, v) => s + v.ki.confidence, 0) / total) * 100)
    : 0;
  // Anteil Vorgänge mit mindestens einem KI-Flag (= Review-Indikator).
  const mitFlags = vorgaenge.filter((v) => v.ki.flags.length > 0).length;
  const flagQuote = total ? Math.round((mitFlags / total) * 100) : 0;

  // ── Audit-Trail: letzte History-Einträge über ALLE Vorgänge, pseudonymisiert, ohne PII ──
  const auditTrail = React.useMemo(() => {
    return vorgaenge
      .flatMap((v) =>
        v.history.map((h: VorgangHistorie) => ({ ...h, ref: pseudonym(v.vorgangsnummer) })),
      )
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, 12);
  }, [vorgaenge]);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header im Reporting-Stil (sift): Titel + Hinweis auf die Messschicht. */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 px-6 py-5 backdrop-blur">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-foreground" aria-hidden />
          <h1 className="text-2xl font-semibold text-foreground">Kennzahlen / Aufsicht</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {config.label} · {config.kommune} — operative Messschicht. Zahlen aus dem aktuellen
          Vorgangsbestand, pseudonymisiert. Keine personenbezogenen Klartext-Daten.
        </p>
      </div>

      {loading ? (
        /* Ladezustand — layout-treue Skeletons (KPI-Kacheln · Status-Mix · Summe · Audit-Trail).
           Die Lade-ANSAGE übernimmt StatusRegion (oben), die Skeletons sind rein dekorativ (aria-hidden). */
        <div className="px-6 py-6" aria-busy="true">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
            <SkeletonCard />
          </div>
          <div className="mt-8">
            <SkeletonTable rows={6} cols={3} />
          </div>
        </div>
      ) : (
      <div className="px-6 py-6">
        {/* KPI-Kacheln (lovable audit) — data-driven aus den Aggregaten. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Vorgänge gesamt" value={String(total)} />
          <Kpi label="Autonom-fähig-Quote" value={`${autonomQuote}%`} tone="ok" />
          <Kpi label="Review-Indikator (Flags)" value={`${flagQuote}%`} tone="warn" />
          <Kpi label="Ø KI-Konfidenz" value={`${avgConfidence}%`} tone="info" />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Status-Mix als Balken (lovable audit) — eine Zeile je StatusDef der Maschine. */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm">Vorgangs-Mix nach Status</CardTitle>
            </CardHeader>
            <CardContent>
              {total === 0 ? (
                <EmptyState
                  icon={Inbox}
                  as="h3"
                  title="0 Vorgänge im Bestand"
                  description="Sobald Vorgänge angelegt sind, erscheint hier der Status-Mix nach Status."
                />
              ) : (
                <ul className="space-y-3">
                  {states.map((s) => (
                    <Bar
                      key={s.key}
                      label={s.label}
                      value={counts.get(s.key) ?? 0}
                      total={total}
                      tone={s.tone}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Summe vorgeschlagener Beträge — je Berechnungs-Einheit getrennt (generisch). */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Summe vorgeschlagener Beträge</CardTitle>
            </CardHeader>
            <CardContent>
              {summen.length === 0 ? (
                <EmptyState
                  icon={Database}
                  as="h3"
                  title="0 Berechnungen vorhanden"
                  description="Aus der Subsumtion vorgeschlagene Beträge werden hier je Einheit summiert."
                />
              ) : (
                <ul className="space-y-3">
                  {summen.map((s) => (
                    <li key={s.einheit}>
                      <div className="text-3xl font-semibold tabular-nums text-foreground">
                        {formatBetrag(s.betrag, s.einheit)}
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{s.einheit}</div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[12px] text-muted-foreground">
                Hinweis: nur Vorschläge aus der Subsumtion — keine rechtskräftigen Festsetzungen.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Audit-Trail (lovable audit) — pseudonymisierte Referenz + Aktion + Rolle + Zeit, keine Antragsdaten. */}
        <Card className="mt-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Audit-Trail (letzte Einträge)</CardTitle>
            <Badge tone="neu" className="text-[11px] font-normal text-muted-foreground">
              pseudonymisiert · ohne PII
            </Badge>
          </CardHeader>
          <CardContent>
            {auditTrail.length === 0 ? (
              <EmptyState
                icon={History}
                as="h3"
                title="0 Audit-Einträge"
                description="Jede Aktion an einem Vorgang erscheint hier pseudonymisiert — ohne PII."
              />
            ) : (
              <ol className="space-y-3">
                {auditTrail.map((h, i) => (
                  <li
                    key={`${h.ref}-${h.ts}-${i}`}
                    className="flex items-baseline justify-between gap-4 border-b border-border pb-2 text-[12px] last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="font-mono tabular-nums text-foreground">{h.ref}</span>{" "}
                      <span className="text-muted-foreground">— {h.aktion}</span>
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground">
                      {new Date(h.ts).toLocaleString("de-DE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}{" "}
                      · {h.rolle}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      )}
    </div>
  );
}

// ── KPI-Kachel (aus lovable audit, data-driven über tone) ───────────────────
interface KpiProps {
  label: string;
  value: string;
  tone?: StatusTone;
}
function Kpi({ label, value, tone }: KpiProps): React.ReactElement {
  return (
    <Card className={tone ? TONE_BORDER[tone] : "border-border"}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

// ── Status-Balken (aus lovable audit) — Füllung über das Tone-Token ─────────
interface BarProps {
  label: string;
  value: number;
  total: number;
  tone: StatusTone;
}
function Bar({ label, value, total, tone }: BarProps): React.ReactElement {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className={`font-medium ${TONE_TEXT[tone]}`}>{label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {value} · {pct}%
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${TONE_FILL[tone]}`} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}
