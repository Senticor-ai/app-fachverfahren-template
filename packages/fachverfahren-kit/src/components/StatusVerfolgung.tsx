// fachverfahren-kit/components/StatusVerfolgung — die GENERISCHE Bürger-Status-Verfolgung eines Vorgangs.
//
// Zeigt den Lebensweg eines Vorgangs als vertikalen Fortschritt: die `statusMachine.states` in der vom
// `initial`-Zustand aus über die `transitions` aufgespannten Reihenfolge. Der aktuelle `vorgang.status` ist
// `aria-current`, bereits durchlaufene Stationen sind erledigt (Häkchen), zukünftige blass, terminale als Ende.
// Darunter die `vorgang.history` (Zeitstempel/Aktion) als kompakte, semantische Liste.
//
// VOLLSTÄNDIG CONFIG-GETRIEBEN: kein Domänen-Literal — Stationen/Töne/Labels/Verlauf kommen ausschliesslich aus
// `config` + `vorgang`. Ein zweites Verfahren (Gewerbe/Parkausweis/Bauantrag) läuft ohne jede Änderung.
import { useMemo, type ComponentType, type ReactElement } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Flag,
  Info,
  XCircle,
} from "lucide-react";

import type { LeistungConfig, StatusDef, StatusTone, Vorgang } from "../types.js";
import { cn } from "../lib/utils.js";

// ── Icon je Status-Ton — generisch über JEDES Fachverfahren (kein status-spezifisches Mapping) ──
const TONE_ICON: Record<StatusTone, ComponentType<{ className?: string }>> = {
  neu: Clock,
  info: Info,
  warn: AlertTriangle,
  ok: CheckCircle2,
  block: XCircle,
};

// ── Props ──────────────────────────────────────────────────────────────────────────────────────
export interface StatusVerfolgungProps<T = Record<string, unknown>> {
  vorgang: Vorgang<T>;
  config: LeistungConfig<T>;
}

/**
 * Ordnet die `states` vom `initial`-Zustand aus entlang der `transitions` zu einer linearen Station-Reihe.
 *
 * Breadth-first ab dem Initial-Zustand: jede über eine Transition erreichbare Station wird in
 * Erreichbarkeits-Reihenfolge angehängt (deterministisch, da `transitions` + `states` eine feste Reihenfolge
 * haben). Stationen ohne erreichbaren Pfad (defensive Config) werden in ihrer Config-Reihenfolge ergänzt, damit
 * KEINE Station verloren geht. Rein strukturell — keine fachliche Annahme.
 */
function ordneStationen(states: StatusDef[], initial: string, transitions: { from: string; to: string }[]): StatusDef[] {
  const byKey = new Map<string, StatusDef>();
  for (const s of states) byKey.set(s.key, s);

  // Adjazenz in Config-Reihenfolge der Transitions (stabil + deterministisch).
  const nachfolger = new Map<string, string[]>();
  for (const t of transitions) {
    const liste = nachfolger.get(t.from) ?? [];
    if (!liste.includes(t.to)) liste.push(t.to);
    nachfolger.set(t.from, liste);
  }

  const reihenfolge: StatusDef[] = [];
  const gesehen = new Set<string>();
  const queue: string[] = [];

  const startKey = byKey.has(initial) ? initial : states[0]?.key;
  if (startKey) queue.push(startKey);

  while (queue.length > 0) {
    const key = queue.shift()!;
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    const def = byKey.get(key);
    if (def) reihenfolge.push(def);
    for (const next of nachfolger.get(key) ?? []) {
      if (!gesehen.has(next)) queue.push(next);
    }
  }

  // Nicht erreichbare Stationen (defensive Config) in Config-Reihenfolge anhängen — nichts verlieren.
  for (const s of states) {
    if (!gesehen.has(s.key)) {
      gesehen.add(s.key);
      reihenfolge.push(s);
    }
  }

  return reihenfolge;
}

/** Zeitstempel stabil-absolut rendern (kein Date.now() → keine Hydration-Diskrepanz). */
function zeitText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

/** Aktions-Schlüssel ("nachweis_fehlt") → lesbares Label — rein typografisch, ohne Fach-Annahme. */
function aktionLabel(aktion: string): string {
  const text = aktion.replace(/[_-]+/g, " ").trim();
  if (text.length === 0) return aktion;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Rahmen-Tönung je Status-Ton (token-getrieben, identisch zu den Bestands-Komponenten).
const TONE_RING: Record<StatusTone, string> = {
  neu: "border-border bg-secondary text-foreground",
  info: "border-status-info/40 bg-status-info-soft text-status-info",
  warn: "border-status-warn/40 bg-status-warn-soft text-status-warn",
  ok: "border-status-ok/40 bg-status-ok-soft text-status-ok",
  block: "border-status-block/40 bg-status-block-soft text-status-block",
};

/**
 * Bürger-Status-Verfolgung — vertikaler Fortschritt der Stationen + kompakter Verlauf.
 *
 * Stationen: erledigt (vor dem aktuellen Status) → Häkchen; aktuell → `aria-current="step"` + Ton-Icon;
 * zukünftig → blass; terminal → als Ende gekennzeichnet. Der Verlauf (`history`) steht darunter, neuester zuerst.
 */
export function StatusVerfolgung<T = Record<string, unknown>>({
  vorgang,
  config,
}: StatusVerfolgungProps<T>): ReactElement {
  const { initial, states, transitions } = config.statusMachine;

  const stationen = useMemo(
    () => ordneStationen(states, initial, transitions),
    [states, initial, transitions],
  );

  // Index des aktuellen Status in der geordneten Reihe (−1, falls unbekannt → alles gilt als zukünftig).
  const aktuellerIndex = useMemo(
    () => stationen.findIndex((s) => s.key === vorgang.status),
    [stationen, vorgang.status],
  );

  const aktuelleDef = aktuellerIndex >= 0 ? stationen[aktuellerIndex] : undefined;

  // Verlauf neuester-zuerst, ohne das Original zu mutieren.
  const verlauf = useMemo(() => [...vorgang.history].reverse(), [vorgang.history]);

  return (
    <section
      className="mx-auto w-full max-w-2xl px-6 py-8"
      aria-labelledby="statusverfolgung-titel"
    >
      {/* Kopf */}
      <header className="border-b border-border pb-5">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {config.label} · {config.kommune}
        </div>
        <h1 id="statusverfolgung-titel" className="mt-1 text-2xl font-semibold text-foreground">
          Status Ihres Vorgangs
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          Vorgangsnummer {vorgang.vorgangsnummer}
        </p>
        {aktuelleDef && (
          <p
            className="mt-3 text-sm text-foreground"
            role="status"
            aria-live="polite"
          >
            Aktueller Stand:{" "}
            <span className="font-semibold">{aktuelleDef.label}</span>
            {aktuelleDef.terminal && (
              <span className="text-muted-foreground"> (abgeschlossen)</span>
            )}
          </p>
        )}
      </header>

      {/* Vertikaler Fortschritt der Stationen */}
      <ol className="relative mt-6 space-y-0" aria-label="Bearbeitungsschritte Ihres Vorgangs">
        {stationen.map((s, i) => {
          const istAktuell = i === aktuellerIndex;
          // Vor dem aktuellen Status (oder, falls Status unbekannt, keine Station) = erledigt.
          const istErledigt = aktuellerIndex >= 0 && i < aktuellerIndex;
          const istZukuenftig = aktuellerIndex < 0 || i > aktuellerIndex;
          const istLetzte = i === stationen.length - 1;
          const Icon = TONE_ICON[s.tone];

          return (
            <li
              key={s.key}
              aria-current={istAktuell ? "step" : undefined}
              className="relative flex gap-4 pb-6 last:pb-0"
            >
              {/* Verbindungslinie zur nächsten Station */}
              {!istLetzte && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px",
                    istErledigt ? "bg-status-ok/50" : "bg-border",
                  )}
                />
              )}

              {/* Marker */}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors motion-reduce:transition-none",
                  istErledigt && "border-status-ok/50 bg-status-ok-soft text-status-ok",
                  istAktuell && TONE_RING[s.tone],
                  istAktuell && "ring-2 ring-offset-2 ring-offset-background ring-current",
                  istZukuenftig && "border-border bg-background text-muted-foreground",
                )}
              >
                {istErledigt ? (
                  <Check className="h-4 w-4" />
                ) : istAktuell ? (
                  <Icon className="h-4 w-4" />
                ) : istLetzte && s.terminal ? (
                  <Flag className="h-3.5 w-3.5" />
                ) : (
                  <Circle className="h-2.5 w-2.5 fill-current" />
                )}
              </span>

              {/* Beschriftung — zukünftige Stationen werden über Marker/Icon + den Text „Ausstehend" gekennzeichnet,
                  NICHT über reduzierte Deckkraft (sonst unterschreitet der Text die WCAG-2.2-AA-Kontrastschwelle 4.5:1). */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm",
                      istAktuell ? "font-semibold text-foreground" : "font-medium text-foreground",
                    )}
                  >
                    {s.label}
                  </span>
                  {istAktuell && (
                    <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-foreground">
                      Aktuell
                    </span>
                  )}
                  {s.terminal && (
                    <span className="rounded-sm border border-border bg-secondary px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                      Abschluss
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">
                  {istErledigt ? "Erledigt" : istAktuell ? "In Bearbeitung" : "Ausstehend"}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Verlauf (history) */}
      <div className="mt-8 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground">Verlauf</h2>
        {verlauf.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            Noch keine Aktivitäten erfasst.
          </p>
        ) : (
          <ul className="mt-3 space-y-3" aria-label="Verlaufseinträge zu Ihrem Vorgang, neuester zuerst">
            {verlauf.map((h, i) => (
              <li key={`${h.ts}-${i}`} className="flex gap-3 text-[13px]">
                <span
                  aria-hidden="true"
                  className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-foreground">{aktionLabel(h.aktion)}</span>
                    <time
                      dateTime={h.ts}
                      className="shrink-0 font-mono text-[11px] text-muted-foreground"
                    >
                      {zeitText(h.ts)}
                    </time>
                  </div>
                  {h.detail && (
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{h.detail}</p>
                  )}
                  {h.rolle && (
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground/80">
                      {h.rolle}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
