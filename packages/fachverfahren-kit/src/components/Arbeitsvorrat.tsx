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
// Design-System-Primitive statt roher Controls (Konsolidierung: `ps-btn`-CSS + rohe input/select → Kit).
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select.js";
import { EmptyState } from "./EmptyState.js";
import { StatusPill } from "./StatusPill.js";
import { useStatusRegion } from "./StatusRegion.js";
import { formatBetrag as formatBetragKit } from "../format.js";
// EINE Wahrheit über Feldpfad-Zugriff (array-index-fähig) + String-Projektion — ersetzt das lokale, naive `readPfad`.
import { getPath, asString } from "../lib/antrag-felder.js";

export interface ArbeitsvorratProps<T = Record<string, unknown>> {
  config: LeistungConfig<T>;
  port: VorgangPort<T>;
  /** Wird beim Aktivieren einer Zeile (Klick/Enter/Space) mit der Vorgang-Id gerufen. */
  onOpen: (id: string) => void;
  /** Einträge je Seite im Arbeitsvorrat. */
  pageSize?: number;
  /** Optionale Sammelaktionen für ausgewählte Vorgänge. Ohne Aktionen bleibt die Liste ohne Auswahlspalte. */
  bulkActions?: ArbeitsvorratBulkAction[];
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

export interface ArbeitsvorratBulkAction {
  id: string;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick: (ids: string[]) => void;
}

// ── Sort-State (inlined, generisch — keine externe Util-Abhängigkeit) ────────
type SortDir = "asc" | "desc" | null;
type ColKey =
  "vorgang" | "eingang" | "berechnung" | "status" | `feld:${string}`;

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
  // Zentrale, cent-bewusste Formatierung (format.ts).
  return {
    betrag: formatBetragKit(berechnung.betrag, berechnung.einheit),
    sub: berechnung.label,
  };
}

export function Arbeitsvorrat<T = Record<string, unknown>>({
  config,
  port,
  onOpen,
  pageSize = 10,
  bulkActions = [],
  loading = false,
  onReload,
}: ArbeitsvorratProps<T>): ReactElement {
  const { announce } = useStatusRegion();
  const alle = port.list();
  const states = config.statusMachine.states;
  const [pageIndex, setPageIndex] = React.useState(0);
  const [currentPageSize, setCurrentPageSize] = React.useState(() =>
    normalisePageSize(pageSize),
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const effectivePageSize = normalisePageSize(currentPageSize);
  const selectionEnabled = bulkActions.length > 0;
  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);

  // Roving-Tabindex für die Tabellen-Navigation: nur die aktive Zeile ist im Tab-Fokus,
  // Pfeiltasten/Home/End wandern durch die Liste (WAI-ARIA Grid-Muster).
  // Roving-Fokusziel ist der Öffnen-Button in der ersten Zelle jeder Zeile (nicht mehr der <tr> — der behält so
  // seine native row-Semantik, 1.3.1/4.1.2).
  const rowRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
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
      return asString(getPath(v.antragsdaten, key.slice("feld:".length)));
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

  const pageCount = Math.max(1, Math.ceil(rows.length / effectivePageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * effectivePageSize;
  const pageRows = rows.slice(pageStart, pageStart + effectivePageSize);
  const pageStatus =
    rows.length === 0
      ? "0 von 0"
      : `${pageStart + 1}-${pageStart + pageRows.length} von ${rows.length}`;
  const pageSizeOptions = React.useMemo(
    () => uniqueSortedNumbers([effectivePageSize, pageSize, 10, 25, 50]),
    [effectivePageSize, pageSize],
  );
  const allPageIds = pageRows.map((vorgang) => vorgang.id);
  const selectedOnPage = allPageIds.filter((id) => selectedSet.has(id)).length;
  const allPageSelected =
    allPageIds.length > 0 && selectedOnPage === allPageIds.length;
  const showPagination =
    rows.length > effectivePageSize || pageSizeOptions.length > 1;

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

  const mobileSortOptions = useMemo(
    () => [
      { key: "eingang" as ColKey, label: "Eingang" },
      { key: "vorgang" as ColKey, label: "Vorgangsnummer" },
      ...schluesselFelder.map((f) => ({
        key: `feld:${f.pfad}` as ColKey,
        label: f.label,
      })),
      { key: "berechnung" as ColKey, label: "Berechnung" },
      { key: "status" as ColKey, label: "Status" },
    ],
    [schluesselFelder],
  );

  const mobileSortValue = sortKey && sortDir ? `${sortKey}|${sortDir}` : "none";

  const updateMobileSort = (value: string) => {
    if (value === "none") {
      setSortKey(null);
      setSortDir(null);
      return;
    }
    const [nextKey, nextDir] = value.split("|");
    setSortKey(nextKey as ColKey);
    setSortDir(nextDir === "desc" ? "desc" : "asc");
  };

  React.useEffect(() => {
    setCurrentPageSize(normalisePageSize(pageSize));
  }, [pageSize]);

  React.useEffect(() => {
    setPageIndex(0);
  }, [active, sortKey, sortDir, currentPageSize]);

  React.useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  React.useEffect(() => {
    if (!selectionEnabled) {
      return;
    }
    const rowIds = new Set(rows.map((vorgang) => vorgang.id));
    setSelectedIds((current) => current.filter((id) => rowIds.has(id)));
  }, [rows, selectionEnabled]);

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  function selectCurrentPage() {
    setSelectedIds((current) =>
      Array.from(new Set([...current, ...allPageIds])),
    );
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  // Aktive Zeile gültig halten, wenn sich Filter/Sortierung die Zeilenzahl ändern.
  React.useEffect(() => {
    setActiveRow((cur) => {
      if (rows.length === 0) return 0;
      const pageEnd = pageStart + pageRows.length - 1;
      if (cur < pageStart || cur > pageEnd) return pageStart;
      return Math.min(cur, rows.length - 1);
    });
  }, [rows.length, pageRows.length, pageStart]);

  // Lade-/Ergebnis-Zustand zentral ansagen (eine Ansage-Wahrheit, nicht je Widget).
  React.useEffect(() => {
    if (loading) {
      announce("Arbeitsvorrat wird geladen", "polite");
    }
  }, [loading, announce]);
  React.useEffect(() => {
    if (loading) return;
    announce(`${rows.length} von ${alle.length} Vorgängen angezeigt`, "polite");
  }, [loading, rows.length, alle.length, announce]);

  // Pfeiltasten-Navigation zwischen den Zeilen-Buttons (Roving-Tabindex). Enter/Space aktiviert der NATIVE Button
  // selbst (onClick) — hier NICHT zusätzlich onOpen rufen, sonst doppelte Auslösung (Kritik-Fund).
  const handleRowKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      let next: number;
      const pageEnd = pageStart + pageRows.length - 1;
      switch (event.key) {
        case "ArrowDown":
          next = Math.min(index + 1, pageEnd);
          break;
        case "ArrowUp":
          next = Math.max(index - 1, pageStart);
          break;
        case "Home":
          next = pageStart;
          break;
        case "End":
          next = pageEnd;
          break;
        default:
          return;
      }
      event.preventDefault();
      setActiveRow(next);
      rowRefs.current[next]?.focus();
    },
    [pageRows.length, pageStart],
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
                        "ps-inbox__chip",
                        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ease-out motion-reduce:transition-none",
                        "outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                        on
                          ? "ps-inbox__chip--active border-accent bg-accent/15 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                        isLastOn && "cursor-not-allowed opacity-80",
                      )}
                    >
                      <span>{s.label}</span>
                      <span className="ps-inbox__chip-count rounded-full bg-secondary px-1.5 py-px text-xs tabular-nums text-foreground">
                        {countByStatus[s.key] ?? 0}
                      </span>
                    </button>
                  );
                })}
                {!allActive && (
                  <button
                    type="button"
                    onClick={() => setActive(new Set(alleStatusKeys))}
                    className="ps-inbox__filter-reset shrink-0 rounded-md px-1 text-xs text-muted-foreground underline-offset-2 outline-none transition-colors ease-out hover:text-foreground hover:underline focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] motion-reduce:transition-none"
                  >
                    Alle anzeigen
                  </button>
                )}
              </div>
            </div>

            <div className="ps-inbox__mobile-sort">
              <span>Sortieren</span>
              <Select value={mobileSortValue} onValueChange={updateMobileSort}>
                <SelectTrigger
                  aria-label="Sortierung"
                  className="h-11 min-w-48 text-sm font-semibold normal-case"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Standardreihenfolge</SelectItem>
                  {mobileSortOptions.map((option) => (
                    <React.Fragment key={option.key}>
                      <SelectItem value={`${option.key}|asc`}>
                        {option.label} aufsteigend
                      </SelectItem>
                      <SelectItem value={`${option.key}|desc`}>
                        {option.label} absteigend
                      </SelectItem>
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="ps-inbox__cards mt-4" aria-label="Vorgänge">
              {rows.length === 0 ? (
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
                          onClick: () => setActive(new Set(alleStatusKeys)),
                          variant: "outline",
                        },
                      })}
                />
              ) : (
                pageRows.map((v, pageOffset) => {
                  const ber = berechnungText(v.berechnung);
                  const rowIndex = pageStart + pageOffset;
                  const checked = selectedSet.has(v.id);
                  return selectionEnabled ? (
                    <article
                      key={v.id}
                      className="ps-inbox__mobile-card"
                      aria-label={`Vorgang ${v.vorgangsnummer}`}
                      onFocus={() => setActiveRow(rowIndex)}
                    >
                      <span className="ps-inbox__mobile-card-head">
                        <span className="ps-inbox__select">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleSelection(v.id)}
                            aria-label={`Vorgang ${v.vorgangsnummer} auswählen`}
                          />
                          <span>Auswählen</span>
                        </span>
                        <StatusPill status={v.status} states={states} />
                      </span>
                      <span className="ps-inbox__mobile-card-title ps-num text-primary">
                        {v.vorgangsnummer}
                      </span>
                      <span className="ps-inbox__mobile-card-meta">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {eingangText(v.eingangIso)}
                      </span>
                      <span className="ps-inbox__mobile-card-fields">
                        {schluesselFelder.map((f) => (
                          <span key={f.pfad}>
                            <span>{f.label}</span>
                            <strong>
                              {asString(getPath(v.antragsdaten, f.pfad)) || "—"}
                            </strong>
                          </span>
                        ))}
                      </span>
                      <span className="ps-inbox__mobile-card-footer">
                        <span>
                          <span>Berechnung</span>
                          <strong className="ps-num">
                            {ber ? ber.betrag : "—"}
                          </strong>
                        </span>
                        {v.ki.flags.length > 0 && (
                          <span className="ps-inbox__mobile-card-flags">
                            {v.ki.flags.map((flag) => (
                              <FlagIndikator key={flag} flag={flag} />
                            ))}
                          </span>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Vorgang ${v.vorgangsnummer} öffnen`}
                        onClick={() => {
                          setActiveRow(rowIndex);
                          onOpen(v.id);
                        }}
                      >
                        Vorgang öffnen
                      </Button>
                    </article>
                  ) : (
                    <button
                      key={v.id}
                      type="button"
                      className="ps-inbox__mobile-card"
                      aria-label={`Vorgang ${v.vorgangsnummer} öffnen`}
                      onClick={() => {
                        setActiveRow(rowIndex);
                        onOpen(v.id);
                      }}
                      onFocus={() => setActiveRow(rowIndex)}
                    >
                      <span className="ps-inbox__mobile-card-head">
                        <span className="ps-num text-primary">
                          {v.vorgangsnummer}
                        </span>
                        <StatusPill status={v.status} states={states} />
                      </span>
                      <span className="ps-inbox__mobile-card-meta">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        {eingangText(v.eingangIso)}
                      </span>
                      <span className="ps-inbox__mobile-card-fields">
                        {schluesselFelder.map((f) => (
                          <span key={f.pfad}>
                            <span>{f.label}</span>
                            <strong>
                              {asString(getPath(v.antragsdaten, f.pfad)) || "—"}
                            </strong>
                          </span>
                        ))}
                      </span>
                      <span className="ps-inbox__mobile-card-footer">
                        <span>
                          <span>Berechnung</span>
                          <strong className="ps-num">
                            {ber ? ber.betrag : "—"}
                          </strong>
                        </span>
                        {v.ki.flags.length > 0 && (
                          <span className="ps-inbox__mobile-card-flags">
                            {v.ki.flags.map((flag) => (
                              <FlagIndikator key={flag} flag={flag} />
                            ))}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {/* Tabellen-Container: Card-Ebene (border + shadow-sm), innen-scrollend, sticky Header */}
            <div className="ps-inbox__responsive-table mt-4 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="min-h-0 flex-1 overflow-auto">
                <Table className="min-w-[760px] text-sm">
                  <TableHeader className="sticky top-0 z-20 bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <TableRow>
                      {selectionEnabled ? (
                        <TableHead scope="col" className="w-14 px-4 py-2">
                          <span
                            className="ps-inbox__select ps-inbox__select--head"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              checked={
                                allPageSelected
                                  ? true
                                  : selectedOnPage > 0
                                    ? "indeterminate"
                                    : false
                              }
                              aria-label="Alle sichtbaren Vorgänge auswählen"
                              onCheckedChange={() =>
                                allPageSelected
                                  ? clearSelection()
                                  : selectCurrentPage()
                              }
                            />
                            <span className="ps-visually-hidden">Auswahl</span>
                          </span>
                        </TableHead>
                      ) : null}
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
                    {pageRows.map((v, pageOffset) => {
                      const ber = berechnungText(v.berechnung);
                      const rowIndex = pageStart + pageOffset;
                      const checked = selectedSet.has(v.id);
                      return (
                        <TableRow
                          key={v.id}
                          // 1.3.1/4.1.2: KEIN role/tabindex am <tr> mehr (das löschte die row-Semantik) — die
                          // Zeile bleibt eine echte Tabellenzeile. Der Maus-Zeilenklick bleibt als Komfort erhalten;
                          // die tastatur-/AT-fähige Aktion trägt der Öffnen-Button in der ersten Zelle. focus-within
                          // hebt die Zeile hervor, wenn ihr Button fokussiert ist.
                          onClick={() => {
                            setActiveRow(rowIndex);
                            onOpen(v.id);
                          }}
                          className={cn(
                            "group cursor-pointer border-t border-border transition-colors ease-out hover:bg-secondary/40 focus-within:bg-secondary/40 motion-reduce:transition-none",
                            checked && "bg-secondary/30",
                          )}
                        >
                          {selectionEnabled ? (
                            <TableCell className="w-14 align-top">
                              <span
                                className="ps-inbox__select"
                                onClick={(event) => event.stopPropagation()}
                                onKeyDown={(event) => event.stopPropagation()}
                              >
                                <Checkbox
                                  checked={checked}
                                  aria-label={`Vorgang ${v.vorgangsnummer} auswählen`}
                                  onCheckedChange={() => toggleSelection(v.id)}
                                />
                                <span className="ps-visually-hidden">
                                  Vorgang {v.vorgangsnummer} auswählen
                                </span>
                              </span>
                            </TableCell>
                          ) : null}
                          <TableCell className="align-top">
                            {/* Echtes fokussierbares Bedienelement (statt role am <tr>): trägt Roving-Tabindex,
                                Pfeiltasten-Navigation und die Öffnen-Aktion. Enter/Space aktiviert der Button nativ;
                                stopPropagation verhindert das zusätzliche Auslösen des <tr>-onClick. */}
                            <button
                              type="button"
                              ref={(el) => {
                                rowRefs.current[rowIndex] = el;
                              }}
                              tabIndex={rowIndex === activeRow ? 0 : -1}
                              aria-label={`Vorgang ${v.vorgangsnummer} öffnen`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveRow(rowIndex);
                                onOpen(v.id);
                              }}
                              onFocus={() => setActiveRow(rowIndex)}
                              onKeyDown={(e) => handleRowKeyDown(e, rowIndex)}
                              className="rounded-sm font-mono text-xs font-medium text-primary underline-offset-2 outline-none group-hover:underline hover:underline focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                            >
                              {v.vorgangsnummer}
                            </button>
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
                              {asString(getPath(v.antragsdaten, f.pfad)) || (
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
                          colSpan={
                            4 +
                            schluesselFelder.length +
                            (selectionEnabled ? 1 : 0)
                          }
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

            {showPagination ? (
              <ArbeitsvorratPagination
                page={safePageIndex}
                pageCount={pageCount}
                pageSize={effectivePageSize}
                pageSizeOptions={pageSizeOptions}
                status={pageStatus}
                onPageChange={setPageIndex}
                onPageSizeChange={setCurrentPageSize}
              />
            ) : (
              <p className="ps-inbox__page-status" role="status">
                {pageStatus}
              </p>
            )}

            {selectionEnabled ? (
              <ArbeitsvorratBulkActions
                selectedCount={selectedIds.length}
                totalCount={rows.length}
                selectedOnPage={selectedOnPage}
                allPageSelected={allPageSelected}
                canSelectPage={allPageIds.length > 0}
                actions={bulkActions}
                selectedIds={selectedIds}
                onSelectCurrentPage={selectCurrentPage}
                onClearSelection={clearSelection}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function normalisePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(
    new Set(
      values
        .map(normalisePageSize)
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function ArbeitsvorratPagination({
  page,
  pageCount,
  pageSize,
  pageSizeOptions,
  status,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: number[];
  status: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}): ReactElement {
  return (
    <nav className="ps-inbox__pagination" aria-label="Seitennavigation">
      <p className="ps-inbox__page-status" role="status" aria-live="polite">
        {status} · Seite <span className="ps-num">{page + 1}</span> von{" "}
        <span className="ps-num">{pageCount}</span>
      </p>
      <div className="ps-inbox__page-size">
        <span>Einträge pro Seite</span>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            aria-label="Einträge pro Seite"
            className="h-9 w-20 text-sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="ps-inbox__page-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          Zurück
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
        >
          Weiter
        </Button>
      </div>
    </nav>
  );
}

function ArbeitsvorratBulkActions({
  selectedCount,
  totalCount,
  selectedOnPage,
  allPageSelected,
  canSelectPage,
  actions,
  selectedIds,
  onSelectCurrentPage,
  onClearSelection,
}: {
  selectedCount: number;
  totalCount: number;
  selectedOnPage: number;
  allPageSelected: boolean;
  canSelectPage: boolean;
  actions: ArbeitsvorratBulkAction[];
  selectedIds: string[];
  onSelectCurrentPage: () => void;
  onClearSelection: () => void;
}): ReactElement {
  const hasSelection = selectedCount > 0;
  return (
    <section
      className={cn(
        "ps-bulk-action-bar",
        hasSelection && "ps-bulk-action-bar--active",
      )}
      aria-label="Sammelaktionen"
    >
      <div className="ps-bulk-action-bar__content">
        <div className="ps-bulk-action-bar__header">
          <div>
            <h2>Auswahl</h2>
            <p className="ps-bulk-action-bar__status" aria-live="polite">
              <span className="ps-num">{selectedCount}</span> von{" "}
              <span className="ps-num">{totalCount}</span> Vorgängen ausgewählt
            </p>
          </div>
          <p className="ps-bulk-action-bar__detail">
            <span className="ps-num">{selectedOnPage}</span> auf dieser Seite
            ausgewählt.
          </p>
        </div>
        <div className="ps-bulk-action-bar__footer">
          <p>
            Aktionen bleiben deaktiviert, bis mindestens ein sichtbarer Vorgang
            ausgewählt ist.
          </p>
        </div>
      </div>
      <div className="ps-bulk-action-bar__actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={allPageSelected || !canSelectPage}
          onClick={onSelectCurrentPage}
        >
          Aktuelle Seite auswählen
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!hasSelection}
          onClick={onClearSelection}
        >
          Auswahl leeren
        </Button>
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant={bulkActionVariant(action.tone)}
            size="sm"
            disabled={!hasSelection || action.disabled}
            onClick={() => action.onClick(selectedIds)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Bulk-Ton → Kit-Button-Variante (ersetzt die frühere `ps-btn--*`-Klassenzuordnung). */
function bulkActionVariant(
  tone: ArbeitsvorratBulkAction["tone"],
): "default" | "destructive" | "outline" {
  if (tone === "primary") return "default";
  if (tone === "danger") return "destructive";
  return "outline";
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
    <TableHead
      scope="col"
      aria-sort={ariaSort}
      className="px-4 py-2 font-medium"
    >
      <button
        type="button"
        onClick={() => onSort(cKey)}
        className="ps-inbox__sort inline-flex items-center gap-1 rounded-md px-1 uppercase tracking-wide outline-none transition-colors ease-out hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:text-foreground motion-reduce:transition-none"
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
