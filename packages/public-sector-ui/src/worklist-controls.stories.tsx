import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  BulkActionBar,
  QuickFilterChips,
  type QuickFilterOption,
} from "./worklist-controls.js";

const meta = {
  title: "Public Sector UI/Worklist Controls",
  parameters: {
    docs: {
      description: {
        component:
          "Wiederverwendbare Steuerung für Arbeitslisten: mehrfach aktive Schnellfilter mit Zählwerten und Mehrfachaktionen für ausgewählte Einträge.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const FILTERS: QuickFilterOption[] = [
  {
    id: "open",
    label: "Offen",
    count: 18,
    active: true,
    tone: "warning",
  },
  {
    id: "due",
    label: "Fristnah",
    count: 7,
    active: true,
    tone: "critical",
  },
  {
    id: "review",
    label: "Prüfung",
    count: 11,
    active: true,
    tone: "neutral",
  },
  {
    id: "ready",
    label: "Entscheidungsreif",
    count: 5,
    active: true,
    tone: "success",
  },
];

function WorklistControlsDemo() {
  const [filters, setFilters] = useState(FILTERS);
  const [selectedCount, setSelectedCount] = useState(3);
  const [message, setMessage] = useState("Drei Einträge ausgewählt.");

  function toggleFilter(filter: QuickFilterOption) {
    setFilters((current) =>
      current.map((item) =>
        item.id === filter.id ? { ...item, active: !item.active } : item,
      ),
    );
    setMessage(`${filter.label} wurde umgeschaltet.`);
  }

  return (
    <div className="sb-stack">
      <QuickFilterChips filters={filters} onToggleFilter={toggleFilter} />
      <BulkActionBar
        selectedCount={selectedCount}
        totalCount={41}
        detailLabel="Ausgewählte Einträge bleiben in der aktuellen Filtermenge sichtbar."
        footer={
          <p className="ps-muted" role="status">
            {message}
          </p>
        }
        selectAllAction={{
          id: "select-all",
          label: "Alle sichtbaren auswählen",
          onClick: () => {
            setSelectedCount(41);
            setMessage("Alle sichtbaren Einträge ausgewählt.");
          },
        }}
        clearSelectionAction={{
          id: "clear",
          label: "Auswahl leeren",
          onClick: () => {
            setSelectedCount(0);
            setMessage("Auswahl wurde geleert.");
          },
        }}
        actions={[
          {
            id: "assign",
            label: "Zuweisen",
            tone: "primary",
            onClick: () => setMessage("Zuweisung vorbereitet."),
          },
          {
            id: "export",
            label: "Export vormerken",
            onClick: () => setMessage("Export wurde vorgemerkt."),
          },
          {
            id: "defer",
            label: "Zurückstellen",
            tone: "danger",
            onClick: () => setMessage("Zurückstellen vorbereitet."),
          },
        ]}
      />
    </div>
  );
}

function PaginationBulkDemo() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedCount, setSelectedCount] = useState(0);
  const pageCount = Math.ceil(41 / pageSize);
  const first = page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, 41);

  return (
    <div className="sb-stack">
      <QuickFilterChips
        filters={FILTERS}
        onToggleFilter={() => undefined}
        title="Schnellfilter mit Pagination"
      />
      <nav className="ps-inbox__pagination" aria-label="Seitennavigation">
        <p className="ps-inbox__page-status" role="status" aria-live="polite">
          {first}-{last} von 41 · Seite{" "}
          <span className="ps-num">{page + 1}</span> von{" "}
          <span className="ps-num">{pageCount}</span>
        </p>
        <label className="ps-inbox__page-size">
          <span>Einträge pro Seite</span>
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
          >
            {[5, 10, 25].map((option) => (
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
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Zurück
          </button>
          <button
            type="button"
            className="ps-btn ps-btn--ghost"
            disabled={page >= pageCount - 1}
            onClick={() =>
              setPage((current) => Math.min(pageCount - 1, current + 1))
            }
          >
            Weiter
          </button>
        </div>
      </nav>
      <BulkActionBar
        selectedCount={selectedCount}
        totalCount={41}
        detailLabel="Auswahl bezieht sich auf die sichtbare Seite und bleibt im aktuellen Trefferraum."
        selectAllAction={{
          id: "select-page",
          label: "Aktuelle Seite auswählen",
          onClick: () => setSelectedCount(last - first + 1),
          disabled: selectedCount === last - first + 1,
        }}
        clearSelectionAction={{
          id: "clear",
          label: "Auswahl leeren",
          onClick: () => setSelectedCount(0),
        }}
        actions={[
          {
            id: "assign",
            label: "Zuweisen",
            tone: "primary",
            onClick: () => undefined,
          },
        ]}
      />
    </div>
  );
}

export const Arbeitsliste: Story = {
  render: () => (
    <main className="sb-page">
      <WorklistControlsDemo />
    </main>
  ),
};

export const PaginationUndBulk: Story = {
  render: () => (
    <main className="sb-page">
      <PaginationBulkDemo />
    </main>
  ),
};

export const KeineAuswahl: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <QuickFilterChips
          filters={FILTERS.map((filter) => ({
            ...filter,
            active: filter.id === "open",
          }))}
          onToggleFilter={() => undefined}
        />
        <BulkActionBar
          selectedCount={0}
          totalCount={41}
          detailLabel="Aktionen werden aktiv, sobald mindestens ein Eintrag ausgewählt ist."
          actions={[
            {
              id: "assign",
              label: "Zuweisen",
              tone: "primary",
              onClick: () => undefined,
            },
          ]}
        />
      </div>
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <QuickFilterChips filters={[]} onToggleFilter={() => undefined} />
        <BulkActionBar selectedCount={0} />
      </div>
    </main>
  ),
};
