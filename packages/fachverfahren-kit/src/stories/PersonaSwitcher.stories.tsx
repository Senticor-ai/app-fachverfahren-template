import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  DEFAULT_PERSONAS,
  PersonaSwitcher,
  type Persona,
} from "../components/PersonaSwitcher.js";

// PersonaSwitcher — der Arbeitsbereichs-Wechsler. Personas sind SICHT-Zugänge
// (Produkt-Erlebnis), keine Autorisierung: die App übergibt NUR die dem Konto
// zugewiesenen Arbeitsbereiche (personas-Prop). Verhalten unter Test:
//  • drei Arbeitsbereiche → Menü öffnet, Wechsel feuert onPersonaChange;
//  • EIN Arbeitsbereich → die Shell blendet den Wechsler aus (hier: Menü zeigt nur ihn);
//  • KEIN Arbeitsbereich → die Komponente rendert nichts (Null-Arbeitsbereiche-Konto);
//  • ohne aktive Persona (Team-Workspace) → neutraler Trigger „Arbeitsbereich wählen".
const meta: Meta<typeof PersonaSwitcher> = {
  title: "Fachverfahren/PersonaSwitcher",
  component: PersonaSwitcher,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof PersonaSwitcher>;

function ControlledSwitcher({
  personas,
  initial,
}: {
  personas: typeof DEFAULT_PERSONAS;
  initial?: Persona;
}): React.JSX.Element {
  const [persona, setPersona] = useState<Persona | undefined>(initial);
  return (
    <div className="max-w-xs rounded-lg bg-sidebar p-2 text-sidebar-foreground">
      <PersonaSwitcher
        {...(persona ? { persona } : {})}
        onPersonaChange={setPersona}
        personas={personas}
      />
      <p className="px-2 pt-2 text-xs text-sidebar-muted" data-testid="aktiv">
        aktiv: {persona ?? "—"}
      </p>
    </div>
  );
}

/** Drei zugewiesene Arbeitsbereiche: Menü öffnen, wechseln, aktiver Eintrag markiert. */
export const DreiArbeitsbereiche: Story = {
  render: () => (
    <ControlledSwitcher personas={DEFAULT_PERSONAS} initial="buerger" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole("button", {
      name: /Arbeitsbereich wechseln — aktuell Bürger:in/,
    });
    await userEvent.click(trigger);
    const menu = await canvas.findByRole("menu", {
      name: "Arbeitsbereich wählen",
    });
    const eintraege = within(menu).getAllByRole("menuitemradio");
    await expect(eintraege).toHaveLength(3);
    await userEvent.click(
      within(menu).getByRole("menuitemradio", { name: /Sachbearbeitung/ }),
    );
    await expect(canvas.getByTestId("aktiv")).toHaveTextContent(
      "aktiv: sachbearbeitung",
    );
  },
};

/** Team-Workspace ohne aktive Persona: neutraler Trigger, Einstiege wählbar. */
export const OhneAktivePersona: Story = {
  render: () => <ControlledSwitcher personas={DEFAULT_PERSONAS} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole("button", {
      name: "Arbeitsbereich wählen",
    });
    await expect(trigger).toHaveTextContent("Arbeitsbereich wählen");
    await userEvent.click(trigger);
    await userEvent.click(
      canvas.getByRole("menuitemradio", { name: /Aufsicht/ }),
    );
    await expect(canvas.getByTestId("aktiv")).toHaveTextContent(
      "aktiv: aufsicht",
    );
  },
};

/** Null-Arbeitsbereiche-Konto: die Komponente rendert NICHTS (kein Crash). */
export const OhneArbeitsbereiche: Story = {
  render: () => <ControlledSwitcher personas={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: /Arbeitsbereich/ }),
    ).toBeNull();
  },
};

/** Ein einziger Arbeitsbereich: in der Shell wird der Wechsler ausgeblendet —
 *  die Komponente selbst bleibt funktionsfähig (defensiv). */
export const EinArbeitsbereich: Story = {
  render: () => (
    <ControlledSwitcher
      personas={DEFAULT_PERSONAS.filter((p) => p.key === "buerger")}
      initial="buerger"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = await canvas.findByRole("button", {
      name: /aktuell Bürger:in/,
    });
    await userEvent.click(trigger);
    await expect(canvas.getAllByRole("menuitemradio")).toHaveLength(1);
  },
};
