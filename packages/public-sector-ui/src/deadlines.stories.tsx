import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DeadlinePanel, type DeadlineItem } from "./deadlines.js";

const meta = {
  title: "Public Sector UI/Deadline Panel",
  parameters: {
    docs: {
      description: {
        component:
          "Generische Fristensteuerung für Fachverfahren: Fälligkeit, Überfälligkeit, Zuständigkeit, Eskalationspfad und nächste Aktionen.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_DEADLINES: DeadlineItem[] = [
  {
    id: "proof-deadline",
    label: "Nachweisfrist prüfen",
    status: "due-soon",
    dueAt: "2026-07-12",
    remainingLabel: "2 Arbeitstage",
    description:
      "Der Eingang ist offen; vor Ablauf muss eine Erinnerung oder Nachforderung ausgelöst werden.",
    caseReference: "VG-2026-0148",
    ownerLabel: "Sachbearbeitung",
    legalBasisLabel: "Verfahrensregel der Leistungskonfiguration",
    escalation: "review",
  },
  {
    id: "four-eyes",
    label: "Vier-Augen-Freigabe",
    status: "overdue",
    dueAt: "2026-07-09",
    remainingLabel: "überfällig seit 1 Arbeitstag",
    description: "Der kritische Statusübergang wartet auf eine zweite Prüfung.",
    caseReference: "VG-2026-0151",
    ownerLabel: "Teamleitung",
    legalBasisLabel: "Statusmaschine · vierAugen",
    escalation: "lead",
  },
  {
    id: "citizen-answer",
    label: "Antwort der Antragstellerin",
    status: "open",
    dueAt: "2026-07-18",
    remainingLabel: "6 Arbeitstage",
    description:
      "Die Rückfrage wurde zugestellt; die Frist läuft, ohne die Bearbeitung zu blockieren.",
    caseReference: "VG-2026-0150",
    ownerLabel: "Service",
    escalation: "none",
  },
  {
    id: "authority-response",
    label: "Stellungnahme Fachstelle",
    status: "paused",
    dueAt: "2026-07-22",
    remainingLabel: "Frist gehemmt",
    description:
      "Die Frist ist pausiert, bis die externe Stellungnahme wieder aufgenommen wird.",
    caseReference: "VG-2026-0152",
    ownerLabel: "Koordination",
    escalation: "external",
  },
  {
    id: "final-notice",
    label: "Bescheidversand",
    status: "met",
    dueAt: "2026-07-05",
    remainingLabel: "abgeschlossen",
    description: "Der Versand wurde dokumentiert und die Frist ist gewahrt.",
    caseReference: "VG-2026-0147",
    ownerLabel: "Poststelle",
    escalation: "none",
  },
];

function DeadlineDemo() {
  const [deadlines, setDeadlines] = useState(BASE_DEADLINES);
  const [selectedDeadlineId, setSelectedDeadlineId] =
    useState("proof-deadline");
  const [status, setStatus] = useState("Fristenübersicht geöffnet.");

  function markMet(id: string) {
    setDeadlines((current) =>
      current.map((deadline) =>
        deadline.id === id
          ? {
              ...deadline,
              status: "met",
              remainingLabel: "gewahrt",
              escalation: "none",
            }
          : deadline,
      ),
    );
    setStatus("Frist wurde als gewahrt markiert.");
  }

  function escalate(id: string) {
    setDeadlines((current) =>
      current.map((deadline) =>
        deadline.id === id
          ? {
              ...deadline,
              escalation: "lead",
              status:
                deadline.status === "met" || deadline.status === "paused"
                  ? deadline.status
                  : "overdue",
            }
          : deadline,
      ),
    );
    setStatus("Eskalationspfad wurde vorbereitet.");
  }

  return (
    <DeadlinePanel
      deadlines={deadlines.map((deadline) => ({
        ...deadline,
        action:
          deadline.status === "met"
            ? {
                label: "Nachweis öffnen",
                onClick: () => setStatus("Fristnachweis geöffnet."),
              }
            : {
                label: "Als gewahrt markieren",
                tone: "primary",
                onClick: () => markMet(deadline.id),
              },
        ...(deadline.status === "met"
          ? {}
          : {
              secondaryAction: {
                label: "Eskalieren",
                tone: deadline.status === "overdue" ? "danger" : "secondary",
                onClick: () => escalate(deadline.id),
              },
            }),
      }))}
      selectedDeadlineId={selectedDeadlineId}
      onSelectDeadline={(deadline: DeadlineItem) => {
        setSelectedDeadlineId(deadline.id);
        setStatus(`${deadline.label} ausgewählt.`);
      }}
      footer={
        <p className="ps-muted" role="status">
          {status}
        </p>
      }
      actions={[
        {
          label: "Überfällige filtern",
          onClick: () => setStatus("Filter für überfällige Fristen gesetzt."),
        },
        {
          label: "Nächste Frist öffnen",
          tone: "primary",
          onClick: () => setStatus("Nächste Frist geöffnet."),
        },
      ]}
    />
  );
}

export const Steuerung: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <DeadlineDemo />
      </div>
    </main>
  ),
};

export const Kritisch: Story = {
  render: () => (
    <main className="sb-page">
      <DeadlinePanel
        title="Kritische Fristen"
        description="Diese Ansicht bündelt Fristen, die nicht ohne Eskalation weiterlaufen sollten."
        deadlines={BASE_DEADLINES.filter(
          (deadline) => deadline.status === "overdue",
        ).map((deadline) => ({
          ...deadline,
          action: {
            label: "Eskalation dokumentieren",
            tone: "danger",
            onClick: () => undefined,
          },
        }))}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <DeadlinePanel deadlines={[]} />
    </main>
  ),
};
