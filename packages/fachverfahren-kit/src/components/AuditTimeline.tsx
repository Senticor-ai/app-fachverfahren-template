// fachverfahren-kit/components/AuditTimeline — die GENERISCHE, revisionssichere Audit-Timeline der Vorgangs-Historie.
//
// Surface: Backend/interne Sicht (Sachbearbeitung & Aufsicht). Zeigt die `VorgangHistorie[]` als vertikale, streng
// append-only Timeline: je Eintrag der Zeitstempel (formatiert, semantisches <time>-Element), die Aktion, die Rolle
// (als Ton-getriebenes Badge) und das optionale Detail. Der Append-only-Charakter ist VISUELL verankert — es gibt
// bewusst KEINE Lösch-/Edit-Affordanz, dazu ein durchgehender Zeitstrahl, der die Unveränderlichkeit unterstreicht.
//
// Vollständig CONFIG-/DATEN-getrieben: KEINE Domänen-Literale. Aktion, Rolle und Detail kommen ausschließlich aus den
// übergebenen Historien-Einträgen. Optionaler Rollenfilter wird aus den real vorkommenden Rollen abgeleitet.
//
// Barrierefrei (BITV 2.0 / WCAG 2.2 AA): semantische <ol>/<li>-Liste mit <time>-Element, Filter als zugängliche
// Radiogroup (Tastatur + sichtbarer Fokus-Ring + ausreichende Zielgröße), Live-Region meldet die Filterwirkung,
// `prefers-reduced-motion` wird respektiert (keine erzwungenen Bewegungen/Transitions auf der Timeline).
import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { History, Lock, ShieldCheck, User } from "lucide-react";

import type { StatusTone, VorgangHistorie } from "../types.js";
import { cn } from "../lib/utils.js";
import { Badge } from "../ui/badge.js";

export interface AuditTimelineProps {
  /** Die revisionssichere, append-only Historie des Vorgangs (chronologisch ältester→neuester wird hier erzwungen). */
  history: VorgangHistorie[];
  /** Optionaler Initial-Filter auf eine Rolle. Ist die Rolle nicht vorhanden, wird "alle" gezeigt. */
  rollenfilter?: string;
}

/** Sentinel für „kein Rollenfilter" (alle Rollen sichtbar). */
const ALLE = "__alle__";

/** Zeitstempel stabil-absolut formatieren (kein Date.now() → keine Hydration-Diskrepanz). Ungültige Werte bleiben roh. */
function tsText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Maschinenlesbarer Wert für das <time dateTime>-Attribut — ISO, falls parsebar, sonst der Rohwert. */
function tsMachine(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString();
}

/** Rolle → Badge-Ton. Rein VISUELLE Heuristik (Aufsicht/Leitung hervorgehoben), kein Domänen-Inhalt; Default neutral. */
function rolleTon(rolle: string): StatusTone {
  if (/aufsicht|revision|pruef|prüf/i.test(rolle)) return "warn";
  if (/leit|amt|behörde|behoerde|system/i.test(rolle)) return "info";
  if (/sachbearbeit|bearbeit/i.test(rolle)) return "ok";
  return "neu";
}

/** Rolle → Icon für das Badge (generisch, nur typografische Tönung). */
function RolleIcon({ rolle }: { rolle: string }): ReactElement {
  if (/aufsicht|revision|pruef|prüf/i.test(rolle)) {
    return <ShieldCheck className="h-3 w-3" aria-hidden="true" />;
  }
  return <User className="h-3 w-3" aria-hidden="true" />;
}

export function AuditTimeline({
  history,
  rollenfilter,
}: AuditTimelineProps): ReactElement {
  const labelId = useId();
  const liveId = useId();

  // Distinkte Rollen in stabiler Erst-Vorkommens-Reihenfolge (für die Filter-Chips) — datengetrieben.
  const rollen = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const h of history) {
      if (!seen.has(h.rolle)) {
        seen.add(h.rolle);
        out.push(h.rolle);
      }
    }
    return out;
  }, [history]);

  // Initial-Filter: nur übernehmen, wenn die Rolle real existiert; sonst „alle".
  const [filter, setFilter] = useState<string>(() =>
    rollenfilter && rollen.includes(rollenfilter) ? rollenfilter : ALLE,
  );

  // Chronologisch sortieren (append-only ⇒ aufsteigend nach Zeit; stabile Reihenfolge bei gleichen/ungültigen ts).
  const chronologisch = useMemo(() => {
    return history
      .map((eintrag, i) => ({ eintrag, i }))
      .sort((a, b) => {
        const ta = new Date(a.eintrag.ts).getTime();
        const tb = new Date(b.eintrag.ts).getTime();
        const va = Number.isNaN(ta) ? a.i : ta;
        const vb = Number.isNaN(tb) ? b.i : tb;
        if (va !== vb) return va - vb;
        return a.i - b.i;
      })
      .map((x) => x.eintrag);
  }, [history]);

  const sichtbar = useMemo(
    () =>
      filter === ALLE
        ? chronologisch
        : chronologisch.filter((h) => h.rolle === filter),
    [chronologisch, filter],
  );

  const zeigeFilter = rollen.length > 1;
  const filterText =
    filter === ALLE
      ? `${sichtbar.length} von ${chronologisch.length} Einträgen, alle Rollen`
      : `${sichtbar.length} von ${chronologisch.length} Einträgen, Rolle ${filter}`;

  // Vollständige Optionsliste der Radiogroup (ALLE + reale Rollen) — Basis für roving-tabindex + Pfeil-Navigation.
  const optionen = useMemo(() => [ALLE, ...rollen], [rollen]);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // ARIA-Radiogroup-Tastaturmodell: Pfeile/Home/End bewegen Fokus UND Auswahl, ein einziger Tab-Stopp (roving tabindex).
  const onGroupKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const aktiv = Math.max(0, optionen.indexOf(filter));
      let next: number;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          next = (aktiv + 1) % optionen.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          next = (aktiv - 1 + optionen.length) % optionen.length;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = optionen.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      setFilter(optionen[next]);
      chipRefs.current[next]?.focus();
    },
    [optionen, filter],
  );

  return (
    <section aria-labelledby={labelId} className="flex w-full flex-col">
      {/* Kopf — Titel + Append-only-Hinweis (visuell verankerte Revisionssicherheit) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-foreground" aria-hidden="true" />
          <h2 id={labelId} className="text-lg font-semibold text-foreground">
            Vorgangs-Historie
          </h2>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
          title="Diese Historie ist revisionssicher und kann nicht verändert oder gelöscht werden."
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          Revisionssicher · nur Anhängen
        </span>
      </div>

      {/* Optionaler Rollenfilter — zugängliche Radiogroup (Tastatur + Fokus-Ring + Zielgröße >=24px) */}
      {zeigeFilter && (
        <div
          role="radiogroup"
          aria-label="Nach Rolle filtern"
          className="mt-4 flex flex-wrap items-center gap-2"
          onKeyDown={onGroupKey}
        >
          <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
            Rolle:
          </span>
          {optionen.map((opt, idx) => (
            <FilterChip
              key={opt}
              ref={(el) => {
                chipRefs.current[idx] = el;
              }}
              label={opt === ALLE ? "Alle" : opt}
              count={
                opt === ALLE
                  ? chronologisch.length
                  : chronologisch.filter((h) => h.rolle === opt).length
              }
              active={filter === opt}
              onSelect={() => setFilter(opt)}
            />
          ))}
        </div>
      )}

      {/* Live-Region: meldet die Filterwirkung für Screenreader */}
      <p id={liveId} aria-live="polite" className="sr-only">
        {filterText}
      </p>

      {/* Vertikale Timeline — semantische geordnete Liste, durchgehender Zeitstrahl, KEINE Edit/Lösch-Affordanz */}
      {sichtbar.length === 0 ? (
        <p className="mt-6 rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Keine Historien-Einträge
          {filter !== ALLE ? ` für die Rolle "${filter}"` : ""}.
        </p>
      ) : (
        <ol className="relative mt-6 ms-2 border-s border-border ps-6">
          {sichtbar.map((eintrag, i) => (
            <li
              key={`${eintrag.ts}-${eintrag.aktion}-${i}`}
              className="relative pb-6 last:pb-0"
            >
              {/* Knoten am Zeitstrahl */}
              <span
                aria-hidden="true"
                className="absolute -start-[1.6875rem] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary"
              />
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <time
                    dateTime={tsMachine(eintrag.ts)}
                    className="font-mono text-sm tabular-nums text-muted-foreground"
                  >
                    {tsText(eintrag.ts)}
                  </time>
                  <Badge tone={rolleTon(eintrag.rolle)}>
                    <RolleIcon rolle={eintrag.rolle} />
                    {eintrag.rolle}
                  </Badge>
                  {/* Vier-Augen-Nachweis: der HANDELNDE (pseudonymes Kürzel) zusätzlich zur Rolle — nur wenn geführt. */}
                  {eintrag.akteur && (
                    <span
                      className="font-mono text-xs text-muted-foreground"
                      title="Handelnde Person (pseudonyme Kennung) — Grundlage des Vier-Augen-Nachweises"
                    >
                      {eintrag.akteur}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-foreground">
                  {eintrag.aktion}
                </p>
                {eintrag.detail && (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {eintrag.detail}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ── Filter-Chip (Radio-Semantik, a11y: aria-checked + roving tabindex + Pfeil-Nav + Fokus-Ring + Zielgröße) ──
const FilterChip = forwardRef<
  HTMLButtonElement,
  {
    label: string;
    count: number;
    active: boolean;
    onSelect: () => void;
  }
>(function FilterChip({ label, count, active, onSelect }, ref): ReactElement {
  return (
    <button
      ref={ref}
      type="button"
      role="radio"
      aria-checked={active}
      // Roving tabindex: nur das gewählte Radio ist im Tab-Stopp, Pfeile bewegen innerhalb der Gruppe.
      tabIndex={active ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "inline-flex min-h-[24px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none",
        active
          ? "border-accent bg-accent/15 text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="rounded-full bg-secondary px-1.5 py-px text-xs tabular-nums text-foreground">
        {count}
      </span>
    </button>
  );
});
