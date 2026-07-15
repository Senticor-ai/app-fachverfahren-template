import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { ProzessEditor } from "../components/ProzessEditor.js";
import type { ProzessDefinition } from "../lib/process-ir.js";
import type { StatusMachine } from "../types.js";

const statusMachine: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "in-pruefung", label: "In Prüfung", tone: "info" },
    {
      key: "abgeschlossen",
      label: "Abgeschlossen",
      tone: "ok",
      terminal: true,
    },
  ],
  transitions: [
    {
      from: "eingegangen",
      to: "in-pruefung",
      label: "Prüfung beginnen",
      rollen: ["sachbearbeitung"],
    },
    {
      from: "in-pruefung",
      to: "abgeschlossen",
      label: "Abschließen",
      rollen: ["sachbearbeitung"],
    },
  ],
};

const beispiel: ProzessDefinition = {
  id: "musterprozess",
  version: 1,
  label: "Neutraler Musterprozess",
  knoten: [
    { id: "start", typ: "start", label: "Eingang" },
    {
      id: "pruefung",
      typ: "userTask",
      label: "Angaben prüfen",
      rollen: ["sachbearbeitung"],
      catalogAction: "in-pruefung",
    },
    { id: "ende", typ: "ende", label: "Ende" },
  ],
  kanten: [
    { id: "eingang-pruefung", von: "start", nach: "pruefung" },
    { id: "pruefung-ende", von: "pruefung", nach: "ende" },
  ],
};

function EditierbaresBeispiel() {
  const [wert, setWert] = useState(beispiel);
  return (
    <div className="max-w-5xl p-4">
      <ProzessEditor
        wert={wert}
        statusMachine={statusMachine}
        beiAenderung={setWert}
      />
    </div>
  );
}

const meta = {
  title: "Fachverfahren Kit/ProzessEditor",
  component: ProzessEditor,
  args: {
    wert: beispiel,
    statusMachine,
    beiAenderung: () => undefined,
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Formularbasierter Editor für das begrenzte, BPMN-inspirierte Prozessmodell. Keine BPMN-Engine und kein XML-Import/Export.",
      },
    },
  },
} satisfies Meta<typeof ProzessEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Editierbar: Story = {
  render: () => <EditierbaresBeispiel />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Knoten hinzufügen" }),
    );
    await expect(canvas.getByLabelText("Typ (k4)")).toBeInTheDocument();
  },
};

export const NurLesen: Story = {
  args: {
    wert: beispiel,
    statusMachine,
    beiAenderung: () => undefined,
    nurLesen: true,
  },
  render: (args) => (
    <div className="max-w-5xl p-4">
      <ProzessEditor {...args} />
    </div>
  ),
};
