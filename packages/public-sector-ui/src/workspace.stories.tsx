import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useState } from "react";
import { CaseStatus, DeadlineIndicator, GateStatus } from "./components.js";
import {
  CaseDetailPanel,
  CaseInbox,
  type CaseRow,
  type InboxFilter,
} from "./inbox.js";
import {
  ResponsiveWorkspaceShell,
  SavedViewsToolbar,
  StickyActionBar,
  type SavedView,
} from "./workspace.js";

const meta = {
  title: "Public Sector UI/Workspace",
  parameters: {
    docs: {
      description: {
        component:
          "Responsive Sachbearbeitungs-Arbeitsplatz: Desktop Master-Detail, mobile Detailflächen, gespeicherte Ansichten und eine sticky Aktionsleiste mit klarer Primäraktion.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CASES: CaseRow[] = [
  {
    id: "WGZ-2026-001",
    applicant: "Erika Mustermann",
    subject: "Wohngeldantrag · Erstbewilligung",
    status: "offen",
    dueAt: "2026-07-15",
  },
  {
    id: "WGZ-2026-002",
    applicant: "Aylin Demir",
    subject: "Nachforderung · Einkommensnachweis",
    status: "in-pruefung",
    dueAt: "2026-07-08",
  },
  {
    id: "WGZ-2026-003",
    applicant: "Hans Beispiel",
    subject: "Widerspruch · Bescheidprüfung",
    status: "offen",
    dueAt: "2026-07-04",
    overdue: true,
  },
  {
    id: "WGZ-2026-004",
    applicant: "Chiara Lombardi",
    subject: "Weiterbewilligung · Mietnachweis",
    status: "entschieden",
    dueAt: "2026-07-20",
  },
];

const FILTERS: InboxFilter[] = [
  { label: "Offen", value: "offen", count: 2 },
  { label: "In Prüfung", value: "in-pruefung", count: 1 },
  { label: "Entschieden", value: "entschieden", count: 1 },
];

const VIEWS: SavedView[] = [
  { id: "my", label: "Meine Vorgänge", count: 3 },
  { id: "due", label: "Fristnah", count: 2 },
  { id: "review", label: "Review", count: 1 },
];

function WorkspaceDemo({ empty = false }: { empty?: boolean }) {
  const [selectedId, setSelectedId] = useState("WGZ-2026-001");
  const [activeView, setActiveView] = useState("my");
  const [query, setQuery] = useState("");
  const rows = empty ? [] : CASES;
  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId),
    [rows, selectedId],
  );
  const detail = selected ? (
    <CaseDetailPanel row={selected}>
      <div className="ps-workspace-demo__detail-note">
        <p className="ps-muted">Nächster Schritt</p>
        <strong>Unterlagen prüfen und Entscheidung vorbereiten.</strong>
        <DeadlineIndicator
          label="Frist"
          dueAt={selected.dueAt}
          {...(selected.overdue !== undefined
            ? { overdue: selected.overdue }
            : {})}
        />
      </div>
      <StickyActionBar
        meta={<CaseStatus label="Review vorbereitet" tone="warning" />}
        primary={{
          id: "decide",
          label: "Entscheidung vorbereiten",
          onClick: () => undefined,
        }}
        secondary={[
          {
            id: "request",
            label: "Nachfordern",
            onClick: () => undefined,
          },
          {
            id: "assign",
            label: "Zuweisen",
            onClick: () => undefined,
          },
        ]}
      />
    </CaseDetailPanel>
  ) : (
    <CaseDetailPanel />
  );

  return (
    <ResponsiveWorkspaceShell
      title="Arbeitsvorrat"
      subtitle="Gespeicherte Ansichten, schnelle Auswahl und eine klare Aktionszone für den nächsten Schritt."
      status={
        <>
          <GateStatus label="Accessibility" tone="pass" />
          <GateStatus label="Fristen" tone={empty ? "pass" : "review"} />
        </>
      }
      actions={
        <button type="button" className="ps-btn ps-btn--ghost">
          Ansicht speichern
        </button>
      }
      list={
        <>
          <SavedViewsToolbar
            views={VIEWS}
            activeId={activeView}
            onSelect={setActiveView}
            searchValue={query}
            onSearchChange={setQuery}
            actions={
              <button type="button" className="ps-btn ps-btn--ghost">
                Spalten
              </button>
            }
          />
          <CaseInbox
            cases={rows}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            filters={FILTERS}
            activeFilters={["offen", "in-pruefung", "entschieden"]}
            onToggleFilter={() => undefined}
          />
        </>
      }
      detail={detail}
    />
  );
}

export const Arbeitsplatz: Story = {
  render: () => (
    <main className="sb-page">
      <WorkspaceDemo />
    </main>
  ),
};

export const Leerzustand: Story = {
  render: () => (
    <main className="sb-page">
      <WorkspaceDemo empty />
    </main>
  ),
};

export const MobileAktionsleiste: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <h1>Sticky Action Bar</h1>
        <p className="ps-muted">
          Die Aktionsleiste bleibt auf kleinen Viewports kompakt und hält genau
          eine Primäraktion sichtbar.
        </p>
        <StickyActionBar
          meta={<CaseStatus label="Entwurf gespeichert" tone="success" />}
          primary={{
            id: "submit",
            label: "Prüfung abschließen",
            onClick: () => undefined,
          }}
          secondary={[
            {
              id: "draft",
              label: "Entwurf sichern",
              onClick: () => undefined,
            },
          ]}
        />
      </section>
    </main>
  ),
};
