import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { HandoffPanel, type HandoffStatus } from "./handoff.js";

const meta = {
  title: "Public Sector UI/Handoff",
  parameters: {
    docs: {
      description: {
        component:
          "Übergabe- und Freigabebaustein für Fachverfahren: Verantwortung, Fristen, Anforderungen, Prüfschritte und Audit-Hinweise werden fachneutral sichtbar.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function HandoffDemo() {
  const [status, setStatus] = useState<HandoffStatus>("requested");
  const [message, setMessage] = useState("Übergabe angefragt.");

  return (
    <HandoffPanel
      status={status}
      subjectLabel="Vorgang VG-2026-0162"
      from={{
        label: "Sachbearbeitung",
        roleLabel: "Bearbeitung",
        unitLabel: "Leistungsstelle",
      }}
      to={{
        label: "Prüfteam",
        roleLabel: "Vier-Augen-Prüfung",
        unitLabel: "Freigabe",
      }}
      requestedAt="2026-07-14"
      dueAt="2026-07-18"
      reason="Der Vorgang enthält einen kritischen Übergang und wird vor der Entscheidung gegengeprüft."
      requirements={[
        "Entscheidungsvorschlag ist als Entwurf dokumentiert.",
        "Offene Nachweise sind bewertet oder nachgefordert.",
        "Berechnung und Begründung sind nachvollziehbar.",
      ]}
      steps={[
        {
          id: "prepare",
          label: "Übergabe vorbereitet",
          status: "done",
          description: "Aktenkopf, Berechnung und Nachweise liegen vor.",
          at: "2026-07-14",
        },
        {
          id: "review",
          label: "Gegenprüfung",
          status: status === "blocked" ? "blocked" : "current",
          description:
            status === "blocked"
              ? "Die Gegenprüfung wartet auf eine fehlende Klärung."
              : "Das Prüfteam bewertet die Übergabe.",
          at: "2026-07-15",
        },
        {
          id: "accept",
          label: "Übernahme bestätigen",
          status: status === "accepted" ? "done" : "open",
          description:
            "Nach Bestätigung kann die Entscheidung vorbereitet werden.",
        },
      ]}
      auditNote={
        <p>
          Jede Übergabeaktion wird im Vorgang protokolliert. Die UI ersetzt
          keine serverseitige Autorisierung.
        </p>
      }
      footer={
        <p className="ps-muted" role="status">
          {message}
        </p>
      }
      secondaryActions={[
        {
          label: "Rückfrage stellen",
          onClick: () => {
            setStatus("returned");
            setMessage("Übergabe wurde zur Klärung zurückgegeben.");
          },
        },
        {
          label: "Blockade markieren",
          tone: "danger",
          onClick: () => {
            setStatus("blocked");
            setMessage("Blockade wurde markiert.");
          },
        },
      ]}
      primaryAction={{
        label: "Übergabe übernehmen",
        tone: "primary",
        disabled: status === "blocked",
        onClick: () => {
          setStatus("accepted");
          setMessage("Übergabe wurde übernommen.");
        },
      }}
    />
  );
}

export const Uebergabe: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <HandoffDemo />
      </div>
    </main>
  ),
};

export const Zurueckgegeben: Story = {
  render: () => (
    <main className="sb-page">
      <HandoffPanel
        status="returned"
        subjectLabel="Vorgang VG-2026-0171"
        from={{
          label: "Aufsicht",
          roleLabel: "Prüfung",
        }}
        to={{
          label: "Sachbearbeitung",
          roleLabel: "Korrektur",
        }}
        requestedAt="2026-07-16"
        dueAt="2026-07-20"
        reason="Die Übergabe wurde zurückgegeben, weil eine Begründung präzisiert werden muss."
        requirements={[
          "Begründung ergänzen.",
          "Änderung vor erneuter Übergabe dokumentieren.",
        ]}
        steps={[
          {
            id: "returned",
            label: "Zurückgegeben",
            status: "current",
            description: "Die Korrektur liegt wieder bei der Sachbearbeitung.",
          },
          {
            id: "resubmit",
            label: "Erneut übergeben",
            status: "open",
          },
        ]}
        primaryAction={{
          label: "Korrektur öffnen",
          tone: "primary",
          onClick: () => undefined,
        }}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <HandoffPanel
        status="draft"
        subjectLabel="Vorgang ohne aktive Übergabe"
        from={{
          label: "Sachbearbeitung",
          roleLabel: "Bearbeitung",
        }}
        to={{
          label: "Prüfung",
          roleLabel: "Freigabe",
        }}
        primaryAction={{
          label: "Übergabe vorbereiten",
          tone: "primary",
          onClick: () => undefined,
        }}
      />
    </main>
  ),
};
