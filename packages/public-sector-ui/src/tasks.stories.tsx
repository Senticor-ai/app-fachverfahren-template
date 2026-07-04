import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { TaskQueuePanel, type TaskQueueItem } from "./tasks.js";

const meta = {
  title: "Public Sector UI/Task Queue",
  parameters: {
    docs: {
      description: {
        component:
          "Generische Aufgabensteuerung für Fachverfahren: nächste Handlungen, Zuständigkeiten, Prioritäten, Fristen und blockierte Arbeitsschritte.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_TASKS: TaskQueueItem[] = [
  {
    id: "review-evidence",
    title: "Nachweis fachlich prüfen",
    status: "open",
    priority: "urgent",
    description:
      "Der Vorgang wartet auf eine fachliche Bewertung eines eingereichten Nachweises.",
    caseReference: "VG-2026-0148",
    groupLabel: "Nachweise",
    ownerLabel: "Prüfteam",
    dueAt: "2026-07-15",
    requirementLabel: "Freigabe oder Nachforderung dokumentieren",
    tags: ["Nachweis", "Frist"],
  },
  {
    id: "clarify-calculation",
    title: "Berechnung nachvollziehen",
    status: "in-progress",
    priority: "normal",
    description:
      "Die Herleitung ist vorbereitet und braucht eine letzte Plausibilitätsprüfung.",
    caseReference: "VG-2026-0149",
    groupLabel: "Berechnung",
    ownerLabel: "Sachbearbeitung",
    dueAt: "2026-07-18",
    tags: ["Berechnung"],
  },
  {
    id: "four-eyes",
    title: "Vier-Augen-Prüfung anfordern",
    status: "blocked",
    priority: "critical",
    description:
      "Der kritische Übergang ist gesperrt, bis eine zweite Person gegengeprüft hat.",
    caseReference: "VG-2026-0151",
    groupLabel: "Freigabe",
    ownerLabel: "Teamleitung",
    dueAt: "2026-07-16",
    requirementLabel: "Gegenprüfung fehlt",
    tags: ["Blockiert", "Freigabe"],
  },
  {
    id: "send-message",
    title: "Antwort vorbereiten",
    status: "done",
    priority: "normal",
    description: "Die Rückfrage wurde beantwortet und im Vorgang abgelegt.",
    caseReference: "VG-2026-0150",
    groupLabel: "Kommunikation",
    ownerLabel: "Service",
    dueAt: "2026-07-12",
  },
];

function TaskQueueDemo() {
  const [tasks, setTasks] = useState(BASE_TASKS);
  const [selectedTaskId, setSelectedTaskId] = useState("review-evidence");
  const [status, setStatus] = useState("Arbeitsliste geöffnet.");

  function completeTask(id: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              status: "done",
              description: "Die Aufgabe wurde abgeschlossen.",
            }
          : task,
      ),
    );
    setStatus("Aufgabe abgeschlossen.");
  }

  function unblockTask(id: string) {
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              status: "open",
              priority: "urgent",
              description: "Die Aufgabe ist wieder bearbeitbar.",
            }
          : task,
      ),
    );
    setStatus("Blockade wurde gelöst.");
  }

  return (
    <TaskQueuePanel
      tasks={tasks.map((task) => ({
        ...task,
        action:
          task.status === "blocked"
            ? {
                label: "Blockade lösen",
                tone: "primary",
                onClick: () => unblockTask(task.id),
              }
            : {
                label:
                  task.status === "done"
                    ? "Abschluss öffnen"
                    : "Aufgabe erledigen",
                tone: task.status === "done" ? "secondary" : "primary",
                onClick: () => completeTask(task.id),
              },
        ...(task.status === "done"
          ? {}
          : {
              secondaryAction: {
                label: "Zurückstellen",
                onClick: () => setStatus("Aufgabe wurde zurückgestellt."),
              },
            }),
      }))}
      selectedTaskId={selectedTaskId}
      onSelectTask={(task) => {
        setSelectedTaskId(task.id);
        setStatus(`${task.title} ausgewählt.`);
      }}
      footer={
        <p className="ps-muted" role="status">
          {status}
        </p>
      }
      actions={[
        {
          label: "Meine Aufgaben filtern",
          onClick: () => setStatus("Filter wurde angewendet."),
        },
        {
          label: "Nächste Aufgabe öffnen",
          tone: "primary",
          onClick: () => setStatus("Nächste Aufgabe geöffnet."),
        },
      ]}
    />
  );
}

export const Arbeitsliste: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <TaskQueueDemo />
      </div>
    </main>
  ),
};

export const Blockiert: Story = {
  render: () => (
    <main className="sb-page">
      <TaskQueuePanel
        title="Blockierte Aufgaben"
        description="Diese Ansicht bündelt Arbeitsschritte, die ohne Klärung nicht weiterlaufen."
        tasks={BASE_TASKS.filter((task) => task.status === "blocked").map(
          (task) => ({
            ...task,
            action: {
              label: "Eskalation vorbereiten",
              tone: "danger",
              onClick: () => undefined,
            },
          }),
        )}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <TaskQueuePanel tasks={[]} />
    </main>
  ),
};
