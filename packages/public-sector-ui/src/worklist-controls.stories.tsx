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

export const Arbeitsliste: Story = {
  render: () => (
    <main className="sb-page">
      <WorklistControlsDemo />
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
