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
          "Sachbearbeitungs-Posteingang (Master-Detail): dichte, tastatureffiziente Tabelle mit sticky Header, zwei eingefrorenen Leitspalten, mobilem Karten-Reflow, Sortierkontrolle, Pagination, Suche, gespeicherten Ansichten, echter Bulk-Auswahl und einem Detail-Panel mit Aktions-Slot. Setzt den fachverfahren-ux-contract um.",
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
  {
    id: "WGZ-2024-006",
    applicant: "Fabio Richter",
    subject: "Unterlagen · Mietvertrag",
    status: "offen",
    dueAt: "2026-07-12",
  },
  {
    id: "WGZ-2024-007",
    applicant: "Fatima Celik",
    subject: "Prüfung · Haushaltsgröße",
    status: "in-pruefung",
    dueAt: "2026-07-08",
  },
  {
    id: "WGZ-2024-008",
    applicant: "Jonas Weber",
    subject: "Bescheid · Abschlussprüfung",
    status: "entschieden",
    dueAt: "2026-07-02",
  },
  {
    id: "WGZ-2024-009",
    applicant: "Maja Schulz",
    subject: "Antrag · Erstprüfung",
    status: "offen",
    dueAt: "2026-07-15",
  },
  {
    id: "WGZ-2024-010",
    applicant: "Noura Haddad",
    subject: "Nachforderung · Einkommensnachweis",
    status: "in-pruefung",
    dueAt: "2026-06-28",
    overdue: true,
  },
  {
    id: "WGZ-2024-011",
    applicant: "Peter Klein",
    subject: "Bescheid · Änderungsmitteilung",
    status: "entschieden",
    dueAt: "2026-07-06",
  },
  {
    id: "WGZ-2024-012",
    applicant: "Sophie Nguyen",
    subject: "Antrag · Plausibilitätsprüfung",
    status: "offen",
    dueAt: "2026-07-09",
  },
];

const FILTERS: InboxFilter[] = [
  { label: "Offen", value: "offen", count: 5 },
  { label: "In Prüfung", value: "in-pruefung", count: 4 },
  { label: "Entschieden", value: "entschieden", count: 3 },
];

const SAVED_VIEWS = [
  { id: "alle", label: "Alle", count: 12 },
  { id: "offen-pruefung", label: "Offen & Prüfung", count: 9 },
  { id: "entschieden", label: "Entschieden", count: 3 },
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

export const Paginierung: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · Pagination</h1>
        <CaseInbox
          cases={CASES}
          selectedId="WGZ-2024-001"
          onSelect={() => undefined}
          filters={FILTERS}
          activeFilters={["offen", "in-pruefung", "entschieden"]}
          onToggleFilter={() => undefined}
          pageSize={4}
          pageSizeOptions={[4, 8, 12]}
        />
      </section>
    </main>
  ),
};

function BulkInboxDemo() {
  const [selectedIds, setSelectedIds] = useState<string[]>([
    "WGZ-2024-001",
    "WGZ-2024-003",
  ]);
  const [message, setMessage] = useState("Zwei Vorgänge ausgewählt.");

  return (
    <div className="sb-stack">
      <CaseInbox
        cases={CASES}
        selectedId="WGZ-2024-001"
        onSelect={() => undefined}
        filters={FILTERS}
        activeFilters={["offen", "in-pruefung", "entschieden"]}
        onToggleFilter={() => undefined}
        pageSize={5}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={[
          {
            id: "assign",
            label: "Zuweisen",
            tone: "primary",
            onClick: () =>
              setMessage(`${selectedIds.length} Vorgänge zuweisen.`),
          },
          {
            id: "export",
            label: "Export vormerken",
            onClick: () =>
              setMessage(`${selectedIds.length} Exporte vorgemerkt.`),
          },
          {
            id: "defer",
            label: "Zurückstellen",
            tone: "danger",
            onClick: () =>
              setMessage(`${selectedIds.length} Vorgänge zurückstellen.`),
          },
        ]}
      />
      <p className="ps-muted" role="status">
        {message}
      </p>
    </div>
  );
}

export const BulkAuswahl: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · Bulk-Auswahl</h1>
        <BulkInboxDemo />
      </section>
    </main>
  ),
};

export const KeineAuswahl: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · Bulk ohne Auswahl</h1>
        <CaseInbox
          cases={CASES}
          onSelect={() => undefined}
          filters={FILTERS}
          activeFilters={["offen", "in-pruefung", "entschieden"]}
          onToggleFilter={() => undefined}
          selectedIds={[]}
          onSelectionChange={() => undefined}
          bulkActions={[
            {
              id: "assign",
              label: "Zuweisen",
              tone: "primary",
              onClick: () => undefined,
            },
          ]}
        />
      </section>
    </main>
  ),
};

export const GefiltertLeer: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · gefiltert leer</h1>
        <CaseInbox
          cases={CASES}
          onSelect={() => undefined}
          filters={[
            ...FILTERS,
            { label: "Nicht zugeordnet", value: "nicht-zugeordnet", count: 0 },
          ]}
          activeFilters={["nicht-zugeordnet"]}
          onToggleFilter={() => undefined}
          pageSize={4}
          searchValue="keine Treffer"
          onSearchChange={() => undefined}
        />
      </section>
    </main>
  ),
};

export const MobileKarten: Story = {
  parameters: {
    viewport: {
      defaultViewport: "mobile1",
    },
  },
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>Posteingang · mobile Karten</h1>
        <CaseInbox
          cases={CASES}
          selectedId="WGZ-2024-002"
          onSelect={() => undefined}
          filters={FILTERS}
          activeFilters={["offen", "in-pruefung", "entschieden"]}
          onToggleFilter={() => undefined}
          pageSize={3}
          selectedIds={["WGZ-2024-002"]}
          onSelectionChange={() => undefined}
          bulkActions={[
            {
              id: "assign",
              label: "Zuweisen",
              tone: "primary",
              onClick: () => undefined,
            },
          ]}
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
  const [activeSavedViewId, setActiveSavedViewId] = useState("offen-pruefung");
  const [searchValue, setSearchValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("Keine Sammelaktion ausgeführt.");

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

  function selectSavedView(id: string) {
    setActiveSavedViewId(id);
    setSearchValue("");
    if (id === "offen-pruefung") {
      setActiveFilters(["offen", "in-pruefung"]);
      return;
    }
    if (id === "entschieden") {
      setActiveFilters(["entschieden"]);
      return;
    }
    setActiveFilters(["offen", "in-pruefung", "entschieden"]);
  }

  const visible = useMemo(() => {
    const filtered =
      activeFilters.length === 0
        ? CASES
        : CASES.filter((row) => activeFilters.includes(row.status));
    const query = searchValue.trim().toLocaleLowerCase("de");
    if (!query) return filtered;
    return filtered.filter((row) =>
      [row.id, row.applicant, row.subject, row.status].some((value) =>
        value.toLocaleLowerCase("de").includes(query),
      ),
    );
  }, [activeFilters, searchValue]);

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
        pageSize={4}
        pageSizeOptions={[4, 8, 12]}
        savedViews={SAVED_VIEWS}
        activeSavedViewId={activeSavedViewId}
        onSelectSavedView={selectSavedView}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={[
          {
            id: "assign",
            label: "Zuweisen",
            tone: "primary",
            onClick: () =>
              setMessage(`${selectedIds.length} Vorgänge zuweisen.`),
          },
          {
            id: "export",
            label: "Export vormerken",
            onClick: () =>
              setMessage(`${selectedIds.length} Exporte vorgemerkt.`),
          },
        ]}
      />
      <CaseDetailPanel row={selectedVisible ? selected : undefined}>
        <button type="button" className="ps-btn ps-btn--primary">
          Entscheiden
        </button>
        <button type="button" className="ps-btn ps-btn--ghost">
          Nachfordern
        </button>
        <p className="ps-muted" role="status">
          {message}
        </p>
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
