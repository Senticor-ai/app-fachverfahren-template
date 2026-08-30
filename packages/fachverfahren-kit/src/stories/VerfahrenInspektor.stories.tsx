// Story: VerfahrenInspektor — die eine Naht (LeistungConfig) browsbar + strukturell validierbar (Steckbrief,
// Befunde, Kennzahlen, Prozess-Diagramm). Neutrale Demo-Config.
import type { Meta, StoryObj } from "@storybook/react";

import { VerfahrenInspektor } from "../components/VerfahrenInspektor.js";
import type { LeistungConfig } from "../types.js";

const config: LeistungConfig = {
  id: "musterantrag",
  label: "Musterantrag",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 1 Demo-Satzung",
      titel: "Platzhalter — reale Grundlage aus dem Fachkonzept",
    },
  ],
  fimLeistung: { id: "99 000 000 000 000", status: "annahme-zu-validieren" },
  antrag: {
    steps: [
      {
        id: "angaben",
        titel: "Angaben",
        felder: [
          {
            name: "antragsteller.name",
            label: "Name",
            typ: "text",
            required: true,
          },
          { name: "anliegen.kategorie", label: "Kategorie", typ: "text" },
        ],
      },
    ],
  },
  fristenTypen: [
    {
      id: "bearbeitung",
      label: "Bearbeitungsfrist",
      dauer: 14,
      einheit: "tag",
      anker: "eingang",
      art: "behoerdlich",
    },
  ],
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "in_pruefung", label: "In Prüfung", tone: "info" },
      { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "in_pruefung",
        label: "In Prüfung nehmen",
        rollen: ["sachbearbeitung"],
      },
      {
        from: "in_pruefung",
        to: "festgesetzt",
        label: "Festsetzen",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
      },
    ],
  },
  register: { suchfelder: ["antragsteller.name"] },
  detailSektionen: [
    {
      titel: "Antrag",
      felder: [
        { pfad: "antragsteller.name", label: "Name" },
        { pfad: "anliegen.kategorie", label: "Kategorie" },
      ],
    },
  ],
};

const meta = {
  title: "Fachverfahren Kit/Verfahren-Inspektor",
  component: VerfahrenInspektor,
  tags: ["autodocs"],
} satisfies Meta<typeof VerfahrenInspektor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Wohlgeformte Config: Steckbrief + Kennzahlen + Prozess-Diagramm, keine Befunde. */
export const Wohlgeformt: Story = {
  name: "Wohlgeformt",
  args: { config },
  render: (args) => <VerfahrenInspektor {...args} />,
};

/** Config mit strukturellem Fehler: Initialzustand fehlt in den States. */
export const MitBefund: Story = {
  name: "Mit Befund",
  args: {
    config: {
      ...config,
      statusMachine: {
        ...config.statusMachine,
        initial: "gibt-es-nicht",
      },
    },
  },
  render: (args) => <VerfahrenInspektor {...args} />,
};
