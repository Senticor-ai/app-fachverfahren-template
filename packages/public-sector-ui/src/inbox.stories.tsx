import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import {
  CaseDetailPanel,
  CaseInbox,
  type CaseRow,
  type InboxFilter,
} from "./inbox.js";

const meta = {
  title: "Public Sector UI/Inbox",
  parameters: {
    docs: {
      description: {
        component:
          "Sachbearbeitungs-Posteingang (Master-Detail): dichte, tastatureffiziente Tabelle mit sticky Header, zwei eingefrorenen Leitspalten, mobilem Karten-Reflow, Sortierkontrolle, mehrfach wählbaren Schnellfilter-Chips und einem Detail-Panel mit Aktions-Slot. Setzt den fachverfahren-ux-contract um.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Deterministische synthetische Daten (kein Date.now()/random) — genug Zeilen für Sortieren,
// Filtern, Tastaturpfad und horizontale Enge.
const CASES: CaseRow[] = [
  {
    id: "WGZ-2024-001",
    applicant: "Erika Mustermann",
    subject: "Wohngeldantrag · Erstbewilligung",
    status: "offen",
    dueAt: "2026-07-01",
  },
  {
    id: "WGZ-2024-002",
    applicant: "Hans Beispiel",
    subject: "Wohngeldantrag · Weiterbewilligung",
    status: "in-pruefung",
    dueAt: "2026-06-20",
    overdue: true,
  },
  {
    id: "WGZ-2024-003",
    applicant: "Aylin Demir",
    subject: "Anhörung · Einkommensnachweis",
    status: "offen",
    dueAt: "2026-07-10",
  },
  {
    id: "WGZ-2024-004",
    applicant: "Bogdan Novak",
    subject: "Widerspruch · Bescheid vom 12.05.",
    status: "entschieden",
    dueAt: "2026-06-30",
  },
  {
    id: "WGZ-2024-005",
    applicant: "Chiara Lombardi",
    subject: "Nachforderung · Kontoauszüge",
    status: "in-pruefung",
    dueAt: "2026-07-04",
  },
];

const FILTERS: InboxFilter[] = [
  { label: "Offen", value: "offen", count: 2 },
  { label: "In Prüfung", value: "in-pruefung", count: 2 },
  { label: "Entschieden", value: "entschieden", count: 1 },
];

export const Posteingang: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · gefüllt</h1>
        <CaseInbox
          cases={CASES}
          selectedId="WGZ-2024-002"
          onSelect={() => undefined}
          filters={FILTERS}
          activeFilters={["offen", "in-pruefung"]}
          onToggleFilter={() => undefined}
        />
      </section>
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · leer</h1>
        <CaseInbox
          cases={[]}
          onSelect={() => undefined}
          filters={FILTERS}
          activeFilters={[]}
          onToggleFilter={() => undefined}
        />
      </section>
      <section className="sb-card">
        <h1>Detail · Leerzustand</h1>
        <CaseDetailPanel />
      </section>
    </main>
  ),
};

export const MitDetail: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Master-Detail · ausgewählter Vorgang</h1>
        <div className="sb-master-detail">
          <CaseInbox
            cases={CASES}
            selectedId="WGZ-2024-004"
            onSelect={() => undefined}
            filters={FILTERS}
            activeFilters={["offen", "in-pruefung", "entschieden"]}
            onToggleFilter={() => undefined}
          />
          <CaseDetailPanel row={CASES[3]}>
            <button type="button" className="ps-btn ps-btn--primary">
              Entscheiden
            </button>
            <button type="button" className="ps-btn ps-btn--ghost">
              Nachfordern
            </button>
          </CaseDetailPanel>
        </div>
      </section>
    </main>
  ),
};

function InboxWorkbenchDemo() {
  const [selectedId, setSelectedId] = useState<string | undefined>(
    "WGZ-2024-001",
  );
  const [activeFilters, setActiveFilters] = useState<string[]>([
    "offen",
    "in-pruefung",
  ]);

  function toggleFilter(value: string) {
    setActiveFilters((current) => {
      if (current.includes(value)) {
        // Letzten aktiven Filter nicht abwählen.
        if (current.length === 1) {
          return current;
        }
        return current.filter((entry) => entry !== value);
      }
      return [...current, value];
    });
  }

  const visible = useMemo(
    () =>
      activeFilters.length === 0
        ? CASES
        : CASES.filter((row) => activeFilters.includes(row.status)),
    [activeFilters],
  );

  const selected = useMemo(
    () => CASES.find((row) => row.id === selectedId),
    [selectedId],
  );

  const selectedVisible = visible.some((row) => row.id === selectedId);

  return (
    <div className="sb-master-detail">
      <CaseInbox
        cases={CASES}
        selectedId={selectedVisible ? selectedId : undefined}
        onSelect={setSelectedId}
        filters={FILTERS}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
      />
      <CaseDetailPanel row={selectedVisible ? selected : undefined}>
        <button type="button" className="ps-btn ps-btn--primary">
          Entscheiden
        </button>
        <button type="button" className="ps-btn ps-btn--ghost">
          Nachfordern
        </button>
      </CaseDetailPanel>
    </div>
  );
}

export const Arbeitsplatz: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · interaktive Auswahl &amp; Filter</h1>
        <InboxWorkbenchDemo />
      </section>
    </main>
  ),
};
