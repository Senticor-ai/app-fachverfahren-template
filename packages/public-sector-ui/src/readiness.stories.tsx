import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ReadinessGatePanel, type ReadinessGate } from "./readiness.js";

const meta = {
  title: "Public Sector UI/Readiness Gates",
  parameters: {
    docs: {
      description: {
        component:
          "Prüfstand für Fachverfahren: fachliche Gates zeigen, ob Nachweise, Berechnung, Kommunikation und Vier-Augen-Prüfung entscheidungsreif sind.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_GATES: ReadinessGate[] = [
  {
    id: "identity",
    label: "Identität und Zuständigkeit",
    tone: "pass",
    summary: "Die Angaben sind geprüft und dem Vorgang zugeordnet.",
    ownerLabel: "Sachbearbeitung",
    details: ["Zuständigkeit bestätigt", "Registerabgleich dokumentiert"],
  },
  {
    id: "evidence",
    label: "Nachweise",
    tone: "review",
    summary: "Ein eingereichter Nachweis muss noch freigegeben werden.",
    ownerLabel: "Prüfteam",
    dueAt: "2026-07-15",
    details: ["Nachweis liegt vor", "Freigabe steht aus"],
  },
  {
    id: "calculation",
    label: "Berechnung",
    tone: "pass",
    summary: "Die Berechnung ist nachvollziehbar dokumentiert.",
    ownerLabel: "Sachbearbeitung",
  },
  {
    id: "four-eyes",
    label: "Vier-Augen-Prüfung",
    tone: "block",
    summary: "Die Gegenprüfung fehlt und blockiert die Entscheidung.",
    ownerLabel: "Freigabe",
    dueAt: "2026-07-18",
    details: ["Kritischer Übergang", "Zweite Prüfung erforderlich"],
  },
];

function GateDemo() {
  const [gates, setGates] = useState(BASE_GATES);
  const [status, setStatus] = useState("Prüfstand geöffnet.");

  function setGatePass(id: string) {
    setGates((current) =>
      current.map((gate) =>
        gate.id === id
          ? {
              ...gate,
              tone: "pass",
              summary: "Der Prüfpunkt wurde abgeschlossen.",
            }
          : gate,
      ),
    );
    setStatus("Prüfpunkt abgeschlossen.");
  }

  return (
    <ReadinessGatePanel
      gates={gates.map((gate) =>
        gate.tone === "pass"
          ? gate
          : {
              ...gate,
              action: {
                label:
                  gate.tone === "block"
                    ? "Gegenprüfung anfordern"
                    : "Prüfpunkt abschließen",
                onClick: () => setGatePass(gate.id),
              },
            },
      )}
      footer={
        <>
          <p>
            Der Prüfstand fasst nur den fachlichen Status zusammen. Verbindliche
            Autorisierung bleibt serverseitige Aufgabe.
          </p>
          <p className="ps-muted" role="status">
            {status}
          </p>
        </>
      }
      actions={[
        {
          label: "Entscheidung vorbereiten",
          tone: "primary",
          disabled: gates.some((gate) => gate.tone !== "pass"),
          onClick: () => setStatus("Entscheidung kann vorbereitet werden."),
        },
      ]}
    />
  );
}

export const Pruefstand: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <GateDemo />
      </div>
    </main>
  ),
};

export const Entscheidungsreif: Story = {
  render: () => (
    <main className="sb-page">
      <ReadinessGatePanel
        gates={BASE_GATES.map((gate) => ({
          ...gate,
          tone: "pass",
          summary: "Der Prüfpunkt ist erfüllt.",
        }))}
        actions={[
          {
            label: "Zur Entscheidung geben",
            tone: "primary",
            onClick: () => undefined,
          },
        ]}
      />
    </main>
  ),
};

export const Blockiert: Story = {
  render: () => (
    <main className="sb-page">
      <ReadinessGatePanel
        title="Blockierende Prüfpunkte"
        description="Diese Ansicht zeigt nur Gates, die eine Entscheidung verhindern."
        gates={BASE_GATES.filter((gate) => gate.tone === "block")}
        actions={[
          {
            label: "Nachforderung vorbereiten",
            onClick: () => undefined,
          },
        ]}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <ReadinessGatePanel gates={[]} />
    </main>
  ),
};
