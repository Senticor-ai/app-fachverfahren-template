import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  AuditDashboard,
  type AuditTrailEntry,
  type DashboardFilter,
  type DashboardMetric,
} from "./dashboard.js";

const meta = {
  title: "Public Sector UI/Dashboard",
  parameters: {
    docs: {
      description: {
        component:
          "Aufsichts-/Management-Dashboard: KPI-Kacheln mit Drilldown, optionale Filterleiste und ein nur lesender, revisionssicherer Audit-Trail mit pseudonymisierten Akteuren. Status immer über Text + Icon + Status-Klasse (nie nur Farbe). Setzt den fachverfahren-ux-contract für die Aufsichts-Persona um.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const demoMetrics: DashboardMetric[] = [
  { id: "offen", label: "Offene Vorgänge", value: "1.284", tone: "warning" },
  {
    id: "frist",
    label: "Fristen überschritten",
    value: "37",
    tone: "critical",
  },
  { id: "quote", label: "Erledigungsquote", value: "92 %", tone: "success" },
  {
    id: "laufzeit",
    label: "Ø Laufzeit (Tage)",
    value: "11,4",
    tone: "neutral",
  },
];

const demoTrail: AuditTrailEntry[] = [
  {
    id: "a-001",
    at: "2026-06-22T08:14:00Z",
    actor: "SB-7f3a",
    action: "Vorgang BAU-2026-0481 geöffnet (Lesezugriff)",
  },
  {
    id: "a-002",
    at: "2026-06-22T09:02:00Z",
    actor: "SB-2c1d",
    action: "Frist für BAU-2026-0455 als überschritten markiert",
  },
  {
    id: "a-003",
    at: "2026-06-22T10:47:00Z",
    actor: "AUF-9e80",
    action: "Übersicht nach Stelle „Bauamt“ gefiltert",
  },
  {
    id: "a-004",
    at: "2026-06-22T13:21:00Z",
    actor: "SB-7f3a",
    action: "Entscheidung zu BAU-2026-0481 dokumentiert",
  },
];

export const Standard: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <AuditDashboard metrics={demoMetrics} trail={demoTrail} />
      </section>
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <AuditDashboard metrics={[]} trail={[]} />
      </section>
    </main>
  ),
};

export const Laedt: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Lade-Anmutung: Es liegen noch keine Kennzahlen vor (Leerzustand der KPI-Reihe), der Audit-Trail ist ebenfalls noch leer.",
      },
    },
  },
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <AuditDashboard metrics={[]} trail={[]} />
      </section>
    </main>
  ),
};

const demoFilters: DashboardFilter[] = [
  { label: "Alle Stellen", value: "alle" },
  { label: "Bauamt", value: "bauamt" },
  { label: "Ordnungsamt", value: "ordnungsamt" },
  { label: "Sozialamt", value: "sozialamt" },
];

const trailByFilter: Record<string, AuditTrailEntry[]> = {
  alle: demoTrail,
  bauamt: demoTrail.filter((entry) => entry.action.includes("BAU")),
  ordnungsamt: [
    {
      id: "o-001",
      at: "2026-06-23T07:55:00Z",
      actor: "SB-44b1",
      action: "Vorgang ORD-2026-0123 geöffnet (Lesezugriff)",
    },
  ],
  sozialamt: [],
};

function AuditDashboardDemo() {
  const [activeFilter, setActiveFilter] = useState("alle");
  const [drilldown, setDrilldown] = useState<string | null>(null);

  const metrics: DashboardMetric[] = demoMetrics.map((metric) => ({
    ...metric,
    onDrilldown: () => setDrilldown(metric.label),
  }));

  const trail = trailByFilter[activeFilter] ?? [];

  return (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <AuditDashboard
          metrics={metrics}
          trail={trail}
          filters={demoFilters}
          activeFilter={activeFilter}
          onFilter={setActiveFilter}
        />
      </section>
      <section className="sb-card sb-card--wide">
        <p className="ps-muted">
          Aktiver Filter: <strong>{activeFilter}</strong>
        </p>
        <p className="ps-muted">
          Zuletzt geöffneter Drilldown: <strong>{drilldown ?? "—"}</strong>
        </p>
      </section>
    </main>
  );
}

export const FilterUndDrilldown: Story = {
  render: () => <AuditDashboardDemo />,
};
