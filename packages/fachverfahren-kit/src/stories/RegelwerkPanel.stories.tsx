// Story: RegelwerkPanel — die Workflow-/Regelwerk-Sicht (deklarative Automations-/Hook-Regeln als DATEN + reiner
// Trockenlauf). Neutrale Muster-Regeln; der Trockenlauf nutzt die getestete `evalAutomationen`.
import type { Meta, StoryObj } from "@storybook/react";

import { RegelwerkPanel } from "../components/RegelwerkPanel.js";
import type {
  AutomationRule,
  Aufgabe,
  PriorityDef,
  Vorgang,
} from "../types.js";

const prioritaeten: PriorityDef[] = [
  { key: "dringend", label: "Dringend", tone: "block", ordinal: 0 },
  { key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 },
  { key: "normal", label: "Normal", tone: "info", ordinal: 2 },
];

const regeln: AutomationRule[] = [
  {
    id: "benachrichtigung.eingang",
    trigger: { art: "beim-eingang" },
    dann: [{ art: "benachrichtigen", kanal: "postfach", template: "eingang" }],
  },
  {
    id: "audit.uebergang",
    trigger: { art: "beim-uebergang" },
    dann: [{ art: "audit", aktion: "statuswechsel-protokolliert" }],
  },
  {
    id: "eskalation.frist",
    trigger: { art: "frist-erreicht", fristTyp: "bearbeitung" },
    wenn: { feld: "$prioritaet", op: "!=", wert: "dringend" },
    dann: [
      { art: "setze-prioritaet", wert: "dringend" },
      { art: "label-hinzufuegen", label: "eilt" },
    ],
  },
  {
    id: "zuweisung.eilige",
    trigger: { art: "beim-uebergang" },
    wenn: { feld: "$prioritaet", op: "in", wert: ["dringend", "hoch"] },
    dann: [{ art: "zuweisen", an: { rolle: "sachbearbeitung" } }],
    aktiv: false,
  },
];

const aufgabe: Aufgabe = {
  id: "task-1",
  vorgangId: "seed-1",
  procedureId: "musterantrag",
  tenantId: "t1",
  authorityId: "a1",
  jurisdictionId: "de",
  titel: "Muster-Vorgang",
  prioritaet: "hoch",
  labels: [],
  sortRank: "V",
  version: 1,
};

const vorgang: Vorgang = {
  id: "seed-1",
  vorgangsnummer: "FV-2026-0001",
  eingangIso: "2026-07-09T08:00:00.000Z",
  antragsdaten: {},
  status: "in_pruefung",
  ki: { confidence: 0.8, flags: [] },
  nachweise: [],
  history: [],
};

const meta = {
  title: "Fachverfahren Kit/Regelwerk",
  component: RegelwerkPanel,
  parameters: {
    docs: {
      description: {
        component:
          "Macht die deklarativen Automations-/Hook-Regeln sichtbar und erlaubt einen reinen Trockenlauf (dieselbe getestete `evalAutomationen`). Ausführung bleibt server-autoritativ.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof RegelwerkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Standard: Regeln + Trockenlauf gegen einen Beispiel-Vorgang. */
export const MitTrockenlauf: Story = {
  name: "Mit Trockenlauf",
  args: { regeln, prioritaeten, beispiel: { aufgabe, vorgang } },
  render: (args) => <RegelwerkPanel {...args} />,
};

/** Ohne Beispiel-Kontext: nur die Regel-Übersicht (Trockenlauf ausgeblendet). */
export const NurUebersicht: Story = {
  name: "Nur Übersicht",
  args: { regeln, prioritaeten },
};

/** Leerer Zustand: keine Regeln konfiguriert. */
export const Leer: Story = {
  name: "Leer",
  args: { regeln: [], prioritaeten },
};
