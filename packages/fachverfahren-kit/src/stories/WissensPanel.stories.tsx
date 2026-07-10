// Story: WissensPanel — die interne Wissensbasis/Wiki (Master-Detail über Markdown-Artikel als DATEN).
import type { Meta, StoryObj } from "@storybook/react";

import { WissensPanel } from "../components/WissensPanel.js";
import type { WissensArtikel } from "../types.js";

const artikel: WissensArtikel[] = [
  {
    id: "handbuch.start",
    kategorie: "Handbuch",
    titel: "Erste Schritte",
    standIso: "2026-07-10T00:00:00.000Z",
    markdown: [
      "# Erste Schritte",
      "",
      "Willkommen im **Sachbearbeiter-Workspace**. Diese Wissensbasis erklärt die Arbeitsweise.",
      "",
      "- **Arbeitsvorrat** — alle Aufgaben über alle Verfahren.",
      "- **Board** — Kanban nach Status.",
      "",
      "```mermaid",
      "flowchart LR",
      "  Eingang --> Prüfung --> Entscheidung",
      "```",
    ].join("\n"),
  },
  {
    id: "prozesse.vier-augen",
    kategorie: "Prozesse",
    titel: "Vier-Augen-Prinzip",
    markdown: [
      "# Vier-Augen-Prinzip",
      "",
      "Kritische Entscheidungen erfordern **zwei verschiedene** Akteure.",
      "",
      "| Schritt | Akteur |",
      "| --- | --- |",
      "| Vorbereitung | Person A |",
      "| Freigabe | Person B (≠ A) |",
    ].join("\n"),
  },
];

const meta = {
  title: "Fachverfahren Kit/Wissensbasis",
  component: WissensPanel,
  tags: ["autodocs"],
} satisfies Meta<typeof WissensPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Standard: kategorisierte Navigation + Markdown-Ansicht (GFM + Mermaid). */
export const Standard: Story = {
  name: "Standard",
  args: { artikel },
  render: (args) => <WissensPanel {...args} />,
};

/** Leerer Zustand: keine Artikel hinterlegt. */
export const Leer: Story = {
  name: "Leer",
  args: { artikel: [] },
  render: (args) => <WissensPanel {...args} />,
};
