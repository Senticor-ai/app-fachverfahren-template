import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ProcessTimeline, type ProcessStep } from "./process.js";

const meta = {
  title: "Public Sector UI/Process Timeline",
  parameters: {
    docs: {
      description: {
        component:
          "Fachneutrale Prozess-Timeline: erledigte, aktuelle, ausstehende und blockierte Schritte mit Zuständigkeit und nächster Aktion.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SUBMITTED_STEP: ProcessStep = {
  id: "submitted",
  label: "Antrag eingegangen",
  status: "done",
  description: "Der Vorgang wurde im System angelegt.",
  at: "2026-07-01",
  ownerLabel: "System",
};

const DECISION_STEP: ProcessStep = {
  id: "decision",
  label: "Entscheidung vorbereiten",
  status: "upcoming",
  description: "Startet nach abgeschlossener Nachweisprüfung.",
  ownerLabel: "Sachbearbeitung",
};

const STEPS: ProcessStep[] = [
  SUBMITTED_STEP,
  {
    id: "evidence",
    label: "Nachweise prüfen",
    status: "current",
    description: "Ein Nachweis ist eingegangen und wartet auf Prüfung.",
    at: "2026-07-03",
    ownerLabel: "Sachbearbeitung",
  },
  DECISION_STEP,
  {
    id: "notice",
    label: "Bescheid bereitstellen",
    status: "upcoming",
    description: "Erfolgt nach dokumentierter Entscheidung.",
    ownerLabel: "Postfach",
  },
];

function ProcessDemo() {
  const [status, setStatus] = useState("Timeline geöffnet.");

  return (
    <div className="sb-stack">
      <ProcessTimeline
        steps={STEPS.map((step) =>
          step.status === "current"
            ? {
                ...step,
                action: {
                  label: "Prüfung öffnen",
                  onClick: () => setStatus("Prüfung geöffnet."),
                },
              }
            : step,
        )}
      />
      <p className="ps-muted" role="status">
        {status}
      </p>
    </div>
  );
}

export const Verlauf: Story = {
  render: () => (
    <main className="sb-page">
      <ProcessDemo />
    </main>
  ),
};

export const Blockiert: Story = {
  render: () => (
    <main className="sb-page">
      <ProcessTimeline
        title="Blockierter Ablauf"
        description="Der aktuelle Schritt ist blockiert, bis die fehlende Information vorliegt."
        steps={[
          SUBMITTED_STEP,
          {
            id: "missing",
            label: "Fehlende Angabe klären",
            status: "blocked",
            description:
              "Ohne die Angabe kann die Entscheidung nicht vorbereitet werden.",
            at: "2026-07-04",
            ownerLabel: "Sachbearbeitung",
            action: {
              label: "Nachforderung starten",
              onClick: () => undefined,
            },
          },
          DECISION_STEP,
        ]}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <ProcessTimeline steps={[]} />
    </main>
  ),
};
