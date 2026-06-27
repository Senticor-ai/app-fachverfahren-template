// fachverfahren-kit/ui/data-table — GENERISCHE, erweiterte Daten-Tabelle (Intelligence/Admin).
//
// Aufgesetzt auf @tanstack/react-table (MIT, headless) + die kanonischen Kit-Primitive (../ui/table.js).
// Kann alles: spaltenweise Sortierung, Spalten-Filter, Spalten-Sichtbarkeit, Client-Pagination und optionale
// Zeilen-Auswahl. VOLLSTÄNDIG GENERISCH: alles kommt über `columns` + `data` als Props — keine Domänen-Literale.
//
// Barrierefreiheit (BITV/WCAG 2.2 AA) — bewusst und prüfbar:
//   • <caption> (per `caption`/`captionVisible`; standardmäßig sr-only, aber IMMER vorhanden) beschreibt die Tabelle.
//   • aria-sort am sortierbaren Header (none/ascending/descending) + Sortier-Toggle als echter <button> (Tastatur).
//   • Live-Region (aria-live="polite") meldet "N Einträge" nach Filter/Pagination/Sortierung — nicht nur visuell.
//   • Auswahl-Spalten sind echte Checkboxen MIT zugeordnetem Label (sr-only) — kein Farb-only-Signal.
//   • Fokus sichtbar (focus-visible:ring-2 ring-ring ring-offset-2), Zielgröße der Bedien-Elemente ≥ 24px.
//   • Motion nur transition-colors + motion-reduce:transition-none — kein bounce/glow/scale.
"use client";

import * as React from "react";
import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { cn } from "../lib/utils.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import { Input } from "../ui/input.js";
import { Label } from "../ui/label.js";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover.js";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table.js";

// ── Deutsche Standard-Texte (überschreibbar via `labels`) — generisch, keine Domänen-Literale ────
export interface DataTableLabels {
  /** sr-only Beschriftung des Sichtbarkeits-Triggers. */
  columnsTrigger: string;
  /** Überschrift im Sichtbarkeits-Popover. */
  columnsHeading: string;
  /** Platzhalter im globalen Suchfeld. */
  searchPlaceholder: string;
  /** Text bei leerer Ergebnismenge. */
  empty: string;
  /** sr-only Label der „alle auswählen"-Checkbox (Kopf). */
  selectAll: string;
  /** sr-only Label je Zeilen-Auswahl-Checkbox. */
  selectRow: string;
  /** Aufbau der Live/Status-Meldung: (sichtbar, gesamt) → Text. */
  countStatus: (shown: number, total: number) => string;
  /** Auswahl-Status: (ausgewählt, gesamt) → Text. */
  selectionStatus: (selected: number, total: number) => string;
  /** Seiten-Anzeige: (aktuell, gesamt) → Text. */
  pageStatus: (page: number, pages: number) => string;
  /** Aufschlüsselung „Einträge pro Seite". */
  rowsPerPage: string;
  firstPage: string;
  prevPage: string;
  nextPage: string;
  lastPage: string;
}

const DEFAULT_LABELS: DataTableLabels = {
  columnsTrigger: "Spalten ein- oder ausblenden",
  columnsHeading: "Sichtbare Spalten",
  searchPlaceholder: "Tabelle durchsuchen…",
  empty: "Keine Einträge gefunden.",
  selectAll: "Alle Zeilen auswählen",
  selectRow: "Zeile auswählen",
  countStatus: (shown, total) =>
    shown === total ? `${total} Einträge` : `${shown} von ${total} Einträgen`,
  selectionStatus: (selected, total) => `${selected} von ${total} ausgewählt`,
  pageStatus: (page, pages) => `Seite ${page} von ${pages}`,
  rowsPerPage: "Einträge pro Seite",
  firstPage: "Erste Seite",
  prevPage: "Vorherige Seite",
  nextPage: "Nächste Seite",
  lastPage: "Letzte Seite",
};

// ── Props ────────────────────────────────────────────────────────────────────────────────────
export interface DataTableProps<TData, TValue> {
  /** Spalten-Definition (TanStack ColumnDef). Generisch — der Aufrufer beschreibt seine Daten. */
  columns: ColumnDef<TData, TValue>[];
  /** Datenzeilen. */
  data: TData[];
  /**
   * Pflicht-Beschriftung der Tabelle (<caption>) für Screenreader. Standardmäßig sr-only sichtbar,
   * aber im DOM IMMER vorhanden (BITV: jede Datentabelle braucht eine Beschriftung).
   */
  caption: string;
  /** caption sichtbar rendern statt sr-only (Standard: sr-only). */
  captionVisible?: boolean;
  /** Globale Suche über alle Spalten ein-/ausblenden (Standard: an). */
  enableGlobalFilter?: boolean;
  /** Spalten-Sichtbarkeits-Umschalter ein-/ausblenden (Standard: an). */
  enableColumnVisibility?: boolean;
  /** Optionale Zeilen-Auswahl-Spalte (Checkboxen) voranstellen (Standard: aus). */
  enableRowSelection?: boolean;
  /** Client-Pagination aktiv (Standard: an). */
  enablePagination?: boolean;
  /** Einträge je Seite (Standard: 10). */
  pageSize?: number;
  /** Auswahlbare Seitengrößen für das Pagination-Steuerelement. */
  pageSizeOptions?: number[];
  /** Callback, wenn sich die Zeilen-Auswahl ändert (liefert die gewählten Original-Datenzeilen). */
  onRowSelectionChange?: (rows: TData[]) => void;
  /** Texte überschreiben (z. B. andere Sprache / Begriffe). Teilmenge genügt. */
  labels?: Partial<DataTableLabels>;
  /** Zusätzliche Klassen für die äußere Hülle. */
  className?: string;
}

/**
 * GENERISCHE erweiterte Daten-Tabelle. Steuert State (Sortierung, Filter, Sichtbarkeit, Auswahl, Pagination)
 * intern über TanStack Table und rendert über die Kit-Primitive. Der Aufrufer liefert nur `columns` + `data`.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  caption,
  captionVisible = false,
  enableGlobalFilter = true,
  enableColumnVisibility = true,
  enableRowSelection = false,
  enablePagination = true,
  pageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  onRowSelectionChange,
  labels: labelOverrides,
  className,
}: DataTableProps<TData, TValue>): React.ReactElement {
  const labels = React.useMemo<DataTableLabels>(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides],
  );

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = React.useState("");

  // Auswahl-Spalte deterministisch voranstellen, wenn aktiviert — als echte, beschriftete Checkbox-Spalte.
  const resolvedColumns = React.useMemo<ColumnDef<TData, TValue>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectColumn: ColumnDef<TData, TValue> = {
      id: SELECT_COLUMN_ID,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <HeaderSelectCheckbox table={table} label={labels.selectAll} />
      ),
      cell: ({ row }) => <RowSelectCheckbox row={row} label={labels.selectRow} />,
    };
    return [selectColumn, ...columns];
  }, [columns, enableRowSelection, labels.selectAll, labels.selectRow]);

  const table = useReactTable<TData>({
    data,
    columns: resolvedColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection, globalFilter },
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    ...(enablePagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: { pagination: { pageSize } },
  });

  // Auswahl nach außen spiegeln — die ORIGINALEN Datenzeilen, nicht die internen Row-Objekte.
  const selectedOriginals = table.getSelectedRowModel().rows.map((r) => r.original);
  const selectedKey = JSON.stringify(rowSelection);
  React.useEffect(() => {
    if (!enableRowSelection || !onRowSelectionChange) return;
    onRowSelectionChange(selectedOriginals);
    // selectedKey kapselt die Auswahl stabil; selectedOriginals/onRowSelectionChange absichtlich nicht in deps,
    // um Endlosschleifen bei inline-Callbacks/neuen Array-Referenzen zu vermeiden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, enableRowSelection]);

  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalCount = data.length;
  const selectedCount = table.getSelectedRowModel().rows.length;
  const pageCount = Math.max(1, table.getPageCount());
  const pageIndex = table.getState().pagination.pageIndex;
  const visibleColumns = table.getVisibleLeafColumns().length;

  // Eine zusammenhängende Live-Meldung — wird nach Filter/Sortierung/Pagination/Auswahl aktualisiert.
  const liveStatus = [
    labels.countStatus(filteredCount, totalCount),
    enableRowSelection ? labels.selectionStatus(selectedCount, totalCount) : null,
    enablePagination ? labels.pageStatus(pageIndex + 1, pageCount) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cn("flex w-full flex-col gap-4", className)}>
      {/* Werkzeugleiste: globale Suche + Spalten-Sichtbarkeit */}
      {(enableGlobalFilter || enableColumnVisibility) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {enableGlobalFilter ? (
            <GlobalSearch
              value={globalFilter}
              onChange={setGlobalFilter}
              placeholder={labels.searchPlaceholder}
            />
          ) : (
            <span />
          )}
          {enableColumnVisibility && (
            <ColumnVisibilityMenu table={table} labels={labels} />
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          {/* Pflicht-Beschriftung: immer vorhanden, standardmäßig nur für Screenreader. */}
          <TableCaption
            className={cn(
              "text-left text-muted-foreground",
              captionVisible ? "mt-0 border-b border-border px-3 py-2 caption-top" : "sr-only",
            )}
          >
            {caption}
          </TableCaption>

          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const ariaSort: React.AriaAttributes["aria-sort"] = !canSort
                    ? undefined
                    : sortDir === "asc"
                      ? "ascending"
                      : sortDir === "desc"
                        ? "descending"
                        : "none";
                  return (
                    <TableHead
                      key={header.id}
                      {...(ariaSort ? { "aria-sort": ariaSort } : {})}
                      scope="col"
                      className="whitespace-nowrap"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <SortToggle column={header.column}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </SortToggle>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={visibleColumns}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {labels.empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Status-/Live-Region: meldet jede Mengen-/Seiten-/Auswahl-Änderung an Screenreader. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          aria-atomic="true"
          className="text-sm text-muted-foreground"
        >
          {liveStatus}
        </p>

        {enablePagination && (
          <Pagination
            table={table}
            labels={labels}
            pageSizeOptions={pageSizeOptions}
            page={pageIndex + 1}
            pages={pageCount}
          />
        )}
      </div>
    </div>
  );
}
DataTable.displayName = "DataTable";

const SELECT_COLUMN_ID = "__select__";

// ── Globale Suche ──────────────────────────────────────────────────────────────────────────────
function GlobalSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}): React.ReactElement {
  const id = React.useId();
  return (
    <div className="relative w-full sm:max-w-xs">
      <Label htmlFor={id} className="sr-only">
        {placeholder}
      </Label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </div>
  );
}

// ── Sortier-Toggle am Header (echter Button, Tastatur, aria-Status über aria-sort am <th>) ───────
function SortToggle<TData, TValue>({
  column,
  children,
}: {
  column: Column<TData, TValue>;
  children: React.ReactNode;
}): React.ReactElement {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn(
        "-ml-2 inline-flex h-8 min-h-6 items-center gap-1.5 rounded-md px-2 text-left font-semibold text-foreground",
        "transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      <span className="truncate">{children}</span>
      <Icon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          sorted ? "text-foreground" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

// ── Spalten-Sichtbarkeit (Popover mit Checkbox je Spalte) ────────────────────────────────────────
function ColumnVisibilityMenu<TData>({
  table,
  labels,
}: {
  table: TanstackTable<TData>;
  labels: DataTableLabels;
}): React.ReactElement {
  const hideableColumns = table
    .getAllLeafColumns()
    .filter((c) => c.getCanHide() && c.id !== SELECT_COLUMN_ID);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={labels.columnsTrigger}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{labels.columnsHeading}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.columnsHeading}
        </p>
        <ul className="flex flex-col">
          {hideableColumns.map((column) => (
            <ColumnVisibilityItem key={column.id} column={column} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ColumnVisibilityItem<TData, TValue>({
  column,
}: {
  column: Column<TData, TValue>;
}): React.ReactElement {
  const id = React.useId();
  return (
    <li>
      <label
        htmlFor={id}
        className={cn(
          "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground",
          "transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Checkbox
          id={id}
          checked={column.getIsVisible()}
          onCheckedChange={(checked) => column.toggleVisibility(checked === true)}
          className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <span className="truncate">{columnLabel(column)}</span>
      </label>
    </li>
  );
}

/** Lesbares Spalten-Label: bevorzugt `meta.label`, dann String-Header, sonst die id. Generisch. */
function columnLabel<TData, TValue>(column: Column<TData, TValue>): string {
  const meta = column.columnDef.meta as { label?: unknown } | undefined;
  if (meta && typeof meta.label === "string" && meta.label.length > 0) return meta.label;
  const header = column.columnDef.header;
  if (typeof header === "string" && header.length > 0) return header;
  return column.id;
}

// ── Auswahl-Checkboxen (Kopf = alle, Zeile = einzeln) — IMMER mit zugeordnetem (sr-only) Label ────
function HeaderSelectCheckbox<TData>({
  table,
  label,
}: {
  table: TanstackTable<TData>;
  label: string;
}): React.ReactElement {
  const id = React.useId();
  const allSelected = table.getIsAllPageRowsSelected();
  const someSelected = table.getIsSomePageRowsSelected();
  return (
    <span className="inline-flex items-center">
      <Checkbox
        id={id}
        checked={allSelected ? true : someSelected ? "indeterminate" : false}
        onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked === true)}
        aria-label={label}
        className={cn(
          // ≥24px Zielgröße (WCAG 2.2 SC 2.5.8): unsichtbares 24px-Trefferfeld um die 16px-Box, ohne Layout-Versatz.
          "relative before:absolute before:left-1/2 before:top-1/2 before:size-6 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      />
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
    </span>
  );
}

function RowSelectCheckbox<TData>({
  row,
  label,
}: {
  row: Row<TData>;
  label: string;
}): React.ReactElement {
  const id = React.useId();
  return (
    <span className="inline-flex items-center">
      <Checkbox
        id={id}
        checked={row.getIsSelected()}
        disabled={!row.getCanSelect()}
        onCheckedChange={(checked) => row.toggleSelected(checked === true)}
        aria-label={label}
        className={cn(
          // ≥24px Zielgröße (WCAG 2.2 SC 2.5.8): unsichtbares 24px-Trefferfeld um die 16px-Box, ohne Layout-Versatz.
          "relative before:absolute before:left-1/2 before:top-1/2 before:size-6 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      />
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
    </span>
  );
}

// ── Client-Pagination ────────────────────────────────────────────────────────────────────────────
function Pagination<TData>({
  table,
  labels,
  pageSizeOptions,
  page,
  pages,
}: {
  table: TanstackTable<TData>;
  labels: DataTableLabels;
  pageSizeOptions: number[];
  page: number;
  pages: number;
}): React.ReactElement {
  const selectId = React.useId();
  const currentSize = table.getState().pagination.pageSize;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={selectId} className="text-sm font-medium text-muted-foreground">
          {labels.rowsPerPage}
        </Label>
        <select
          id={selectId}
          value={currentSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          className={cn(
            "h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground",
            "transition-colors duration-150 ease-out motion-reduce:transition-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          {pageSizeOptions.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <span className="text-sm font-medium text-muted-foreground">
        {labels.pageStatus(page, pages)}
      </span>

      <div className="flex items-center gap-1">
        <PageButton
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          label={labels.firstPage}
        >
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </PageButton>
        <PageButton
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          label={labels.prevPage}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </PageButton>
        <PageButton
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          label={labels.nextPage}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PageButton>
        <PageButton
          onClick={() => table.setPageIndex(pages - 1)}
          disabled={!table.getCanNextPage()}
          label={labels.lastPage}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-8 w-8 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {children}
    </Button>
  );
}

export type { ColumnDef as DataTableColumnDef };
