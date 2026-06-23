import type { Meta, StoryObj } from "@storybook/react";
import { CheckCircle2, Info, ShieldCheck } from "lucide-react";
import {
  ContextRail,
  FindingSummary,
  GateStatus,
  GovernanceBar,
  RunCard,
  WorkingTabs,
  WorkspacePanel,
} from "@senticor/public-sector-ui";

const meta = {
  title: "UX-Methodik/Source Set",
  parameters: {
    docs: {
      description: {
        component:
          "Abnahme gegen /Users/wolfgang/Downloads/mdfilesuxuiskill. Storybook ist der erste sichtbare Vertrag; die App übernimmt die generischen Regeln ohne Hundesteuer-Domainlogik.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const sourceRows = [
  {
    source: "00_README-uebersicht.md",
    requirement: "Generisch und konkret trennen",
    evidence:
      "Hundesteuer-spezifische Regeln bleiben Validierungsbrief oder Domain-Modul. Template-UI, Mockdaten und Storybook nutzen fachneutrale Vorgänge.",
  },
  {
    source: "01_ux-methodik-public-sector-generisch.md",
    requirement: "Problem, Rolle, HCAI, Shell, Tabellen, Formulare, A11y",
    evidence:
      "UX-Methodik/Public Sector, Screen Contracts, Bürgerin- und Sachbearbeitungs-States sowie persistierte Einstellungen.",
  },
  {
    source: "01_ux-methodik-hundesteuer-demo.md",
    requirement: "Nur generische Shell-, Tabellen-, Formular- und Token-Regeln",
    evidence:
      "Einklappbare Sidebar, Posteingang/Ausgang, Vorgänge, Stepper-Kontrakt und Tokens sind übernommen; Satzung, Gebühren und Hundedaten sind ausgeschlossen.",
  },
  {
    source: "02_fachverfahren-design-manual.md",
    requirement: "Fachverfahren-App für Bürgerin, Sachbearbeiter:in und Audit",
    evidence:
      "Design Manual/Fachverfahren codifiziert Master-Detail, Breadcrumbs, Zustände, Tastaturpfad und zielgruppengerechte Dichte.",
  },
  {
    source: "03_coding-agent-ui-und-designsystem.md",
    requirement: "Doc 3 Design-System und Build Console",
    evidence:
      "Doc 3 ist Token-Quelle. Public-sector-ui exportiert GovernanceBar, ContextRail, WorkspacePanel, Run Cards, Findings, GateStatus und WorkingTabs.",
  },
] as const;

export const SourceSetAudit: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">mdfilesuxuiskill</p>
        <h1>Generische Abnahme</h1>
        <p>
          Diese Story ist der Storybook-Vertrag für das komplette
          UX/UI-Quellset. Sie hält fest, was generisch in die Vorlage gehört und
          was als fachliches Beispiel ausgeschlossen bleibt.
        </p>

        <div className="sb-audit-table-frame">
          <table className="sb-audit-table">
            <thead>
              <tr>
                <th scope="col">Quelle</th>
                <th scope="col">Callout</th>
                <th scope="col">Nachweis</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((row) => (
                <tr key={row.source}>
                  <th scope="row">{row.source}</th>
                  <td>{row.requirement}</td>
                  <td>{row.evidence}</td>
                  <td>
                    <span className="sb-status-marker sb-status-marker--done">
                      <CheckCircle2 aria-hidden="true" size={16} />
                      angewendet
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Abgrenzung</p>
        <h2>Hundesteuer-spezifisch ausgeschlossen</h2>
        <div className="sb-state-grid">
          <article className="sb-state">
            <ShieldCheck aria-hidden="true" size={20} />
            <strong>Keine Fachwerte in der Runtime</strong>
            <span>
              Beträge, Fristen, Satzungsstellen, Tierdaten und
              Gefährlichkeitslogik gehören in ein Domain-Modul.
            </span>
          </article>
          <article className="sb-state">
            <Info aria-hidden="true" size={20} />
            <strong>Generische Validierung bleibt</strong>
            <span>
              Pfadentscheidende Fragen, err/warn/ok, freie Schritt-Navigation
              und Review vor Absenden sind als Screen Contract vorhanden.
            </span>
          </article>
        </div>
      </section>
    </main>
  ),
};

export const BuildConsoleContract: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <GovernanceBar
        modeLabel="GovTech Voll-Governance"
        runLabel="Session 2026-06-23"
      >
        <GateStatus label="Accessibility" tone="pass" />
        <GateStatus label="SBOM" tone="pass" />
        <GateStatus label="Evidence" tone="review" />
        <GateStatus label="Secrets" tone="pass" />
      </GovernanceBar>

      <section className="sb-console-layout" aria-label="Build Console">
        <ContextRail title="Kontext & Steuerung">
          <p>SDK, Skills, Wissensprodukte und Governance-Profil.</p>
          <GateStatus label="Kein Agent genehmigt sich selbst" tone="pass" />
          <GateStatus label="Owner erforderlich" tone="review" />
        </ContextRail>

        <WorkspacePanel title="Working Context">
          <WorkingTabs
            tabs={[
              { id: "artifacts", label: "Artifacts", active: true },
              { id: "diff", label: "Diff" },
              { id: "devops", label: "DevOps" },
              { id: "preview", label: "Preview" },
            ]}
          />

          <RunCard
            agent="Review-Agent"
            inputs={["Fachkonzept", "Screen Contract", "Doc 3"]}
            status="Review"
            summary="Der Lauf wird als lesbare Run Cards gezeigt, nicht als roher Token-Stream."
            title="Storybook-Abnahme"
          >
            <FindingSummary
              correction="Betroffenen Screen Contract aktualisieren und Storybook-State nachziehen."
              findingId="UX-GATE-003"
              gateImpact="conditional"
              owner="UX-Agent"
              source="mdfilesuxuiskill Doc 3"
            />
          </RunCard>

          <RunCard
            agent="Evidence-Agent"
            inputs={["Tests", "A11y", "K8s Policy"]}
            status="bereit"
            summary="Gate-Ergebnisse werden mit Owner, Quelle und Auswirkung sichtbar."
            title="Evidence Bundle"
          />
        </WorkspacePanel>
      </section>
    </main>
  ),
};
