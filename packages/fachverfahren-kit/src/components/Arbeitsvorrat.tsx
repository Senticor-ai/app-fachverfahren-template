// components/Arbeitsvorrat — der GENERISCHE Eingangskorb/Arbeitsvorrat der internen Sicht (Sachbearbeitung).
//
// UX 1:1 aus der Referenz (Lovable amt.index = Inbox: Schnellfilter-Chips mit Counts, sortierbare sticky-Table,
// Klick/Enter öffnet den Vorgang, KI-Flag-Indikatoren, StatusPill) — aber data-driven über die `LeistungConfig`
// statt fest verdrahtet. Tabellen-Container nach dem sift-Pattern (maskierter Card-Rahmen, innen-scrollender Body,
// sticky Header). KEIN domänen-Literal: Spalten/Status/Flags/Felder kommen ausschliesslich aus props.
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
import type { Berechnung, LeistungConfig, StatusDef, Vorgang, VorgangPort } from "../types.js";
import { cn } from "../lib/cn.js";
import { Badge } from "../ui/badge.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.js";

export interface ArbeitsvorratProps<T = Record<string, unknown>> {
  config: LeistungConfig<T>;
  port: VorgangPort<T>;
  /** Wird beim Aktivieren einer Zeile (Klick/Enter/Space) mit der Vorgang-Id gerufen. */
  onOpen: (id: string) => void;
}

/** StatusPill — generisch über StatusDef; Ton mappt 1:1 auf die Token-getriebene Badge (status-ok/warn/info/block/neu). */
export function StatusPill({ status }: { status: StatusDef }): ReactElement {
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

// ── Sort-State (inlined, generisch — keine externe Util-Abhängigkeit) ────────
type SortDir = "asc" | "desc" | null;
type ColKey = "vorgang" | "eingang" | "berechnung" | "status" | `feld:${string}`;

/** Liefert einen verschachtelten Wert (Pfad wie "person.nachname") aus den Antragsdaten als String. */
function readPfad(antragsdaten: unknown, pfad: string): string {
  let cur: unknown = antragsdaten;
  for (const teil of pfad.split(".")) {
    if (cur && typeof cur === "object" && teil in (cur as Record<string, unknown>)) {
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
function berechnungText(berechnung: Berechnung | undefined): { betrag: string; sub: string } | null {
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
}: ArbeitsvorratProps<T>): ReactElement {
  const alle = port.list();
  const states = config.statusMachine.states;

  // Schlüssel-Antragsfelder: 1–2 Felder aus der ersten Detail-Sektion (generisch, ohne Domänen-Literal).
  const schluesselFelder = useMemo(
    () => (config.detailSektionen[0]?.felder ?? []).slice(0, 2),
    [config.detailSektionen],
  );

  // Aktive Status-Filter — default: alle. Der letzte aktive Chip kann nicht abgewählt werden.
  const alleStatusKeys = useMemo(() => states.map((s) => s.key), [states]);
  const [active, setActive] = useState<Set<string>>(() => new Set(alleStatusKeys));

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

  const sichtbar = useMemo(() => alle.filter((v) => active.has(v.status)), [alle, active]);

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

  const statusByKey = useMemo(() => {
    const m: Record<string, StatusDef> = {};
    for (const s of states) m[s.key] = s;
    return m;
  }, [states]);

  const allActive = active.size === alleStatusKeys.length;
  // Hinweis-Zähler: Vorgänge mit KI-Flags (Aufmerksamkeit nötig).
  const flaggedCount = useMemo(() => alle.filter((v) => v.ki.flags.length > 0).length, [alle]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      {/* Kopf — sticky, mit Bestands-Kurzinfo */}
      <div className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-end justify-between gap-6 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <InboxIcon className="h-5 w-5 text-foreground" aria-hidden="true" />
              <h1 className="text-2xl font-semibold text-foreground">Arbeitsvorrat</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {sichtbar.length} von {alle.length} Vorgängen
              {flaggedCount > 0 && <> · {flaggedCount} mit KI-Hinweis</>} · {config.label}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full min-h-0 max-w-6xl flex-1 flex-col px-6 py-6">
        {/* Schnellfilter-Chips je StatusDef (mit Counts) */}
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
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
                  title={isLastOn ? "Mindestens ein Filter muss aktiv sein" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                    on
                      ? "border-accent bg-accent/15 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                    isLastOn && "cursor-not-allowed opacity-80",
                  )}
                >
                  <span>{s.label}</span>
                  <span className="rounded-full bg-secondary px-1.5 py-px text-[10px] tabular-nums text-foreground">
                    {countByStatus[s.key] ?? 0}
                  </span>
                </button>
              );
            })}
            {!allActive && (
              <button
                type="button"
                onClick={() => setActive(new Set(alleStatusKeys))}
                className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
              >
                Alle anzeigen
              </button>
            )}
          </div>
        </div>

        {/* Tabellen-Container (sift-Pattern): maskierter Card-Rahmen, innen-scrollend, sticky Header */}
        <div className="mt-4 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="min-w-[760px] text-sm">
              <TableHeader className="sticky top-0 z-20 bg-secondary text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <TableRow>
                  <Th label="Vorgangsnummer" cKey="vorgang" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Eingang" cKey="eingang" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
                  <Th label="Berechnung" cKey="berechnung" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Status" cKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((v) => {
                  const ber = berechnungText(v.berechnung);
                  const st = statusByKey[v.status];
                  return (
                    <TableRow
                      key={v.id}
                      tabIndex={0}
                      role="link"
                      aria-label={`Vorgang ${v.vorgangsnummer} öffnen`}
                      onClick={() => onOpen(v.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(v.id);
                        }
                      }}
                      className="group cursor-pointer border-t border-border transition-colors hover:bg-secondary/40 focus:bg-secondary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      <TableCell className="align-top">
                        <span className="font-mono text-[12px] font-medium text-primary group-hover:underline">
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
                      <TableCell className="align-top text-[12px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {eingangText(v.eingangIso)}
                        </span>
                      </TableCell>
                      {schluesselFelder.map((f) => (
                        <TableCell key={f.pfad} className="align-top text-foreground">
                          {readPfad(v.antragsdaten, f.pfad) || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="align-top">
                        {ber ? (
                          <>
                            <div className="font-mono tabular-nums text-foreground">{ber.betrag}</div>
                            <div className="text-[10px] text-muted-foreground">{ber.sub}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {st ? <StatusPill status={st} /> : <span className="text-muted-foreground">{v.status}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4 + schluesselFelder.length}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Keine Vorgänge in diesem Filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
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
  const SortIcon = active && sortDir === "asc" ? ArrowUp : active && sortDir === "desc" ? ArrowDown : ArrowUpDown;
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHead aria-sort={ariaSort} className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(cKey)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
        aria-label={`${label} sortieren`}
      >
        {label}
        <SortIcon className={cn("h-3 w-3", active ? "text-accent" : "opacity-60")} aria-hidden="true" />
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
        "inline-flex items-center gap-1 text-[10px]",
        istWarnung ? "text-status-warn" : "text-status-info",
      )}
      title={`KI-Hinweis: ${flag}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {flagLabel(flag)}
    </span>
  );
}

/** Flag-Schlüssel ("nachweis_fehlt") → lesbares Label ("Nachweis fehlt") — rein typografisch, ohne Fach-Annahme. */
function flagLabel(flag: string): string {
  const text = flag.replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
