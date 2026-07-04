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
          "Abnahme gegen das repo-lokale UX/UI-Source-Set. Storybook ist der erste sichtbare Vertrag; die App übernimmt die generischen Regeln ohne Domain-Beispiellogik.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const sourceRows = [
  {
    source: "Source-Set-Überblick",
    requirement: "Generisch und konkret trennen",
    evidence:
      "Fachspezifische Regeln bleiben Beispielprompt oder Domain-Modul. Template-UI, Mockdaten und Storybook nutzen fachneutrale Vorgänge.",
  },
  {
    source: "Public-Sector-UX-Methodik",
    requirement: "Problem, Rolle, HCAI, Shell, Tabellen, Formulare, A11y",
    evidence:
      "UX-Methodik/Public Sector, Screen Contracts, Bürgerin- und Sachbearbeitungs-States sowie persistierte Einstellungen über BarrierefreiheitsPanel.",
  },
  {
    source: "Fachliches Beispiel",
    requirement: "Nur konkrete Fachannahmen und Akzeptanz",
    evidence:
      "Beispielprompts bleiben kurz. Shell, Tabellen, Formulare, Accessibility und Tokens kommen aus Skill, Docs, Storybook und Template-Guardrails.",
  },
  {
    source: "Fachverfahren Design Manual",
    requirement: "Fachverfahren-App für Bürgerin, Sachbearbeiter:in und Audit",
    evidence:
      "Design Manual/Fachverfahren codifiziert Master-Detail, Breadcrumbs, Zustände, Tastaturpfad und zielgruppengerechte Dichte.",
  },
  {
    source: "Coding-Agent UI und Design-System",
    requirement: "Doc 3 Design-System und Build Console",
    evidence:
      "Doc 3 ist Token-Quelle. Public-sector-ui exportiert GovernanceBar, ContextRail, WorkspacePanel, Run Cards, Findings, GateStatus, WorkingTabs und fachneutrale Arbeitssteuerung wie TaskQueuePanel, DeadlinePanel und HandoffPanel.",
  },
] as const;

export const SourceSetAudit: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">UX/UI Source Set</p>
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
        <h2>Fachbeispiele ausgeschlossen</h2>
        <div className="sb-state-grid">
          <article className="sb-state">
            <ShieldCheck aria-hidden="true" size={20} />
            <strong>Keine Fachwerte in der Runtime</strong>
            <span>
              Beträge, Fristen, Rechtsverweise, Registerdaten und
              Bewertungslogik gehören in ein Domain-Modul.
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
              source="UX/UI Source Set Doc 3"
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
