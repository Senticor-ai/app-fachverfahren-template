import type { Meta, StoryObj } from "@storybook/react";
import {
  CaseStatus,
  ContextRail,
  FindingSummary,
  GateStatus,
  GovernanceBar,
  RunCard,
  WorkingTabs,
  WorkspacePanel,
} from "./components.js";

const meta = {
  title: "Public Sector UI/Package",
  parameters: {
    docs: {
      description: {
        component:
          "Package-lokale Story für die wiederverwendbaren Verwaltungs- und Build-Console-Komponenten.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PackageContract: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <h1>Public Sector UI Package</h1>
        <div className="sb-inline">
          <CaseStatus label="offen" tone="neutral" />
          <CaseStatus label="Review erforderlich" tone="warning" />
          <GateStatus label="Evidence" tone="review" />
        </div>
      </section>

      <GovernanceBar
        modeLabel="GovTech Voll-Governance"
        runLabel="Package Story"
      >
        <GateStatus label="Accessibility" tone="pass" />
        <GateStatus label="Tests" tone="pass" />
      </GovernanceBar>

      <section className="sb-console-layout">
        <ContextRail title="Kontext">
          <p>Reusable shell vocabulary for agent-facing public-sector UI.</p>
        </ContextRail>
        <WorkspacePanel title="Working Context">
          <WorkingTabs
            tabs={[
              { id: "artifacts", label: "Artifacts", active: true },
              { id: "preview", label: "Preview" },
            ]}
          />
          <RunCard
            agent="Review-Agent"
            inputs={["Doc 3", "Storybook"]}
            status="bereit"
            summary="Run Cards bleiben lesbare Management-Ereignisse."
            title="Package-Vertrag"
          >
            <FindingSummary
              correction="Owner und Gate-Auswirkung benennen."
              findingId="PKG-UI-001"
              gateImpact="conditional"
              owner="UX-Agent"
              source="Doc 3"
            />
          </RunCard>
        </WorkspacePanel>
      </section>
    </main>
  ),
};
