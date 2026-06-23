import type { Meta, StoryObj } from "@storybook/react";
import {
  AlertTriangle,
  ArrowUpDown,
  Bell,
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
  Inbox,
  Search,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";

const meta = {
  title: "Design Manual/Fachverfahren",
  parameters: {
    docs: {
      description: {
        component:
          "Abnahmeoberfläche für Dok. 2: Sachbearbeiter:in-Fachanwendung, Bürger:in-relevante Patterns, Zustände, Barrierefreiheit und Design-System-Regeln.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const manualRows = [
  {
    section: "1",
    topic: "Progressive Disclosure, einfache Sprache, Datensparsamkeit",
    state: "Erfüllt",
    evidence:
      "Bürger:in-Strecke bleibt geführt; Sachbearbeitung zeigt nur arbeitsrelevante Vorgänge, Fristen und Review.",
  },
  {
    section: "2",
    topic: "Tokens, Inter, Lucide, shadcn-Primitives",
    state: "Erfüllt",
    evidence:
      "Semantische HSL-Tokens, Inter/System-Fallback, Lucide-Icons, Tailwind v4 und shadcn-Primitives sind Standard.",
  },
  {
    section: "3-5",
    topic: "Persistente Shell, Sidebar, Profil, Settings, Breadcrumbs",
    state: "Erfüllt",
    evidence:
      "Sachbearbeitung nutzt eine linke Fachnavigation mit Countern, Icon-Rail, verzögertem Hover-Ausklappen, statischem Modus, Profilmenü im Shell und Breadcrumbs.",
  },
  {
    section: "6",
    topic: "Formulare",
    state: "Erfüllt",
    evidence:
      "Bürger:in-Flow und Storybook zeigen Stepper, Once-Only, Review, Autofill-Tokens und den generischen Formular-Blueprint für Domain-Module.",
  },
  {
    section: "7",
    topic: "Tabellen und Listen",
    state: "Erfüllt",
    evidence:
      "Sachbearbeitung hat Master-Detail, Sticky Header, zwei gefrorene Leitspalten, Status-Badges, Tastaturzeilen, Filteransichten und Storybook-Kontrakte für Bulk-/Pagination-Erweiterungen.",
  },
  {
    section: "8",
    topic: "KI/HCAI",
    state: "Nicht zutreffend",
    evidence:
      "Die fachneutrale Template-App enthält keine KI-Funktion. Wenn ein Domain-Modul KI ergänzt, sind Kennzeichnung, Quelle, Konfidenz, Warum, Override und Audit Pflicht.",
  },
  {
    section: "9-10",
    topic: "Zustände und Accessibility",
    state: "Erfüllt",
    evidence:
      "Storybook codifiziert Loading, Empty, Error, Success, Tastatur, Fokus, Status mit Text/Icon, Kontrast und 400-Prozent-Reflow. Manuelle Screenreader-Prüfung bleibt Pflicht.",
  },
  {
    section: "11-15",
    topic: "Content, Do/Don'ts, Screen Contracts",
    state: "Erfüllt",
    evidence:
      "Deutsche Copy nutzt Umlaute, keine Basisdienst-Begriffe in Primärnavigation, Screen Contracts und Storybook-Gate sind Pflicht.",
  },
] as const;

const rows = [
  ["FV-2026-0017", "Anna Muster", "Review erforderlich", "2026-07-02"],
  ["FV-2026-0020", "Lena Hoffmann", "Freigabe erforderlich", "2026-07-01"],
  ["FV-2026-0021", "Amir Yilmaz", "Frist nah", "2026-07-04"],
] as const;

function stateClass(state: string) {
  switch (state) {
    case "Erfüllt":
      return "sb-status-marker sb-status-marker--done";
    case "Teilweise":
      return "sb-status-marker sb-status-marker--partial";
    case "Nicht zutreffend":
      return "sb-status-marker";
    default:
      return "sb-status-marker";
  }
}

export const ManualAudit: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Fachverfahren Design Manual</p>
        <h1>Dok. 2 Abnahme</h1>
        <p>
          Diese Story ist der sichtbare Vertrag für Sachbearbeiter:in-
          Fachanwendungen und die Bürger:in-Regeln, die auf das Portal
          übertragen werden.
        </p>
        <div className="sb-audit-table-frame">
          <table className="sb-audit-table">
            <thead>
              <tr>
                <th scope="col">§</th>
                <th scope="col">Callout</th>
                <th scope="col">Status</th>
                <th scope="col">Nachweis</th>
              </tr>
            </thead>
            <tbody>
              {manualRows.map((row) => (
                <tr key={row.section}>
                  <th scope="row">{row.section}</th>
                  <td>{row.topic}</td>
                  <td>
                    <span className={stateClass(row.state)}>
                      {row.state === "Nicht zutreffend" ? (
                        <ShieldCheck aria-hidden="true" size={16} />
                      ) : (
                        <CheckCircle2 aria-hidden="true" size={16} />
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

export const SachbearbeiterFachanwendung: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Sachbearbeiter:in</p>
        <h1>Fachanwendung mit Master-Detail</h1>
        <div className="sb-manual-shell">
          <aside className="sb-method-rail" aria-label="Fachnavigation">
            <a aria-current="page" href="#inbox">
              <Inbox aria-hidden="true" size={18} />
              Eingang
              <span className="caseworker-sidebar__count">5</span>
            </a>
            <a href="#reviews">
              <ShieldCheck aria-hidden="true" size={18} />
              Reviews
              <span className="caseworker-sidebar__count">2</span>
            </a>
            <a href="#deadlines">
              <ClipboardList aria-hidden="true" size={18} />
              Fristen
              <span className="caseworker-sidebar__count">5</span>
            </a>
            <a href="#search">
              <Search aria-hidden="true" size={18} />
              Suche
            </a>
            <a href="#settings">
              <Settings aria-hidden="true" size={18} />
              Einstellungen
            </a>
          </aside>

          <section
            className="sb-method-workspace"
            aria-labelledby="manual-list"
          >
            <nav className="breadcrumb" aria-label="Breadcrumb">
              <a href="#inbox">Vorgänge</a>
              <span aria-hidden="true">/</span>
              <span>Eingang</span>
              <span aria-hidden="true">/</span>
              <span>FV-2026-0017</span>
            </nav>
            <header className="sb-method-page-header">
              <ShieldCheck aria-hidden="true" size={22} />
              <div>
                <h2 id="manual-list">Eingang</h2>
                <p>
                  Dichte Vorgangsliste, unabhängiges Detailpanel und
                  rollenbezogene Aktionen.
                </p>
              </div>
            </header>
            <div className="filter-pills" aria-label="Schnellfilter">
              <a aria-current="true" href="#all">
                Alle <span className="tabular-nums">5</span>
              </a>
              <a href="#review">
                Review <span className="tabular-nums">2</span>
              </a>
              <a href="#blocked">
                Blockiert <span className="tabular-nums">1</span>
              </a>
            </div>
            <div className="sb-manual-layout">
              <div className="sb-table-frame">
                <table className="sb-table sb-table--contract">
                  <thead>
                    <tr>
                      {["Vorgang", "Person", "Status", "Frist"].map(
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
                    {rows.map(([id, person, status, dueAt], index) => (
                      <tr
                        aria-current={index === 0 ? "true" : undefined}
                        aria-label={`Vorgang ${id} öffnen`}
                        key={id}
                        role="link"
                        tabIndex={0}
                      >
                        <th scope="row">{id}</th>
                        <td>{person}</td>
                        <td>
                          <span className="sb-status-marker sb-status-marker--partial">
                            <AlertTriangle aria-hidden="true" size={16} />
                            {status}
                          </span>
                        </td>
                        <td className="tabular-nums">
                          <time dateTime={dueAt}>{dueAt}</time>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="sb-detail-preview" aria-labelledby="detail">
                <h3 id="detail">FV-2026-0017</h3>
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>Review erforderlich</dd>
                  </div>
                  <div>
                    <dt>Frist</dt>
                    <dd className="tabular-nums">2026-07-02</dd>
                  </div>
                  <div>
                    <dt>Aktion</dt>
                    <dd>Vier-Augen-Review starten</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        </div>
      </section>
    </main>
  ),
};

export const BuergerRegeln: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Bürger:in</p>
        <h1>Geführte Strecke</h1>
        <div className="sb-method-grid">
          <section className="sb-form-preview" aria-labelledby="citizen-flow">
            <h2 id="citizen-flow">Schritte</h2>
            <ol className="sb-stepper">
              <li className="sb-step sb-step--ok">
                <CheckCircle2 aria-hidden="true" size={16} />
                Anliegen
              </li>
              <li className="sb-step sb-step--warning">
                <AlertTriangle aria-hidden="true" size={16} />
                Angaben prüfen
              </li>
              <li className="sb-step">Bestätigung</li>
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
              <p className="sb-validation-note">
                Aus der Anmeldung übernommen. Die Angabe bleibt editierbar.
              </p>
              <button type="button">Zur Prüfung</button>
            </form>
          </section>
          <section className="sb-form-preview" aria-labelledby="citizen-copy">
            <h2 id="citizen-copy">Sprache und Abschluss</h2>
            <p>
              Kurze Sätze, klare nächste Aktion, keine Fachbegriffe ohne Hilfe.
            </p>
            <p>
              Die Bestätigung nennt eine Vorgangsnummer und zeigt, wo
              Nachrichten und Nachforderungen erscheinen.
            </p>
            <div className="sb-state sb-state--success">
              <CheckCircle2 aria-hidden="true" size={18} />
              Vorgang FV-2026-0017 gespeichert.
            </div>
          </section>
          <section
            className="sb-form-preview"
            aria-labelledby="citizen-cases-messages"
          >
            <h2 id="citizen-cases-messages">Vorgänge und Nachrichten</h2>
            <div className="sb-state">
              <FileText aria-hidden="true" size={18} />
              <strong>FV-2026-0017</strong>
              <span>Entwurf öffnen führt in das Vorgangsdetail.</span>
            </div>
            <div className="sb-state">
              <Bell aria-hidden="true" size={18} />
              <strong>Posteingang</strong>
              <span>
                Nachrichten öffnen den zugehörigen generischen Vorgang.
              </span>
            </div>
          </section>
        </div>
      </section>
    </main>
  ),
};

export const ZustaendeUndFeedback: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <p className="eyebrow">Zustände</p>
        <h1>Loading, Empty, Error, Success</h1>
        <div className="sb-state-grid">
          <div className="sb-state">
            <ClipboardList aria-hidden="true" size={20} />
            <strong>Laden</strong>
            <span>Skeleton oder Fortschritt, kein leerer Sprung.</span>
          </div>
          <div className="sb-state">
            <Inbox aria-hidden="true" size={20} />
            <strong>Leer</strong>
            <span>Nächster sinnvoller Schritt ist sichtbar.</span>
          </div>
          <div className="sb-state sb-state--error" role="alert">
            <AlertTriangle aria-hidden="true" size={20} />
            <strong>Fehler</strong>
            <span>Verständlich, mit Recovery-Pfad.</span>
          </div>
          <div className="sb-state sb-state--success">
            <CheckCircle2 aria-hidden="true" size={20} />
            <strong>Erfolg</strong>
            <span>Vorgangsnummer oder Referenz ist sichtbar.</span>
          </div>
        </div>
        <div className="sb-state-grid">
          <div className="sb-state">
            <User aria-hidden="true" size={20} />
            <strong>Fokus</strong>
            <span>Tastaturpfad und sichtbarer Fokus sind Pflicht.</span>
          </div>
          <div className="sb-state">
            <Bell aria-hidden="true" size={20} />
            <strong>Status</strong>
            <span>Nie nur Farbe; immer Text oder Icon.</span>
          </div>
        </div>
      </section>
    </main>
  ),
};
