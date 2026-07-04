import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { AssumptionRegisterPanel, type AssumptionItem } from "./assumptions.js";

const meta = {
  title: "Public Sector UI/Assumption Register",
  parameters: {
    docs: {
      description: {
        component:
          "Register für fachliche Annahmen: zeigt Quellenstatus, Auswirkung, Zuständigkeit, Fristen und Blockaden, ohne Annahmen als geltendes Recht auszugeben.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_ASSUMPTIONS: AssumptionItem[] = [
  {
    id: "fee-threshold",
    label: "Gebührenschwelle",
    status: "unverified",
    impact: "blocking",
    summary:
      "Der Wert ist als Annahme erfasst und muss gegen die zuständige Quelle validiert werden.",
    valueLabel: "Annahme: TBD-GEBÜHR-QUELLE",
    sourceLabel: "Quelle offen",
    affectedAreaLabel: "Berechnung",
    ownerLabel: "Fachprüfung",
    dueAt: "2026-07-18",
    details: [
      "Nicht als geltendes Recht anzeigen.",
      "Erst nach Quellenprüfung für finale Berechnung freigeben.",
    ],
  },
  {
    id: "deadline",
    label: "Bearbeitungsfrist",
    status: "in-review",
    impact: "decision",
    summary:
      "Die Frist ist für Kommunikation und Aufgabensteuerung relevant und wird geprüft.",
    valueLabel: "Annahme: TBD-FRIST-QUELLE",
    sourceLabel: "Fachkonzept in Prüfung",
    affectedAreaLabel: "Kommunikation",
    ownerLabel: "Produktverantwortung",
    dueAt: "2026-07-20",
  },
  {
    id: "role",
    label: "Freigaberolle",
    status: "validated",
    impact: "decision",
    summary:
      "Die Rolle ist fachlich bestätigt und kann im Workflow genutzt werden.",
    valueLabel: "Freigabe durch zuständige Prüfung",
    sourceLabel: "Validiertes Fachkonzept",
    affectedAreaLabel: "Übergabe",
    ownerLabel: "Teamleitung",
  },
  {
    id: "optional-note",
    label: "Hinweistext",
    status: "unverified",
    impact: "info",
    summary:
      "Der Text verbessert Orientierung, blockiert aber keine Entscheidung.",
    valueLabel: "Annahme: neutraler Hilfetext",
    sourceLabel: "UX-Review offen",
    affectedAreaLabel: "Bürgerportal",
  },
];

function AssumptionRegisterDemo() {
  const [assumptions, setAssumptions] = useState(BASE_ASSUMPTIONS);
  const [status, setStatus] = useState("Annahmenregister geöffnet.");

  function setAssumptionStatus(
    id: string,
    nextStatus: AssumptionItem["status"],
  ) {
    setAssumptions((current) =>
      current.map((assumption) =>
        assumption.id === id
          ? {
              ...assumption,
              status: nextStatus,
              ...(nextStatus === "validated"
                ? { sourceLabel: "Validierte Quelle" }
                : {}),
            }
          : assumption,
      ),
    );
    setStatus("Annahmenstatus aktualisiert.");
  }

  return (
    <AssumptionRegisterPanel
      assumptions={assumptions.map((assumption) => ({
        ...assumption,
        ...(assumption.status === "validated"
          ? {
              secondaryAction: {
                label: "Quelle öffnen",
                onClick: () => setStatus(`${assumption.label} geöffnet.`),
              },
            }
          : {
              action: {
                label: "Als validiert markieren",
                tone: "primary",
                onClick: () => setAssumptionStatus(assumption.id, "validated"),
              },
              secondaryAction: {
                label: "Als nicht verwendbar markieren",
                tone: "danger",
                onClick: () => setAssumptionStatus(assumption.id, "invalid"),
              },
            }),
      }))}
      footer={
        <p className="ps-muted" role="status">
          {status}
        </p>
      }
      actions={[
        {
          label: "Validierungsfragen exportieren",
          onClick: () => setStatus("Validierungsfragen wurden vorgemerkt."),
        },
        {
          label: "Freigabe vorbereiten",
          tone: "primary",
          disabled: assumptions.some(
            (assumption) =>
              assumption.impact === "blocking" &&
              assumption.status !== "validated",
          ),
          onClick: () => setStatus("Freigabe kann vorbereitet werden."),
        },
      ]}
    />
  );
}

export const Register: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <AssumptionRegisterDemo />
      </div>
    </main>
  ),
};

export const Validiert: Story = {
  render: () => (
    <main className="sb-page">
      <AssumptionRegisterPanel
        assumptions={BASE_ASSUMPTIONS.map((assumption) => ({
          ...assumption,
          status: "validated",
          sourceLabel: "Validierte Quelle",
        }))}
        actions={[
          {
            label: "Freigabe vorbereiten",
            tone: "primary",
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
      <AssumptionRegisterPanel assumptions={[]} />
    </main>
  ),
};
