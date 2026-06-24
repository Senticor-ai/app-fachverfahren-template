import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  FormField,
  FormStep,
  FormStepper,
  OnceOnlyField,
  type FieldState,
  type StepDef,
} from "./forms.js";

const meta = {
  title: "Public Sector UI/Forms",
  parameters: {
    docs: {
      description: {
        component:
          "Bürger-Formular-Pattern: geführter Stepper, wenige Felder pro Schritt, Inline-Validierung (err/warn/ok), Once-Only-Übernahme. Setzt den fachverfahren-ux-contract um.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Felder: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <h1>Formularfelder · Zustände</h1>
        <FormField
          id="name-ok"
          label="Name der Halterin"
          value="Erika Mustermann"
          onChange={() => undefined}
          required
          hint="Wie im Ausweis."
        />
        <FormField
          id="plz-err"
          label="Postleitzahl"
          value="123"
          onChange={() => undefined}
          required
          state="err"
          hint="Fünfstellig."
          message="Bitte eine fünfstellige Postleitzahl eingeben."
        />
        <FormField
          id="tel-warn"
          label="Telefon (optional)"
          value="030"
          onChange={() => undefined}
          state="warn"
          message="Wirkt unvollständig — bitte prüfen."
        />
        <OnceOnlyField
          id="adresse"
          label="Anschrift"
          source="Melderegister"
          value="Musterstraße 1, 12345 Musterstadt"
          onChange={() => undefined}
        />
      </section>
      <FormStep
        title="Ein Schritt (wenige Felder)"
        description="Ein Fokus pro Schritt."
      >
        <FormField
          id="kategorie"
          label="Kategorie"
          value=""
          onChange={() => undefined}
          required
        />
      </FormStep>
    </main>
  ),
};

function FormStepperDemo() {
  const [current, setCurrent] = useState(0);
  const [name, setName] = useState("Erika Mustermann");
  const [plz, setPlz] = useState("");
  const plzValid = /^\d{5}$/.test(plz);
  const plzState: FieldState = plz === "" ? "ok" : plzValid ? "ok" : "err";

  const steps: StepDef[] = [
    {
      id: "halter",
      title: "Halter:in",
      complete: name.length > 0 && plzValid,
      render: () => renderHalter(),
    },
    {
      id: "review",
      title: "Prüfen & Absenden",
      complete: name.length > 0 && plzValid,
      render: () => renderReview(),
    },
  ];

  function renderHalter() {
    return (
      <FormStep title="Halter:in" description="Ihre Angaben zur Person.">
        <OnceOnlyField
          id="demo-name"
          label="Name"
          source="Melderegister"
          value={name}
          onChange={setName}
          required
        />
        <FormField
          id="demo-plz"
          label="Postleitzahl"
          value={plz}
          onChange={setPlz}
          required
          hint="Fünfstellig."
          state={plzState}
          message={
            plzState === "err"
              ? "Bitte eine fünfstellige Postleitzahl eingeben."
              : undefined
          }
        />
      </FormStep>
    );
  }

  function renderReview() {
    return (
      <FormStep
        title="Prüfen & Absenden"
        description="Bitte prüfen Sie Ihre Angaben."
      >
        <p className="ps-muted">Name: {name || "—"}</p>
        <p className="ps-muted">Postleitzahl: {plz || "—"}</p>
      </FormStep>
    );
  }

  return (
    <FormStepper
      steps={steps}
      current={current}
      onNavigate={setCurrent}
      onSubmit={() => undefined}
      submitDisabled={!steps.every((step) => step.complete)}
    />
  );
}

export const GeführterStepper: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <FormStepperDemo />
      </section>
    </main>
  ),
};
