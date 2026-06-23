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

interface TemplateFieldProps {
  label: string;
  name: string;
  autoComplete: string;
  pattern?: string;
  hint?: string;
  required?: boolean;
}

function TemplateField({
  label,
  name,
  autoComplete,
  pattern,
  hint,
  required = false,
}: TemplateFieldProps) {
  return (
    <label className="sb-schema-field">
      <span>
        {label}
        {required ? <strong aria-label="Pflichtfeld"> *</strong> : null}
      </span>
      <input
        autoComplete={autoComplete}
        name={name}
        pattern={pattern}
        required={required}
      />
      {hint ? <span className="sb-field-hint">{hint}</span> : null}
    </label>
  );
}

function TemplateIntakeWizardPreview() {
  function renderStep() {
    return (
      <>
        <ol className="sb-stepper">
          <li className="sb-step sb-step--ok">Anliegen</li>
          <li className="sb-step">Angaben prüfen</li>
          <li className="sb-step">Absenden</li>
        </ol>
        <TemplateField
          autoComplete="name"
          label="Name"
          name="applicantName"
          required
        />
        <TemplateField
          autoComplete="postal-code"
          hint="Fünfstellige deutsche Postleitzahl."
          label="Postleitzahl"
          name="contactPostalCode"
          pattern="^\d{5}$"
        />
      </>
    );
  }

  return (
    <form noValidate>
      {renderStep()}
      <p className="sb-validation-note">
        Clientseitige Hinweise werden aus `forms/intake.form.schema.json`
        abgeleitet; serverseitige Fastify-Schemas bleiben die verbindliche
        Prüfung.
      </p>
      <button type="button">Angaben prüfen</button>
    </form>
  );
}

export const Ready: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card">
        <p className="eyebrow">Bürgerportal</p>
        <h1>Replace With Domain</h1>
        <p>Geführter Einstieg mit einem klaren nächsten Schritt.</p>
        <TemplateIntakeWizardPreview />
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
