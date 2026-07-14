import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Banner } from "../components/Banner.js";
import { FachverfahrenShell } from "../components/FachverfahrenShell.js";
import type { LeistungConfig } from "../types.js";

const config: LeistungConfig<unknown> = {
  id: "story-leistung",
  label: "Musterleistung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [],
  antrag: { steps: [] },
  statusMachine: {
    initial: "offen",
    states: [{ key: "offen", label: "Offen", tone: "neu" }],
    transitions: [],
  },
  register: { suchfelder: [] },
  detailSektionen: [],
};

const meta: Meta<typeof FachverfahrenShell> = {
  title: "Fachverfahren/FachverfahrenShell",
  component: FachverfahrenShell,
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof FachverfahrenShell>;

export const MitRechtlichemFooter: Story = {
  args: {
    config,
    persona: "buerger",
    onPersonaChange: fn(),
    onNavigate: fn(),
    footerLinks: [
      {
        key: "barrierefreiheit",
        label: "Erklärung zur Barrierefreiheit",
        href: "/barrierefreiheit",
      },
    ],
    bannerSlot: (
      <div className="px-4 py-3">
        <Banner title="Demo-Modus">Keine Echtdaten eingeben.</Banner>
      </div>
    ),
    children: (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Öffentlicher Dienst</h1>
      </div>
    ),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", {
      name: "Erklärung zur Barrierefreiheit",
    });
    await userEvent.click(link);
    await expect(args.onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ href: "/barrierefreiheit" }),
    );
    await expect(canvas.getAllByRole("banner")).toHaveLength(1);
    await expect(canvas.getAllByRole("main")).toHaveLength(1);
    await expect(canvas.getAllByRole("contentinfo")).toHaveLength(1);
    await expect(canvas.getByRole("status")).toHaveTextContent("Demo-Modus");
  },
};
