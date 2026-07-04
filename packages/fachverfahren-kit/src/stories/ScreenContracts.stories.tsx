import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Delivery/Screen Contracts",
  parameters: {
    docs: {
      description: {
        component:
          "Screen Contracts verbinden TDD, UX-Abnahme, Accessibility und Storybook-Zustände.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ScreenContract: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <p className="eyebrow">Screen Contract</p>
        <h1>Vorgangseingang</h1>
        <dl className="sb-contract">
          <dt>Eingaben</dt>
          <dd>cases[], activeRole, jurisdictionConfig, policyDecision</dd>
          <dt>Ausgaben</dt>
          <dd>case.opened, filter.changed, bulkReview.requested</dd>
          <dt>Zustände</dt>
          <dd>loading, empty, error, ready, stale-index-warning</dd>
          <dt>A11y</dt>
          <dd>
            Landmark main, H1, Tastaturpfad durch Tabelle oder mobile
            Kartenliste, sichtbarer Fokus, Status nicht nur über Farbe.
          </dd>
          <dt>Tests zuerst</dt>
          <dd>
            Zuerst scheiternde Tests für rollenbasierte Navigation und
            Tastaturaktivierung der Vorgangsliste schreiben.
          </dd>
        </dl>
      </section>
      <section className="sb-card">
        <h2>Testzustand: Fehler mit Recovery</h2>
        <p role="alert">
          Die Vorgangsliste konnte nicht geladen werden. Prüfen Sie die
          Verbindung oder versuchen Sie es erneut.
        </p>
        <button type="button">Erneut laden</button>
      </section>
    </main>
  ),
};
