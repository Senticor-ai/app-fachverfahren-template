import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { BundIDLoginForm, type LoginMethod } from "./login.js";

const meta = {
  title: "Public Sector UI/BundID Login",
  parameters: {
    docs: {
      description: {
        component:
          "Föderiertes Anmeldeformular über BundID/eID: Vertrauensanker, Methodenwahl per Tablist " +
          "(eID / ELSTER / Benutzername+Passwort), genau ein primärer Anmeldepfad, ARIA-Fehlerregion " +
          "und rechtlicher Footer. Setzt arch:golden-eid-egov um — das Fachverfahren betreibt kein " +
          "eigenes Login.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standard: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <BundIDLoginForm
          activeMethod="eid"
          onMethodChange={() => undefined}
          onLogin={() => undefined}
          authorityName="Bürgeramt Musterstadt"
        />
      </section>
    </main>
  ),
};

export const PasswortMethode: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <BundIDLoginForm
          activeMethod="password"
          onMethodChange={() => undefined}
          onLogin={() => undefined}
          authorityName="Bürgeramt Musterstadt"
        />
      </section>
    </main>
  ),
};

export const Laedt: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <BundIDLoginForm
          activeMethod="eid"
          onMethodChange={() => undefined}
          onLogin={() => undefined}
          state="loading"
          authorityName="Bürgeramt Musterstadt"
        />
      </section>
    </main>
  ),
};

export const Fehler: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <BundIDLoginForm
          activeMethod="eid"
          onMethodChange={() => undefined}
          onLogin={() => undefined}
          state="error"
          errorMessage="Der Personalausweis konnte nicht gelesen werden. Bitte prüfen Sie die PIN und versuchen Sie es erneut."
          authorityName="Bürgeramt Musterstadt"
        />
      </section>
    </main>
  ),
};

function BundIDLoginDemo() {
  const [activeMethod, setActiveMethod] = useState<LoginMethod>("eid");
  const [state, setState] = useState<"ready" | "loading">("ready");

  function handleLogin() {
    setState("loading");
    window.setTimeout(() => setState("ready"), 1500);
  }

  return (
    <BundIDLoginForm
      activeMethod={activeMethod}
      onMethodChange={setActiveMethod}
      onLogin={handleLogin}
      state={state}
      authorityName="Bürgeramt Musterstadt"
    />
  );
}

export const MethodenwechselInteraktiv: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <BundIDLoginDemo />
      </section>
    </main>
  ),
};
