import type { Meta, StoryObj } from "@storybook/react";

const meta = {
  title: "Domain Modules/Replace With Domain/Screen",
  parameters: {
    docs: {
      description: {
        component:
          "Storybook states are derived from the module screen contracts.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Replace With Domain</h1>
        <p>Geführter Einstieg mit einem klaren nächsten Schritt.</p>
        <button type="button">Entwurf starten</button>
      </section>
    </main>
  ),
};

export const LoadingState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card" aria-busy="true" aria-live="polite">
        <h1>Replace With Domain wird geladen</h1>
        <p>Daten und Berechtigungen werden geprüft.</p>
      </section>
    </main>
  ),
};

export const EmptyState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
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
        <h1>Fehlerzustand</h1>
        <p role="alert">
          Der Zustand konnte nicht geladen werden. Erneut versuchen.
        </p>
        <button type="button">Erneut laden</button>
      </section>
    </main>
  ),
};

export const SuccessState: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <h1>Vorgang gespeichert</h1>
        <p>Ihre Referenznummer ist REF-2026-0001.</p>
        <button type="button">Zur Übersicht</button>
      </section>
    </main>
  ),
};
