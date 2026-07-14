import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { AdminOnboarding } from "../components/AdminOnboarding.js";

const meta: Meta<typeof AdminOnboarding> = {
  title: "Fachverfahren/AdminOnboarding",
  component: AdminOnboarding,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof AdminOnboarding>;

export const ErsteSchritte: Story = {
  args: {
    schritte: [
      {
        key: "organisation",
        titel: "Organisation konfigurieren",
        beschreibung: "Leistungsdaten und Runtime-Konfiguration prüfen.",
        done: true,
      },
      {
        key: "team",
        titel: "Team anlegen",
        beschreibung: "Weitere Konten und Arbeitsbereiche anlegen.",
        href: "/admin/users",
        linkLabel: "Team anlegen",
      },
      {
        key: "idp",
        titel: "IdP verbinden (optional)",
        beschreibung: "Den Vertrauens- und Identitätsvertrag prüfen.",
      },
      {
        key: "discovery",
        titel: "Discovery starten",
        beschreibung: "Das Team-Discovery-Board öffnen.",
      },
    ],
    onNavigate: fn(),
    onDismiss: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("listitem")).toHaveLength(4);
    await expect(canvas.getByText("Erledigt")).toBeVisible();

    await userEvent.click(canvas.getByRole("link", { name: "Team anlegen" }));
    await expect(args.onNavigate).toHaveBeenCalledWith("/admin/users");

    await userEvent.click(canvas.getByRole("button", { name: "Ausblenden" }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
  },
};
