// components/Arbeitsvorrat — der GENERISCHE Eingangskorb/Arbeitsvorrat der internen Sicht (Sachbearbeitung).
//
// UX aus etablierten Public-Sector-UX-Mustern abgeleitet (Inbox: Schnellfilter-Chips mit Counts, sortierbare
// sticky-Table, Klick/Enter öffnet den Vorgang, KI-Flag-Indikatoren, StatusPill) — aber data-driven über die
// `LeistungConfig` statt fest verdrahtet. Tabellen-Container als maskierter Card-Rahmen (innen-scrollender Body,
// sticky Header). KEIN domänen-Literal: Spalten/Status/Flags/Felder kommen ausschliesslich aus props.
import * as React from "react";
import { useMemo, useState, type ReactElement } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Clock,
  Inbox as InboxIcon,
  Sparkles,
} from "lucide-react";
import type {
  Berechnung,
  LeistungConfig,
  Vorgang,
  VorgangPort,
} from "../types.js";
import { cn } from "../lib/cn.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.js";
import { SkeletonTable } from "../ui/skeleton.js";
import { EmptyState } from "./EmptyState.js";
import { StatusPill } from "./StatusPill.js";
import { useStatusRegion } from "./StatusRegion.js";

export interface ArbeitsvorratProps<T = Record<string, unknown>> {
  config: LeistungConfig<T>;
  port: VorgangPort<T>;
  /** Wird beim Aktivieren einer Zeile (Klick/Enter/Space) mit der Vorgang-Id gerufen. */
  onOpen: (id: string) => void;
  /**
   * Lädt der Bestand gerade? Zeigt additiv einen layout-treuen Tabellen-Platzhalter (SkeletonTable)
   * und sagt den Ladezustand zentral an. Default false (bestehendes Verhalten unverändert).
   */
  loading?: boolean | undefined;
  /**
   * Optionale Aktualisieren-Aktion. Wird — falls gesetzt — im Leerzustand „0 offene Vorgänge"
   * als Recovery-Affordance angeboten. Ohne diese Prop bleibt der Leerzustand rein informativ.
   */
  onReload?: (() => void) | undefined;
}

// ── Sort-State (inlined, generisch — keine externe Util-Abhängigkeit) ────────
type SortDir = "asc" | "desc" | null;
type ColKey =
  | "vorgang"
  | "eingang"
  | "berechnung"
  | "status"
  | `feld:${string}`;

/** Liefert einen verschachtelten Wert (Pfad wie "person.nachname") aus den Antragsdaten als String. */
function readPfad(antragsdaten: unknown, pfad: string): string {
  let cur: unknown = antragsdaten;
  for (const teil of pfad.split(".")) {
    if (
      cur &&
      typeof cur === "object" &&
      teil in (cur as Record<string, unknown>)
    ) {
      cur = (cur as Record<string, unknown>)[teil];
    } else {
      return "";
    }
  }
  if (cur === null || cur === undefined) return "";
  return String(cur);
}

/** Eingang stabil-absolut rendern (kein Date.now() → keine Hydration-Diskrepanz). */
function eingangText(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Betrag generisch über die Berechnung formatieren (Einheit aus der Berechnung) — leistungs-agnostisch. */
function berechnungText(
  berechnung: Berechnung | undefined,
): { betrag: string; sub: string } | null {
  if (!berechnung) return null;
  const betrag = new Intl.NumberFormat("de-DE", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(berechnung.betrag);
  return { betrag: `${betrag} ${berechnung.einheit}`, sub: berechnung.label };
}

export function Arbeitsvorrat<T = Record<string, unknown>>({
  config,
  port,
  onOpen,
  loading = false,
  onReload,
}: ArbeitsvorratProps<T>): ReactElement {
  const { announce } = useStatusRegion();
  const alle = port.list();
  const states = config.statusMachine.states;

  // Roving-Tabindex für die Tabellen-Navigation: nur die aktive Zeile ist im Tab-Fokus,
  // Pfeiltasten/Home/End wandern durch die Liste (WAI-ARIA Grid-Muster).
  const rowRefs = React.useRef<Array<HTMLTableRowElement | null>>([]);
  const [activeRow, setActiveRow] = React.useState(0);

  // Schlüssel-Antragsfelder: 1–2 Felder aus der ersten Detail-Sektion (generisch, ohne Domänen-Literal).
  const schluesselFelder = useMemo(
    () => (config.detailSektionen[0]?.felder ?? []).slice(0, 2),
    [config.detailSektionen],
  );

  // Aktive Status-Filter — default: alle. Der letzte aktive Chip kann nicht abgewählt werden.
  const alleStatusKeys = useMemo(() => states.map((s) => s.key), [states]);
  const [active, setActive] = useState<Set<string>>(
    () => new Set(alleStatusKeys),
  );

  const toggle = (key: string) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size <= 1) return prev; // mindestens ein Filter bleibt aktiv
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  // Counts je StatusDef über den gesamten (ungefilterten) Bestand.
  const countByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of states) m[s.key] = 0;
    for (const v of alle) m[v.status] = (m[v.status] ?? 0) + 1;
    return m;
  }, [alle, states]);

  const sichtbar = useMemo(
    () => alle.filter((v) => active.has(v.status)),
    [alle, active],
  );

  // Sortierung — generische Getter je Spalte.
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const statusLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of states) m[s.key] = s.label;
    return m;
  }, [states]);

  const getter = useMemo(() => {
    return (v: Vorgang<T>, key: ColKey): string | number => {
      if (key === "vorgang") return v.vorgangsnummer;
      if (key === "eingang") return v.eingangIso;
      if (key === "berechnung") return v.berechnung?.betrag ?? -Infinity;
      if (key === "status") return statusLabel[v.status] ?? v.status;
      // feld:<pfad>
      return readPfad(v.antragsdaten, key.slice("feld:".length));
    };
  }, [statusLabel]);

  const rows = useMemo(() => {
    if (!sortKey || !sortDir) return sichtbar;
    return [...sichtbar].sort((a, b) => {
      const av = getter(a, sortKey);
      const bv = getter(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [sichtbar, sortKey, sortDir, getter]);

  const toggleSort = (key: ColKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  // Aktive Zeile gültig halten, wenn sich Filter/Sortierung die Zeilenzahl ändern.
  React.useEffect(() => {
    setActiveRow((cur) =>
      rows.length === 0 ? 0 : Math.min(cur, rows.length - 1),
    );
  }, [rows.length]);

  // Lade-/Ergebnis-Zustand zentral ansagen (eine Ansage-Wahrheit, nicht je Widget).
  React.useEffect(() => {
    if (loading) {
      announce("Arbeitsvorrat wird geladen", "polite");
    }
  }, [loading, announce]);
  React.useEffect(() => {
    if (loading) return;
    announce(
      `${sichtbar.length} von ${alle.length} Vorgängen angezeigt`,
      "polite",
    );
  }, [loading, sichtbar.length, alle.length, announce]);

  // Pfeiltasten-Navigation der Tabellenzeilen (Roving-Tabindex). Enter/Space öffnen bleiben erhalten.
  const handleRowKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLTableRowElement>,
      index: number,
      id: string,
    ) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen(id);
        return;
      }
      let next: number;
      switch (event.key) {
        case "ArrowDown":
          next = Math.min(index + 1, rows.length - 1);
          break;
        case "ArrowUp":
          next = Math.max(index - 1, 0);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = rows.length - 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      setActiveRow(next);
      rowRefs.current[next]?.focus();
    },
    [onOpen, rows.length],
  );

  const allActive = active.size === alleStatusKeys.length;
  // Hinweis-Zähler: Vorgänge mit KI-Flags (Aufmerksamkeit nötig).
  const flaggedCount = useMemo(
    () => alle.filter((v) => v.ki.flags.length > 0).length,
    [alle],
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      {/* Kopf — sticky, mit Bestands-Kurzinfo */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-end justify-between gap-6 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <InboxIcon
                className="h-5 w-5 text-foreground"
                aria-hidden="true"
              />
              <h1 className="text-2xl font-semibold text-foreground">
                Arbeitsvorrat
              </h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {sichtbar.length} von {alle.length} Vorgängen
              {flaggedCount > 0 && <> · {flaggedCount} mit KI-Hinweis</>} ·{" "}
              {config.label}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 flex-col px-6 py-6">
        {loading ? (
          // Ladezustand: layout-treuer Tabellen-Platzhalter statt Spinner (kein Layout-Shift).
          // Ansage übernimmt zentral useStatusRegion; das Skeleton selbst ist dekorativ (aria-hidden).
          <div className="mt-1 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card p-4 shadow-sm">
            <SkeletonTable rows={6} cols={4 + schluesselFelder.length} />
          </div>
        ) : alle.length === 0 ? (
          // Echter Leerzustand des Eingangskorbs (nicht nur ein Filter): tritt an die Stelle der Tabelle
          // und kündigt den Zustand auch nicht-visuell an (EmptyState rendert role="status").
          <div className="mt-1 flex min-h-0 w-full min-w-0 flex-1 flex-col">
            <EmptyState
              icon={InboxIcon}
              title="0 offene Vorgänge"
              description="Im Arbeitsvorrat liegen derzeit keine Vorgänge zur Bearbeitung."
              {...(onReload
                ? { action: { label: "Aktualisieren", onClick: onReload } }
                : {})}
            />
          </div>
        ) : (
          <>
            {/* Schnellfilter-Chips je StatusDef (mit Counts) */}
            <div className="flex items-center gap-3">
              <span className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                Schnellfilter:
              </span>
              <div className="flex flex-1 items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:thin]">
                {states.map((s) => {
                  const on = active.has(s.key);
                  const isLastOn = on && active.size === 1;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => toggle(s.key)}
                      aria-pressed={on}
                      aria-label={`Filter ${s.label}, ${countByStatus[s.key] ?? 0} Vorgänge`}
                      disabled={isLastOn}
                      title={
                        isLastOn
                          ? "Mindestens ein Filter muss aktiv sein"
                          : undefined
                      }
                      className={cn(
                        // Chip = rounded-full, text-xs Minimum; kanonisches Fokus-Rezept (Spec 3.2).
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors duration-150 ease-out motion-reduce:transition-none",
                        "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                        on
                          ? "border-accent bg-accent/15 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                        isLastOn && "cursor-not-allowed opacity-80",
                      )}
                    >
                      <span>{s.label}</span>
                      <span className="rounded-full bg-secondary px-1.5 py-px text-xs tabular-nums text-foreground">
                        {countByStatus[s.key] ?? 0}
                      </span>
                    </button>
                  );
                })}
                {!allActive && (
                  <button
                    type="button"
                    onClick={() => setActive(new Set(alleStatusKeys))}
                    className="shrink-0 rounded-md px-1 text-xs text-muted-foreground underline-offset-2 outline-none transition-colors duration-150 ease-out hover:text-foreground hover:underline focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] motion-reduce:transition-none"
                  >
                    Alle anzeigen
                  </button>
                )}
              </div>
            </div>

            {/* Tabellen-Container: Card-Ebene (border + shadow-sm), innen-scrollend, sticky Header */}
            <div className="mt-4 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[760px] text-sm">
                  <TableHeader className="sticky top-0 z-20 bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <TableRow>
                      <Th
                        label="Vorgangsnummer"
                        cKey="vorgang"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <Th
                        label="Eingang"
                        cKey="eingang"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      {schluesselFelder.map((f) => (
                        <Th
                          key={f.pfad}
                          label={f.label}
                          cKey={`feld:${f.pfad}`}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={toggleSort}
                        />
                      ))}
                      <Th
                        label="Berechnung"
                        cKey="berechnung"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                      <Th
                        label="Status"
                        cKey="status"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={toggleSort}
                      />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((v, index) => {
                      const ber = berechnungText(v.berechnung);
                      return (
                        <TableRow
                          key={v.id}
                          ref={(el: HTMLTableRowElement | null) => {
                            rowRefs.current[index] = el;
                          }}
                          // Roving-Tabindex: nur die aktive Zeile ist im Tab-Fokus; Pfeiltasten wandern
                          // (statt jede Zeile einzeln in die Tab-Reihenfolge zu legen).
                          tabIndex={index === activeRow ? 0 : -1}
                          role="link"
                          aria-label={`Vorgang ${v.vorgangsnummer} öffnen`}
                          onClick={() => {
                            setActiveRow(index);
                            onOpen(v.id);
                          }}
                          onFocus={() => setActiveRow(index)}
                          onKeyDown={(e) => handleRowKeyDown(e, index, v.id)}
                          className="group cursor-pointer border-t border-border outline-none transition-colors duration-150 ease-out hover:bg-secondary/40 focus:bg-secondary/40 focus-visible:ring-inset focus-visible:ring-ring/50 focus-visible:ring-[3px] motion-reduce:transition-none"
                        >
                          <TableCell className="align-top">
                            <span className="font-mono text-xs font-medium text-primary group-hover:underline">
                              {v.vorgangsnummer}
                            </span>
                            {v.ki.flags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {v.ki.flags.map((flag) => (
                                  <FlagIndikator key={flag} flag={flag} />
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="align-top text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {eingangText(v.eingangIso)}
                            </span>
                          </TableCell>
                          {schluesselFelder.map((f) => (
                            <TableCell
                              key={f.pfad}
                              className="align-top text-foreground"
                            >
                              {readPfad(v.antragsdaten, f.pfad) || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          ))}
                          <TableCell className="align-top">
                            {ber ? (
                              <>
                                <div className="font-mono text-sm tabular-nums text-foreground">
                                  {ber.betrag}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {ber.sub}
                                </div>
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusPill status={v.status} states={states} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4 + schluesselFelder.length}
                          className="p-6"
                        >
                          {/* Leerer FILTER (Bestand ist nicht leer) — mit Recovery „Filter zurücksetzen". */}
                          <EmptyState
                            as="p"
                            icon={InboxIcon}
                            title="Keine Vorgänge im aktuellen Filter"
                            description="Für die gewählten Statusfilter gibt es keine Treffer. Setzen Sie die Filter zurück, um alle Vorgänge zu sehen."
                            className="border-0 bg-transparent py-4"
                            {...(allActive
                              ? {}
                              : {
                                  action: {
                                    label: "Alle anzeigen",
                                    onClick: () =>
                                      setActive(new Set(alleStatusKeys)),
                                    variant: "outline",
                                  },
                                })}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── Sortierbarer Spalten-Header (a11y: Button mit aria-sort am TableHead) ────
function Th({
  label,
  cKey,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  cKey: ColKey;
  sortKey: ColKey | null;
  sortDir: SortDir;
  onSort: (key: ColKey) => void;
}): ReactElement {
  const active = sortKey === cKey;
  const SortIcon =
    active && sortDir === "asc"
      ? ArrowUp
      : active && sortDir === "desc"
        ? ArrowDown
        : ArrowUpDown;
  const ariaSort = active
    ? sortDir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <TableHead aria-sort={ariaSort} className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(cKey)}
        className="inline-flex items-center gap-1 rounded-md px-1 uppercase tracking-wide outline-none transition-colors duration-150 ease-out hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:text-foreground motion-reduce:transition-none"
        aria-label={`${label} sortieren`}
      >
        {label}
        <SortIcon
          className={cn("h-3 w-3", active ? "text-accent" : "opacity-60")}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}

// ── KI-Flag-Indikator — generisch: Flag-Schlüssel werden lesbar gerendert ────
function FlagIndikator({ flag }: { flag: string }): ReactElement {
  // Heuristik nur für die VISUELLE Tönung (Verdacht/Hinweis → warn, sonst info) — kein Domänen-Inhalt.
  const istWarnung = /verdacht|unklar|fehlt|risiko|warn/i.test(flag);
  const Icon = istWarnung ? AlertTriangle : Sparkles;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs",
        istWarnung ? "text-status-warn" : "text-status-info",
      )}
      title={`KI-Hinweis: ${flag}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {flagLabel(flag)}
    </span>
  );
}

/** Flag-Schlüssel ("nachweis_fehlt") → lesbares Label ("Nachweis fehlt") — rein typografisch, ohne Fach-Annahme. */
function flagLabel(flag: string): string {
  const text = flag.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
