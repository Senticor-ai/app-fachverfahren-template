import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Domain Modules/Neutral Example",
  parameters: {
    docs: {
      description: {
        component:
          "Neutrales Beispiel für ein Fachverfahren-Modul ohne fachliche Spezialisierung.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const cases = [
  {
    id: "NEU-2026-001",
    applicant: "Beispielperson",
    status: "bereit",
    dueAt: "2026-07-15",
  },
  {
    id: "NEU-2026-002",
    applicant: "Beispielorganisation",
    status: "Review",
    dueAt: "2026-07-20",
  },
];

export const CitizenReady: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Neutrales Beispielverfahren</h1>
        <p>
          Geführter Einstieg für ein generisches Verfahren. Konkrete Fachinhalte
          werden im echten Domain-Modul ersetzt.
        </p>
        <button type="button">Entwurf starten</button>
      </section>
    </main>
  ),
};

export const CaseworkerReady: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-caseworker">
        <p className="eyebrow">Sachbearbeitung</p>
        <h1>Beispielvorgänge</h1>
        <div className="sb-table-frame">
          <table className="sb-table">
            <thead>
              <tr>
                <th>Vorgang</th>
                <th>Antragstellende Stelle</th>
                <th>Status</th>
                <th>Frist</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((caseItem) => (
                <tr key={caseItem.id}>
                  <td>{caseItem.id}</td>
                  <td>{caseItem.applicant}</td>
                  <td>{caseItem.status}</td>
                  <td className="tabular-nums">{caseItem.dueAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  ),
};

export const LoadingState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card" aria-busy="true" aria-live="polite">
        <h1>Beispielvorgänge werden geladen</h1>
        <p>Daten, Rolle und Zuständigkeit werden geprüft.</p>
      </section>
    </main>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Noch kein Vorgang vorhanden</h1>
        <p>Starten Sie einen Entwurf, um den ersten Vorgang anzulegen.</p>
        <button type="button">Entwurf starten</button>
      </section>
    </main>
  ),
};

export const ErrorState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <h1>Beispielvorgänge nicht erreichbar</h1>
        <p role="alert">
          Die Daten konnten nicht geladen werden. Prüfen Sie die Verbindung oder
          versuchen Sie es erneut.
        </p>
        <button type="button">Erneut laden</button>
      </section>
    </main>
  ),
};

export const SuccessState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-density-citizen">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Vorgang angelegt</h1>
        <p>Ihre Referenznummer ist NEU-2026-001.</p>
        <button type="button">Zur Übersicht</button>
      </section>
    </main>
  ),
};
