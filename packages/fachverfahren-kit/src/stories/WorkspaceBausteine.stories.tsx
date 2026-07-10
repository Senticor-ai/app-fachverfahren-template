// Stories: die zwei großen SB-Workspace-Bausteine (Arbeitsvorrat, ReviewWorkspace) — port-getrieben mit einer
// Seed-Fixture (createFachverfahrenStore + neutrale Demo-Config mit Vorgängen). Bewusst NEUTRAL (Muster-/Beispiel-
// werte). Schließt die Storybook-Coverage-Lücke dieser beiden Kit-Komponenten.
import type { Meta, StoryObj } from "@storybook/react";

import { Arbeitsvorrat } from "../components/Arbeitsvorrat.js";
import { ReviewWorkspace } from "../components/ReviewWorkspace.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { createFachverfahrenStore } from "../store.js";
import type { LeistungConfig, Vorgang } from "../types.js";

type DemoAntrag = {
  antragsteller: { name: string; ort: string };
  anliegen: { kategorie: string };
};

const demoConfig: LeistungConfig<DemoAntrag> = {
  id: "musterantrag",
  label: "Musterantrag",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 1 Demo-Satzung",
      titel: "Platzhalter — reale Grundlagen aus dem Fachkonzept",
    },
  ],
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
          {
            name: "anliegen.kategorie",
            label: "Kategorie",
            typ: "select",
            required: true,
            options: [
              { value: "a", label: "Kategorie A" },
              { value: "b", label: "Kategorie B" },
            ],
          },
        ],
      },
    ],
  },
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
  register: { suchfelder: ["name"] },
  detailSektionen: [
    {
      titel: "Antrag",
      felder: [
        { pfad: "antragsteller.name", label: "Name" },
        { pfad: "anliegen.kategorie", label: "Kategorie" },
      ],
    },
  ],
  seed: ({ vorgangsnummer }) => {
    const mk = (
      min: number,
      status: string,
      name: string,
      kategorie: string,
    ): Vorgang<DemoAntrag> => {
      const vn = vorgangsnummer();
      return {
        id: `seed-${vn}`,
        vorgangsnummer: vn,
        eingangIso: new Date(
          Date.UTC(2026, 6, 9, 9, 0) - min * 60000,
        ).toISOString(),
        antragsdaten: {
          antragsteller: { name, ort: "Musterstadt" },
          anliegen: { kategorie },
        },
        status,
        ki: { confidence: 0.9, flags: [] },
        nachweise: [],
        history: [
          {
            ts: new Date(Date.UTC(2026, 6, 9, 8, 0)).toISOString(),
            aktion: "Antrag eingegangen",
            rolle: "buerger",
          },
        ],
      };
    };
    return [
      mk(30, "eingegangen", "Alex Muster", "a"),
      mk(120, "in_pruefung", "Kim Beispiel", "b"),
    ];
  },
};

const demoStore = createFachverfahrenStore(demoConfig);
const ersterVorgang = demoStore.list()[0]!;

const meta = {
  title: "Fachverfahren Kit/Workspace",
  parameters: {
    docs: {
      description: {
        component:
          "Die zwei großen SB-Workspace-Bausteine, port-getrieben aus einer neutralen Demo-Config mit Seed-Vorgängen.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Arbeitsvorrat — die (Einzel-Verfahren-)Aufgabenliste mit Filter/Sortierung/Bulk, aus dem Port gespeist. */
export const ArbeitsvorratStory: Story = {
  name: "Arbeitsvorrat",
  render: () => (
    <StatusRegionProvider>
      <Arbeitsvorrat config={demoConfig} port={demoStore} onOpen={() => {}} />
    </StatusRegionProvider>
  ),
};

/** ReviewWorkspace — die interne Prüf-/Entscheidungssicht eines Vorgangs (Tabs, Nachweise, Entscheidung, Vier-Augen). */
export const ReviewWorkspaceStory: Story = {
  name: "ReviewWorkspace",
  render: () => (
    <StatusRegionProvider>
      <ReviewWorkspace
        config={demoConfig}
        port={demoStore}
        vorgangId={ersterVorgang.id}
        rolle="sachbearbeitung"
        akteur="sb.demo"
        onClose={() => {}}
      />
    </StatusRegionProvider>
  ),
};
