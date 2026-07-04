import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CaseStatus, DeadlineIndicator } from "./components.js";
import {
  BulkActionBar,
  QuickFilterChips,
  type BulkAction,
  type QuickFilterOption,
} from "./worklist-controls.js";
import { SavedViewsToolbar, type SavedView } from "./workspace.js";

// Sachbearbeitungs-Posteingang (Master-Detail). Setzt den fachverfahren-ux-contract um:
// dicht, tastatureffizient, List-Detail, sticky Header, zwei eingefrorene Leitspalten (Desktop),
// Spaltensortierung, mehrfach wählbare Schnellfilter-Chips mit Anzahl (letzter aktiver Filter bleibt),
// ganze Zeile per Enter/Space aktivierbar, Zahlen mit tabular-nums (ps-num). Reine, geprüfte Komponenten —
// der Motor komponiert daraus Sachbearbeitungs-Screens.

/** Fachstatus eines Vorgangs (steuert Sortierung, Filter und die Status-Darstellung). */
export type CaseRowStatus = "offen" | "in-pruefung" | "entschieden";

export interface CaseRow {
  id: string;
  applicant: string;
  subject: string;
  status: CaseRowStatus;
  /** Frist als ISO-Datum (deterministisch, kein Date.now()). */
  dueAt: string;
  overdue?: boolean;
}

/** Ein Schnellfilter mit Label, Filterwert und der Anzahl betroffener Vorgänge. */
export interface InboxFilter {
  label: string;
  value: string;
  count: number;
}

export interface CaseInboxProps {
  cases: CaseRow[];
  selectedId?: string | undefined;
  onSelect: (id: string) => void;
  filters: InboxFilter[];
  /** Mehrfachauswahl: aktive Filterwerte (mind. einer bleibt bei Mehrfachauswahl bestehen). */
  activeFilters: string[];
  onToggleFilter: (value: string) => void;
  /** Einträge je Seite. Ohne Wert wird mit 10 Einträgen je Seite paginiert. */
  pageSize?: number;
  /** Auswahlbare Seitengrößen für die Arbeitsliste. */
  pageSizeOptions?: number[];
  /** Kontrollierte Mehrfachauswahl. Wenn nicht gesetzt, verwaltet die Komponente die Auswahl intern. */
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Aktionen für ausgewählte Einträge. Bleiben ohne Auswahl deaktiviert. */
  bulkActions?: BulkAction[];
  /** Optionaler Satz gespeicherter Ansichten. Persistenz liegt beim Aufrufer. */
  savedViews?: SavedView[];
  activeSavedViewId?: string;
  onSelectSavedView?: (id: string) => void;
  /** Kontrollierte Suche. Filtert Vorgang-ID, Antragsteller:in, Betreff und Statuslabel. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

/** Sortierbare Spalten des Posteingangs. */
type SortKey = "id" | "applicant" | "subject" | "status" | "dueAt";

const statusLabel: Record<CaseRowStatus, string> = {
  offen: "Offen",
  "in-pruefung": "In Prüfung",
  entschieden: "Entschieden",
};

const statusTone: Record<
  CaseRowStatus,
  "neutral" | "success" | "warning" | "critical"
> = {
  offen: "warning",
  "in-pruefung": "neutral",
  entschieden: "success",
};

const statusOrder: Record<CaseRowStatus, number> = {
  offen: 0,
  "in-pruefung": 1,
  entschieden: 2,
};

/**
 * Posteingang als Tabelle mit sticky Header und zwei eingefrorenen Leitspalten (Vorgang-ID,
 * Antragsteller:in). Schnellfilter-Chips sind mehrfach wählbar und lassen den letzten aktiven Filter
 * nicht abwählen. Jede Zeile ist per Enter/Space aktivierbar und hat ein aria-label.
 */
export function CaseInbox({
  cases,
  selectedId,
  onSelect,
  filters,
  activeFilters,
  onToggleFilter,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50],
  selectedIds,
  onSelectionChange,
  bulkActions = [],
  savedViews = [],
  activeSavedViewId,
  onSelectSavedView,
  searchValue,
  onSearchChange,
}: CaseInboxProps) {
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [ascending, setAscending] = useState(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [currentPageSize, setCurrentPageSize] = useState(() =>
    normalisePageSize(pageSize),
  );
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const effectivePageSize = normalisePageSize(currentPageSize);
  const availablePageSizeOptions = useMemo(
    () => normalisePageSizes([effectivePageSize, pageSize, ...pageSizeOptions]),
    [effectivePageSize, pageSize, pageSizeOptions],
  );
  const selectionEnabled =
    Boolean(selectedIds) ||
    Boolean(onSelectionChange) ||
    bulkActions.length > 0;
  const activeSelection = selectedIds ?? internalSelectedIds;
  const selectedSet = useMemo(
    () => new Set(activeSelection),
    [activeSelection],
  );
  const query = (searchValue ?? "").trim().toLocaleLowerCase("de");

  const visible = useMemo(() => {
    const filtered =
      activeFilters.length === 0
        ? cases
        : cases.filter((row) => activeFilters.includes(row.status));
    const searched =
      query.length === 0
        ? filtered
        : filtered.filter((row) => matchesSearch(row, query));
    const direction = ascending ? 1 : -1;
    return [...searched].sort((a, b) => direction * compareRows(a, b, sortKey));
  }, [cases, activeFilters, query, sortKey, ascending]);

  const pageCount = Math.max(1, Math.ceil(visible.length / effectivePageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * effectivePageSize;
  const pageRows = visible.slice(pageStart, pageStart + effectivePageSize);
  const pageStatus =
    visible.length === 0
      ? "0 von 0"
      : `${pageStart + 1}-${pageStart + pageRows.length} von ${visible.length}`;
  const allPageIds = pageRows.map((row) => row.id);
  const selectedOnPage = allPageIds.filter((id) => selectedSet.has(id)).length;
  const allPageSelected =
    allPageIds.length > 0 && selectedOnPage === allPageIds.length;
  const showPagination =
    visible.length > effectivePageSize || availablePageSizeOptions.length > 1;

  useEffect(() => {
    setCurrentPageSize(normalisePageSize(pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPageIndex(0);
  }, [activeFilters, query, sortKey, ascending, currentPageSize]);

  useEffect(() => {
    if (pageIndex > pageCount - 1) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  useEffect(() => {
    if (!selectionEnabled) {
      return;
    }
    const visibleIds = new Set(visible.map((row) => row.id));
    const next = activeSelection.filter((id) => visibleIds.has(id));
    if (!sameStringArray(next, activeSelection)) {
      updateSelection(next);
    }
  }, [selectionEnabled, visible, activeSelection]);

  function updateSelection(ids: string[]) {
    const unique = Array.from(new Set(ids));
    if (!selectedIds) {
      setInternalSelectedIds(unique);
    }
    onSelectionChange?.(unique);
  }

  function toggleRowSelection(id: string) {
    updateSelection(
      selectedSet.has(id)
        ? activeSelection.filter((entry) => entry !== id)
        : [...activeSelection, id],
    );
  }

  function selectCurrentPage() {
    updateSelection([...activeSelection, ...allPageIds]);
  }

  function clearSelection() {
    updateSelection([]);
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending((value) => !value);
    } else {
      setSortKey(key);
      setAscending(true);
    }
  }

  function updateMobileSort(value: string) {
    const [nextKey, nextDirection] = value.split(":");
    if (!isSortKey(nextKey)) return;
    setSortKey(nextKey);
    setAscending(nextDirection !== "desc");
  }

  function rowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  }

  return (
    <div className="ps-inbox">
      {savedViews.length > 0 || onSearchChange ? (
        <SavedViewsToolbar
          views={savedViews}
          activeId={activeSavedViewId ?? savedViews[0]?.id ?? ""}
          onSelect={onSelectSavedView ?? (() => undefined)}
          searchLabel="Arbeitsliste durchsuchen"
          {...(searchValue !== undefined ? { searchValue } : {})}
          {...(onSearchChange ? { onSearchChange } : {})}
        />
      ) : null}

      <QuickFilterChips
        title="Schnellfilter"
        description="Filtern Sie die Arbeitsliste über mehrere Status gleichzeitig."
        filters={filters.map((filter) => {
          const allActive = activeFilters.length === 0;
          const active = allActive || activeFilters.includes(filter.value);
          const option: QuickFilterOption = {
            id: filter.value,
            label: filter.label,
            count: filter.count,
            active,
            tone: filterTone(filter.value),
          };
          return option;
        })}
        onToggleFilter={(filter) => onToggleFilter(filter.id)}
      />

      <label className="ps-inbox__mobile-sort">
        <span>Sortieren</span>
        <select
          value={`${sortKey}:${ascending ? "asc" : "desc"}`}
          onChange={(event) => updateMobileSort(event.target.value)}
        >
          <option value="dueAt:asc">Frist aufsteigend</option>
          <option value="dueAt:desc">Frist absteigend</option>
          <option value="id:asc">Vorgang-ID aufsteigend</option>
          <option value="id:desc">Vorgang-ID absteigend</option>
          <option value="applicant:asc">Antragsteller:in A-Z</option>
          <option value="applicant:desc">Antragsteller:in Z-A</option>
          <option value="status:asc">Status aufsteigend</option>
          <option value="status:desc">Status absteigend</option>
        </select>
      </label>

      <div className="ps-inbox__cards" aria-label="Vorgänge">
        {pageRows.length === 0 ? (
          <p className="ps-inbox__mobile-empty" role="status">
            Keine Vorgänge für die aktuelle Auswahl.
          </p>
        ) : (
          pageRows.map((row) => {
            const selected = row.id === selectedId;
            return selectionEnabled ? (
              <article
                key={row.id}
                className={
                  selected
                    ? "ps-inbox__mobile-card ps-inbox__mobile-card--selected"
                    : "ps-inbox__mobile-card"
                }
                aria-label={`Vorgang ${row.id}, ${row.applicant}`}
              >
                <span className="ps-inbox__mobile-card-head">
                  <label className="ps-inbox__select">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(row.id)}
                      onChange={() => toggleRowSelection(row.id)}
                    />
                    <span>Auswählen</span>
                  </label>
                  <CaseStatus
                    label={statusLabel[row.status]}
                    tone={statusTone[row.status]}
                  />
                </span>
                <span className="ps-inbox__mobile-card-title">
                  {row.applicant}
                </span>
                <span className="ps-inbox__mobile-card-subject">
                  {row.subject}
                </span>
                <span className="ps-inbox__mobile-card-meta ps-num">
                  <DeadlineIndicator
                    label="Frist"
                    dueAt={row.dueAt}
                    overdue={Boolean(row.overdue)}
                  />
                </span>
                <button
                  type="button"
                  className="ps-btn ps-btn--ghost"
                  aria-label={`Vorgang ${row.id} öffnen`}
                  onClick={() => onSelect(row.id)}
                >
                  Vorgang öffnen
                </button>
              </article>
            ) : (
              <button
                key={row.id}
                type="button"
                className={
                  selected
                    ? "ps-inbox__mobile-card ps-inbox__mobile-card--selected"
                    : "ps-inbox__mobile-card"
                }
                aria-pressed={selected}
                aria-label={`Vorgang ${row.id}, ${row.applicant}, ${statusLabel[row.status]}, Frist ${row.dueAt}`}
                onClick={() => onSelect(row.id)}
              >
                <span className="ps-inbox__mobile-card-head">
                  <span className="ps-num">{row.id}</span>
                  <CaseStatus
                    label={statusLabel[row.status]}
                    tone={statusTone[row.status]}
                  />
                </span>
                <span className="ps-inbox__mobile-card-title">
                  {row.applicant}
                </span>
                <span className="ps-inbox__mobile-card-subject">
                  {row.subject}
                </span>
                <span className="ps-inbox__mobile-card-meta ps-num">
                  <DeadlineIndicator
                    label="Frist"
                    dueAt={row.dueAt}
                    overdue={Boolean(row.overdue)}
                  />
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="ps-inbox__scroll ps-inbox__responsive-table">
        <table
          className={
            selectionEnabled
              ? "ps-inbox__table ps-inbox__table--selectable"
              : "ps-inbox__table"
          }
        >
          <caption className="ps-visually-hidden">
            Posteingang der Sachbearbeitung
          </caption>
          <thead className="ps-inbox__head">
            <tr>
              {selectionEnabled ? (
                <th scope="col" className="ps-inbox__col ps-inbox__col--select">
                  <label className="ps-inbox__select ps-inbox__select--head">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      aria-label="Alle sichtbaren Vorgänge auswählen"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      onChange={() =>
                        allPageSelected ? clearSelection() : selectCurrentPage()
                      }
                    />
                    <span>Auswahl</span>
                  </label>
                </th>
              ) : null}
              <th
                scope="col"
                className="ps-inbox__col ps-inbox__col--lead ps-inbox__col--lead-1"
                aria-sort={ariaSort(sortKey, ascending, "id")}
              >
                <SortButton
                  label="Vorgang-ID"
                  active={sortKey === "id"}
                  ascending={ascending}
                  onClick={() => toggleSort("id")}
                />
              </th>
              <th
                scope="col"
                className="ps-inbox__col ps-inbox__col--lead ps-inbox__col--lead-2"
                aria-sort={ariaSort(sortKey, ascending, "applicant")}
              >
                <SortButton
                  label="Antragsteller:in"
                  active={sortKey === "applicant"}
                  ascending={ascending}
                  onClick={() => toggleSort("applicant")}
                />
              </th>
              <th
                scope="col"
                className="ps-inbox__col"
                aria-sort={ariaSort(sortKey, ascending, "subject")}
              >
                <SortButton
                  label="Betreff"
                  active={sortKey === "subject"}
                  ascending={ascending}
                  onClick={() => toggleSort("subject")}
                />
              </th>
              <th
                scope="col"
                className="ps-inbox__col"
                aria-sort={ariaSort(sortKey, ascending, "status")}
              >
                <SortButton
                  label="Status"
                  active={sortKey === "status"}
                  ascending={ascending}
                  onClick={() => toggleSort("status")}
                />
              </th>
              <th
                scope="col"
                className="ps-inbox__col ps-inbox__col--num"
                aria-sort={ariaSort(sortKey, ascending, "dueAt")}
              >
                <SortButton
                  label="Frist"
                  active={sortKey === "dueAt"}
                  ascending={ascending}
                  onClick={() => toggleSort("dueAt")}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr className="ps-inbox__empty-row">
                <td
                  colSpan={selectionEnabled ? 6 : 5}
                  className="ps-inbox__empty"
                >
                  Keine Vorgänge für die aktuelle Auswahl.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => {
                const selected = row.id === selectedId;
                return (
                  <tr
                    key={row.id}
                    className={
                      selected
                        ? "ps-inbox__row ps-inbox__row--selected"
                        : "ps-inbox__row"
                    }
                    tabIndex={0}
                    aria-selected={selected}
                    aria-label={`Vorgang ${row.id}, ${row.applicant}, ${statusLabel[row.status]}, Frist ${row.dueAt}`}
                    onClick={() => onSelect(row.id)}
                    onKeyDown={(event) => rowKeyDown(event, row.id)}
                  >
                    {selectionEnabled ? (
                      <td className="ps-inbox__cell ps-inbox__col--select">
                        <label className="ps-inbox__select">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(row.id)}
                            aria-label={`Vorgang ${row.id} auswählen`}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            onChange={() => toggleRowSelection(row.id)}
                          />
                          <span className="ps-visually-hidden">
                            Vorgang {row.id} auswählen
                          </span>
                        </label>
                      </td>
                    ) : null}
                    <td className="ps-inbox__cell ps-inbox__col--lead ps-inbox__col--lead-1 ps-num">
                      {row.id}
                    </td>
                    <td className="ps-inbox__cell ps-inbox__col--lead ps-inbox__col--lead-2">
                      {row.applicant}
                    </td>
                    <td className="ps-inbox__cell">{row.subject}</td>
                    <td className="ps-inbox__cell">
                      <CaseStatus
                        label={statusLabel[row.status]}
                        tone={statusTone[row.status]}
                      />
                    </td>
                    <td className="ps-inbox__cell ps-inbox__col--num ps-num">
                      <DeadlineIndicator
                        label="Frist"
                        dueAt={row.dueAt}
                        overdue={Boolean(row.overdue)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showPagination ? (
        <PaginationControls
          page={safePageIndex}
          pageCount={pageCount}
          pageSize={effectivePageSize}
          pageSizeOptions={availablePageSizeOptions}
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
        <BulkActionBar
          selectedCount={activeSelection.length}
          totalCount={visible.length}
          title="Auswahl"
          description="Aktionen gelten für ausgewählte Vorgänge in der aktuellen Trefferliste."
          detailLabel={`${selectedOnPage} auf dieser Seite ausgewählt.`}
          selectAllAction={{
            id: "select-page",
            label: "Aktuelle Seite auswählen",
            onClick: selectCurrentPage,
            disabled: allPageSelected || allPageIds.length === 0,
          }}
          clearSelectionAction={{
            id: "clear-selection",
            label: "Auswahl leeren",
            onClick: clearSelection,
          }}
          actions={bulkActions}
        />
      ) : null}
    </div>
  );
}

export interface SortButtonProps {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
}

function normalisePageSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 10;
}

function normalisePageSizes(values: number[]): number[] {
  return Array.from(new Set(values.map(normalisePageSize))).sort(
    (a, b) => a - b,
  );
}

function matchesSearch(row: CaseRow, query: string) {
  return [
    row.id,
    row.applicant,
    row.subject,
    statusLabel[row.status],
    row.dueAt,
  ].some((value) => value.toLocaleLowerCase("de").includes(query));
}

function sameStringArray(a: string[], b: string[]) {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

function filterTone(value: string): NonNullable<QuickFilterOption["tone"]> {
  if (/entschieden|bereit|erledigt|done|ok/i.test(value)) {
    return "success";
  }
  if (/offen|frist|due|warn/i.test(value)) {
    return "warning";
  }
  if (/block|kritisch|overdue|risk/i.test(value)) {
    return "critical";
  }
  return "neutral";
}

function PaginationControls({
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
}) {
  return (
    <nav className="ps-inbox__pagination" aria-label="Seitennavigation">
      <p className="ps-inbox__page-status" role="status" aria-live="polite">
        {status} · Seite <span className="ps-num">{page + 1}</span> von{" "}
        <span className="ps-num">{pageCount}</span>
      </p>
      <label className="ps-inbox__page-size">
        <span>Einträge pro Seite</span>
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <div className="ps-inbox__page-actions">
        <button
          type="button"
          className="ps-btn ps-btn--ghost"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          Zurück
        </button>
        <button
          type="button"
          className="ps-btn ps-btn--ghost"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, page + 1))}
        >
          Weiter
        </button>
      </div>
    </nav>
  );
}

/** Spalten-Sortierschalter im Tabellenkopf (Klick wechselt Spalte bzw. Richtung). */
export function SortButton({
  label,
  active,
  ascending,
  onClick,
}: SortButtonProps) {
  const marker = active ? (ascending ? "▲" : "▼") : "↕";
  return (
    <button type="button" className="ps-inbox__sort" onClick={onClick}>
      <span>{label}</span>
      <span className="ps-inbox__sort-marker" aria-hidden="true">
        {marker}
      </span>
    </button>
  );
}

export interface CaseDetailPanelProps {
  row?: CaseRow | undefined;
  /** Slot für Sachbearbeitungs-Aktionen (z.B. Entscheiden, Nachfordern). */
  children?: ReactNode;
}

/**
 * Detail-Panel zum ausgewählten Vorgang: Breadcrumb-Zurück, Metadaten (ID/Antragsteller:in/Status/Frist)
 * und ein Slot für Aktionen. Zeigt einen Leerzustand, solange kein Vorgang gewählt ist.
 */
export function CaseDetailPanel({ row, children }: CaseDetailPanelProps) {
  if (!row) {
    return (
      <section
        className="ps-case-detail ps-case-detail--empty"
        aria-label="Vorgangsdetails"
      >
        <p className="ps-muted">Wählen Sie einen Vorgang.</p>
      </section>
    );
  }

  return (
    <section className="ps-case-detail" aria-label="Vorgangsdetails">
      <nav className="ps-case-detail__breadcrumb" aria-label="Navigation">
        <span aria-hidden="true">‹</span> Zurück zum Posteingang
      </nav>
      <header className="ps-case-detail__header">
        <p className="ps-eyebrow">Vorgang</p>
        <h2 className="ps-num">{row.id}</h2>
        <p className="ps-muted">{row.subject}</p>
      </header>
      <dl className="ps-case-detail__meta">
        <div>
          <dt>Antragsteller:in</dt>
          <dd>{row.applicant}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <CaseStatus
              label={statusLabel[row.status]}
              tone={statusTone[row.status]}
            />
          </dd>
        </div>
        <div>
          <dt>Frist</dt>
          <dd className="ps-num">
            <DeadlineIndicator
              label="Frist"
              dueAt={row.dueAt}
              overdue={Boolean(row.overdue)}
            />
          </dd>
        </div>
      </dl>
      {children ? (
        <div className="ps-case-detail__actions">{children}</div>
      ) : null}
    </section>
  );
}

function compareRows(a: CaseRow, b: CaseRow, key: SortKey): number {
  if (key === "status") {
    return statusOrder[a.status] - statusOrder[b.status];
  }
  return a[key].localeCompare(b[key], "de");
}

function isSortKey(value: string | undefined): value is SortKey {
  return (
    value === "id" ||
    value === "applicant" ||
    value === "subject" ||
    value === "status" ||
    value === "dueAt"
  );
}

function ariaSort(
  sortKey: SortKey,
  ascending: boolean,
  column: SortKey,
): "ascending" | "descending" | "none" {
  if (sortKey !== column) {
    return "none";
  }
  return ascending ? "ascending" : "descending";
}
