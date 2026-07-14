import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { Barrierefreiheitserklaerung } from "../components/Barrierefreiheitserklaerung.js";

const meta: Meta<typeof Barrierefreiheitserklaerung> = {
  title: "Fachverfahren/Barrierefreiheitserklärung",
  component: Barrierefreiheitserklaerung,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof Barrierefreiheitserklaerung>;

export const TeilweiseKonform: Story = {
  args: {
    stand: { datumIso: "2026-07-14", status: "teilweise-konform" },
    nichtKonformeInhalte: [
      "Die vollständige BITV-Prüfung ist noch nicht abgeschlossen.",
    ],
    feedbackEmail: "barrierefreiheit@example.org",
    feedbackBetreff: "Barriere melden: Musterantrag",
    schlichtungsstelle: {
      name: "Schlichtungsstelle BGG",
      url: "https://www.schlichtungsstelle-bgg.de/",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", {
        level: 2,
        name: "Erklärung zur Barrierefreiheit",
      }),
    ).toBeVisible();
    await expect(canvas.getAllByText("teilweise konform")[0]).toBeVisible();

    const time = canvasElement.querySelector("time");
    await expect(time).toHaveAttribute("datetime", "2026-07-14");

    const feedback = canvas.getByRole("link", {
      name: "barrierefreiheit@example.org",
    });
    await expect(feedback).toHaveAttribute(
      "href",
      "mailto:barrierefreiheit@example.org?subject=Barriere%20melden%3A%20Musterantrag",
    );

    const arbitration = canvas.getByRole("link", {
      name: /Schlichtungsstelle BGG.*öffnet in einem neuen Tab/,
    });
    await expect(arbitration).toHaveAttribute("target", "_blank");
  },
};

export const Konform: Story = {
  args: {
    stand: { datumIso: "2026-07-14", status: "konform" },
    feedbackEmail: "barrierefreiheit@example.org",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("vollständig konform")[0]).toBeVisible();
    await expect(
      canvas.queryByRole("heading", { name: "Nicht barrierefreie Inhalte" }),
    ).toBeNull();
  },
};
