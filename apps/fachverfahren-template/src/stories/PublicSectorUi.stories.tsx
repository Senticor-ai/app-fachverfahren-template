import type { Meta, StoryObj } from "@storybook/react";
import {
  AccessibilityFeedback,
  ApplicantIdentity,
  AuthoritySelector,
  CaseStatus,
  ContextRail,
  DeadlineIndicator,
  DecisionSummary,
  EvidenceList,
  FindingSummary,
  GateStatus,
  GovernanceBar,
  LanguageAccessLinks,
  OfficialNotice,
  PaymentStatus,
  RepresentationBadge,
  RunCard,
  ServiceHeader,
  WorkingTabs,
  WorkspacePanel,
} from "@senticor/public-sector-ui";

const meta = {
  title: "Public Sector UI/Components",
  parameters: {
    docs: {
      description: {
        component:
          "Fachneutrale Verwaltungskomponenten. Konkrete Fachverfahren kombinieren diese Bausteine im Domain-Modul.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ComponentSet: Story = {
  render: () => (
    <div className="sb-page">
      <ServiceHeader
        appName="Fachverfahren Vorlage"
        authorityName="Beispielbehörde"
        jurisdictionLabel="Deutschland"
      >
        <LanguageAccessLinks />
        <AccessibilityFeedback href="#feedback" />
      </ServiceHeader>
      <main className="sb-stack" id="feedback">
        <section className="sb-card">
          <h2>Status und Fristen</h2>
          <div className="sb-inline">
            <CaseStatus label="offen" tone="neutral" />
            <CaseStatus label="geprüft" tone="success" />
            <CaseStatus label="Review erforderlich" tone="warning" />
            <CaseStatus label="blockiert" tone="critical" />
          </div>
          <DeadlineIndicator label="Rückmeldung bis" dueAt="2026-07-15" />
        </section>

        <section className="sb-card">
          <h2>Vorgangskontext</h2>
          <ApplicantIdentity
            name="Max Mustermann"
            identifier="subject.local-1"
          />
          <RepresentationBadge label="handelt für Organisation" />
          <EvidenceList
            items={[
              {
                evidenceId: "identity",
                label: "Identität bestätigt",
                source: "aus der Anmeldung übernommen",
              },
              {
                evidenceId: "mailbox",
                label: "Rückmeldung vorbereitet",
                source: "im Vorgang sichtbar",
              },
            ]}
          />
        </section>

        <section className="sb-card">
          <DecisionSummary title="Entscheidungsvorschlag">
            <p>
              Vorschläge bleiben prüfbar, überschreibbar und mit Quelle
              versehen. Eine Freigabe erfordert die passende Rolle.
            </p>
          </DecisionSummary>
          <OfficialNotice title="Bescheidentwurf">
            <p>Amtliche Hinweise nutzen einfache Sprache und klare Struktur.</p>
          </OfficialNotice>
          <PaymentStatus label="Zahlung vorbereitet" tone="warning" />
        </section>

        <section className="sb-card">
          <AuthoritySelector
            label="Zuständige Behörde"
            value="authority.local"
            options={[{ value: "authority.local", label: "Beispielbehörde" }]}
            onChange={() => undefined}
          />
        </section>

        <section className="sb-card sb-card--wide">
          <h2>Build Console Komponenten</h2>
          <GovernanceBar
            modeLabel="GovTech Voll-Governance"
            runLabel="Lauf 2026-06-23"
          >
            <GateStatus label="Accessibility" tone="pass" />
            <GateStatus label="Tests" tone="review" />
            <GateStatus label="Secrets" tone="block" />
          </GovernanceBar>
          <div className="sb-console-layout">
            <ContextRail title="Kontext & Steuerung">
              <p>SDK, Skill, Governance-Profil und aktiver Agent.</p>
              <GateStatus label="Review" tone="review" />
            </ContextRail>
            <WorkspacePanel title="Working Context">
              <WorkingTabs
                tabs={[
                  { id: "artifacts", label: "Artifacts", active: true },
                  { id: "diff", label: "Diff" },
                  { id: "preview", label: "Preview" },
                ]}
              />
              <RunCard
                agent="UX-Agent"
                inputs={["Doc 1", "Doc 2", "Doc 3"]}
                status="aktiv"
                summary="Screen Contract, Storybook und Gate-Nachweis werden geprüft."
                title="UX-Abnahme"
              >
                <FindingSummary
                  correction="Storybook State ergänzen und Owner benennen."
                  findingId="UX-IA-001"
                  gateImpact="conditional"
                  owner="Build-Agent"
                  source="UX/UI Source Set Doc 3"
                />
              </RunCard>
            </WorkspacePanel>
          </div>
        </section>
      </main>
    </div>
  ),
};
