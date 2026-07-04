import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { CaseContextPanel } from "./case-context.js";

const meta = {
  title: "Public Sector UI/Case Context",
  parameters: {
    docs: {
      description: {
        component:
          "Kompakter Aktenkopf für Fachverfahren: Vorgangs-ID, Status, Antragsteller:in, Phase, Zuständigkeit, Fristen, Signale und nächste Aktion.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vorgangskopf: Story = {
  render: () => {
    const [status, setStatus] = useState("Kontext geöffnet.");

    return (
      <main className="sb-page">
        <div className="sb-stack">
          <CaseContextPanel
            caseId="VG-2026-0148"
            title="Prüfung vorbereiten"
            subtitle="Der Vorgang ist fachlich vollständig genug für die nächste Prüfung."
            applicantLabel="Antragsteller:in · ID 4821"
            status={{ label: "In Prüfung", tone: "warning" }}
            ownerLabel="Sachbearbeitung"
            phaseLabel="Nachweise prüfen"
            receivedAt="2026-07-01"
            dueAt="2026-07-18"
            facts={[
              {
                id: "service",
                label: "Leistung",
                value: "Fachverfahren",
              },
              {
                id: "channel",
                label: "Eingangskanal",
                value: "Online",
                hint: "über Postfach bestätigt",
              },
            ]}
            signals={[
              {
                id: "evidence",
                label: "Nachweise",
                value: "1 offen",
                tone: "warning",
                description: "Ein eingereichter Nachweis wartet auf Freigabe.",
              },
              {
                id: "calculation",
                label: "Berechnung",
                value: "plausibel",
                tone: "success",
              },
              {
                id: "communication",
                label: "Kommunikation",
                value: "Antwort eingegangen",
                tone: "neutral",
              },
            ]}
            nextStep="Nachweis freigeben und Entscheidungsreife erneut prüfen."
            actions={[
              {
                id: "open-evidence",
                label: "Nachweise öffnen",
                onClick: () => setStatus("Nachweise geöffnet."),
              },
              {
                id: "prepare",
                label: "Entscheidung vorbereiten",
                tone: "primary",
                onClick: () => setStatus("Entscheidung wird vorbereitet."),
              },
            ]}
          />
          <p className="ps-muted" role="status">
            {status}
          </p>
        </div>
      </main>
    );
  },
};

export const Kritisch: Story = {
  render: () => (
    <main className="sb-page">
      <CaseContextPanel
        caseId="VG-2026-0199"
        title="Fristkritischer Vorgang"
        applicantLabel="Antragsteller:in · ID 9012"
        status={{ label: "Fristkritisch", tone: "critical" }}
        ownerLabel="Vertretung"
        phaseLabel="Nachforderung"
        receivedAt="2026-06-20"
        dueAt="2026-07-05"
        signals={[
          {
            id: "deadline",
            label: "Frist",
            value: "kritisch",
            tone: "critical",
            description: "Die Bearbeitungsfrist ist kurzfristig zu prüfen.",
          },
          {
            id: "missing",
            label: "Unterlagen",
            value: "fehlend",
            tone: "warning",
          },
        ]}
        nextStep="Nachforderung prüfen und Fristentscheidung dokumentieren."
        actions={[
          {
            id: "request",
            label: "Nachforderung vorbereiten",
            tone: "primary",
            onClick: () => undefined,
          },
        ]}
      />
    </main>
  ),
};

export const Minimal: Story = {
  render: () => (
    <main className="sb-page">
      <CaseContextPanel
        caseId="VG-2026-0001"
        title="Vorgang"
        applicantLabel="Antragsteller:in"
        status={{ label: "Neu" }}
      />
    </main>
  ),
};
