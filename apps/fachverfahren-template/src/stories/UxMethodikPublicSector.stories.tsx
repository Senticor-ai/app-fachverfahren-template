import type { Meta, StoryObj } from "@storybook/react";
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Filter,
  Info,
  Menu,
  Settings,
  ShieldCheck,
} from "lucide-react";

const meta = {
  title: "UX-Methodik/Public Sector",
  parameters: {
    docs: {
      description: {
        component:
          "Codifizierte Abnahme der generischen UX-Methodik für Fachverfahren, Bürgerportal, Sachbearbeitung und Accessibility.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const auditRows = [
  {
    section: "Teil 1",
    topic: "Time to Clarity, Research, JTBD, offene Fragen",
    state: "Erfüllt",
    evidence:
      "Screen Contracts, Domain-Modul-Manifest, TDD-Dokumentation und Validierungsbrief sind vorhanden. Human-Review-Gate und offene Fragen bleiben Pflicht je Fachverfahren.",
  },
  {
    section: "Teil 1",
    topic: "HCAI und EU-AI-Act-Designsicht",
    state: "Erfüllt",
    evidence:
      "HCAI ist im Screen Contract und Skill verankert. Die Template-App enthält keine KI-Funktion; konkrete KI-Use-Cases müssen Quelle, Konfidenz, Override und Audit liefern.",
  },
  {
    section: "A",
    topic: "Stack, Daten und Hydration",
    state: "Erfüllt",
    evidence:
      "Node 24, React, Tailwind, shadcn-Primitives, strict ESM, deterministische Mockdaten und lokale Store-Synchronisierung nach Mount.",
  },
  {
    section: "B-D",
    topic: "Shell, IA, Mobile und Seitenkopf",
    state: "Erfüllt",
    evidence:
      "Login-geschützte Rollen-Erfahrung, persistente Shell, Breadcrumbs, mobile Drawer, rollenbezogene Arbeitsbereiche und einklappbare Sachbearbeitungs-Sidebar sind vorhanden. RC-Gap-Prüfung bleibt im Screen Contract.",
  },
  {
    section: "E",
    topic: "Sachbearbeitungs-Tabellen",
    state: "Erfüllt",
    evidence:
      "Die App zeigt List-Detail, Sticky Header, zwei eingefrorene Spalten, Sortier-/Filter-Affordances, Tastaturzeilen und Mockdaten für Filteransichten.",
  },
  {
    section: "F",
    topic: "Mehrschritt-Formulare",
    state: "Erfüllt",
    evidence:
      "Der generische Formular-Assistent ist als Storybook- und Screen-Contract-Pflicht codifiziert: pfadentscheidende Fragen, Once-Only, err/warn/ok, freie Navigation und Review.",
  },
  {
    section: "G-J",
    topic: "Einstellungen, Info, keine Demo-Möblierung, Tokens",
    state: "Erfüllt",
    evidence:
      "Darstellung, Bedienung und Navigation werden persistiert; semantische Tokens, Status mit Text/Icon, keine Demo-Möblierung in der Runtime und Print-Regeln sind vorhanden.",
  },
] as const;

const caseRows = [
  {
    id: "FV-2026-0017",
    person: "Anna Muster",
    status: "Review erforderlich",
    dueAt: "2026-07-02",
    unit: "Team Eingang",
  },
  {
    id: "FV-2026-0020",
    person: "Lena Hoffmann",
    status: "Freigabe erforderlich",
    dueAt: "2026-07-01",
    unit: "Team Leistungen",
  },
  {
    id: "FV-2026-0021",
    person: "Amir Yilmaz",
    status: "Frist nah",
    dueAt: "2026-07-04",
    unit: "Team Eingang",
  },
] as const;

function statusClass(state: string) {
  switch (state) {
    case "Erfüllt":
      return "sb-status-marker sb-status-marker--done";
    case "Teilweise":
      return "sb-status-marker sb-status-marker--partial";
    case "Offen":
      return "sb-status-marker sb-status-marker--open";
    default:
      return "sb-status-marker";
  }
}

export const MethodikAudit: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">UX-Methodik</p>
        <h1>Public-Sector-Abnahme</h1>
        <p>
          Diese Story macht die verbindlichen Callouts aus der generischen
          Methodik sichtbar: Problem vor Lösung, HCAI, role-based IA,
          Accessibility AA, domain-neutrale Mockdaten und keine unnötige
          Meta-Möblierung in der Nutzererfahrung.
        </p>
        <div className="sb-audit-table-frame">
          <table className="sb-audit-table">
            <thead>
              <tr>
                <th scope="col">Abschnitt</th>
                <th scope="col">Callout</th>
                <th scope="col">Status</th>
                <th scope="col">Nachweis</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((row) => (
                <tr key={`${row.section}-${row.topic}`}>
                  <th scope="row">{row.section}</th>
                  <td>{row.topic}</td>
                  <td>
                    <span className={statusClass(row.state)}>
                      {row.state === "Erfüllt" ? (
                        <CheckCircle2 aria-hidden="true" size={16} />
                      ) : (
                        <AlertTriangle aria-hidden="true" size={16} />
                      )}
                      {row.state}
                    </span>
                  </td>
                  <td>{row.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  ),
};

export const SachbearbeitungWorkspaceContract: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Sachbearbeitung</p>
        <h1>Arbeitsvorrat und Vorgangsliste</h1>
        <div className="sb-method-shell">
          <aside aria-label="Arbeitsbereich" className="sb-method-rail">
            <button aria-label="Navigation öffnen" type="button">
              <Menu aria-hidden="true" size={18} />
            </button>
            <a aria-current="page" href="#inbox">
              Eingang
            </a>
            <a href="#assigned">Zugewiesen</a>
            <a href="#deadlines">Fristen</a>
            <a href="#decisions">Entscheidungen</a>
            <a href="#search">Suche</a>
            <a href="#settings">
              <Settings aria-hidden="true" size={16} />
              Allgemein
            </a>
          </aside>
          <section
            className="sb-method-workspace"
            aria-labelledby="cases-title"
          >
            <header className="sb-method-page-header">
              <ShieldCheck aria-hidden="true" size={22} />
              <div>
                <h2 id="cases-title">Eingang</h2>
                <p>
                  List-Detail, Tastaturpfad, Filter und Fristen bleiben
                  sichtbar.
                </p>
              </div>
            </header>
            <div className="filter-pills" aria-label="Schnellfilter">
              <a aria-current="true" href="#all">
                Alle <span className="tabular-nums">3</span>
              </a>
              <a href="#review">
                Review <span className="tabular-nums">2</span>
              </a>
              <a href="#deadline">
                Frist <span className="tabular-nums">3</span>
              </a>
            </div>
            <div className="sb-table-frame">
              <table className="sb-table sb-table--contract">
                <thead>
                  <tr>
                    {["Vorgang", "Person", "Status", "Frist", "Einheit"].map(
                      (column) => (
                        <th key={column} scope="col">
                          <span>{column}</span>
                          <span className="sb-table-tools" aria-hidden="true">
                            <ArrowUpDown size={14} />
                            <Filter size={14} />
                          </span>
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {caseRows.map((row) => (
                    <tr
                      aria-label={`Vorgang ${row.id} öffnen`}
                      key={row.id}
                      role="link"
                      tabIndex={0}
                    >
                      <th scope="row">{row.id}</th>
                      <td>{row.person}</td>
                      <td>
                        <span className="sb-status-marker sb-status-marker--partial">
                          <Info aria-hidden="true" size={16} />
                          {row.status}
                        </span>
                      </td>
                      <td className="tabular-nums">
                        <time dateTime={row.dueAt}>{row.dueAt}</time>
                      </td>
                      <td>{row.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  ),
};

export const BuergerinFormAndAccessibilityContract: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Bürgerin</p>
        <h1>Geführter Vorgang</h1>
        <div className="sb-method-grid">
          <section className="sb-form-preview" aria-labelledby="steps-title">
            <h2 id="steps-title">Schrittfolge</h2>
            <ol className="sb-stepper">
              <li className="sb-step sb-step--ok">
                <CheckCircle2 aria-hidden="true" size={16} />
                Anliegen
              </li>
              <li className="sb-step sb-step--warning">
                <AlertTriangle aria-hidden="true" size={16} />
                Angaben prüfen
              </li>
              <li className="sb-step">Absenden</li>
            </ol>
            <form>
              <label>
                <span>Vorname</span>
                <input autoComplete="given-name" defaultValue="Anna" />
              </label>
              <label>
                <span>Nachname</span>
                <input autoComplete="family-name" defaultValue="Muster" />
              </label>
              <label>
                <span>Postleitzahl</span>
                <input
                  autoComplete="postal-code"
                  defaultValue="10115"
                  inputMode="numeric"
                  maxLength={5}
                  pattern="\\d{5}"
                />
              </label>
              <p className="sb-validation-note">
                Übernommen aus der Anmeldung, editierbar. Warnungen blockieren
                nicht, Fehler führen zum betroffenen Schritt.
              </p>
              <button type="button">Angaben prüfen</button>
            </form>
          </section>
          <section className="sb-form-preview" aria-labelledby="settings-title">
            <h2 id="settings-title">Einstellungen</h2>
            <div className="sb-setting-grid">
              <button aria-pressed="true" type="button">
                Hell
              </button>
              <button aria-pressed="false" type="button">
                Dunkel
              </button>
              <button aria-pressed="false" type="button">
                System
              </button>
              <label>
                <input type="checkbox" /> Mehr Kontrast
              </label>
              <label>
                <input type="checkbox" /> Größere Schrift
              </label>
              <label>
                <input type="checkbox" /> Weniger Bewegung
              </label>
              <label>
                <input type="checkbox" /> Mehr Abstand
              </label>
            </div>
            <p>
              Alternative Sprachangebote werden erst eingeblendet, wenn ein
              echter Modus oder Link vorhanden ist.
            </p>
          </section>
        </div>
      </section>
    </main>
  ),
};
