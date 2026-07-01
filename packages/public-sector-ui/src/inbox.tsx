import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";
import { CaseStatus, DeadlineIndicator } from "./components.js";

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
}: CaseInboxProps) {
  const [sortKey, setSortKey] = useState<SortKey>("dueAt");
  const [ascending, setAscending] = useState(true);

  const visible = useMemo(() => {
    const filtered =
      activeFilters.length === 0
        ? cases
        : cases.filter((row) => activeFilters.includes(row.status));
    const direction = ascending ? 1 : -1;
    return [...filtered].sort((a, b) => direction * compareRows(a, b, sortKey));
  }, [cases, activeFilters, sortKey, ascending]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setAscending((value) => !value);
    } else {
      setSortKey(key);
      setAscending(true);
    }
  }

  function rowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  }

  return (
    <div className="ps-inbox">
      <div
        className="ps-inbox__filters"
        role="group"
        aria-label="Schnellfilter"
      >
        {filters.map((filter) => {
          const active = activeFilters.includes(filter.value);
          const locked = active && activeFilters.length === 1;
          return (
            <button
              key={filter.value}
              type="button"
              className={
                active
                  ? "ps-inbox__chip ps-inbox__chip--active"
                  : "ps-inbox__chip"
              }
              aria-pressed={active}
              disabled={locked}
              onClick={() => onToggleFilter(filter.value)}
            >
              <span>{filter.label}</span>
              <span className="ps-inbox__chip-count ps-num">
                {filter.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ps-inbox__scroll">
        <table className="ps-inbox__table">
          <caption className="ps-visually-hidden">
            Posteingang der Sachbearbeitung
          </caption>
          <thead className="ps-inbox__head">
            <tr>
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
            {visible.length === 0 ? (
              <tr className="ps-inbox__empty-row">
                <td colSpan={5} className="ps-inbox__empty">
                  Keine Vorgänge für die aktuelle Auswahl.
                </td>
              </tr>
            ) : (
              visible.map((row) => {
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
    </div>
  );
}

export interface SortButtonProps {
  label: string;
  active: boolean;
  ascending: boolean;
  onClick: () => void;
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
