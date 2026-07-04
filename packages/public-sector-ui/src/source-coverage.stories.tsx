import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  SourceCoveragePanel,
  type SourceCoverageItem,
} from "./source-coverage.js";

const meta = {
  title: "Public Sector UI/Source Coverage",
  parameters: {
    docs: {
      description: {
        component:
          "Quellenabdeckung für agentisch erzeugte Fachverfahren: zeigt, welche Anforderungen belegt, offen, veraltet oder widersprüchlich sind.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_SOURCES: SourceCoverageItem[] = [
  {
    id: "scope",
    label: "Leistungsumfang",
    status: "covered",
    summary: "Die Abgrenzung ist durch eine validierte Fachquelle belegt.",
    requirementId: "REQ-SCOPE-001",
    sourceLabel: "Validiertes Fachkonzept",
    sourceTypeLabel: "Fachdokument",
    affectedAreaLabel: "Antragsstrecke",
    ownerLabel: "Produktverantwortung",
    lastCheckedAt: "2026-07-12",
  },
  {
    id: "fee-rule",
    label: "Berechnungsregel",
    status: "missing",
    summary:
      "Die Regel darf noch nicht final verwendet werden, weil die belastbare Quelle fehlt.",
    requirementId: "REQ-CALC-002",
    sourceLabel: "TBD-QUELLE",
    sourceTypeLabel: "Zu validieren",
    affectedAreaLabel: "Berechnung",
    ownerLabel: "Fachprüfung",
    details: [
      "Nicht als geltende Regel anzeigen.",
      "Offene Quelle mit Annahmenregister verknüpfen.",
    ],
  },
  {
    id: "deadline",
    label: "Fristenlogik",
    status: "review",
    summary: "Die Quelle liegt vor und braucht eine fachliche Gegenprüfung.",
    requirementId: "REQ-DEADLINE-003",
    sourceLabel: "Fachkonzept-Entwurf",
    sourceTypeLabel: "Entwurf",
    affectedAreaLabel: "Kommunikation",
    ownerLabel: "Review",
    lastCheckedAt: "2026-07-10",
  },
  {
    id: "notification",
    label: "Benachrichtigungstext",
    status: "stale",
    summary: "Die Quelle ist älter als der aktuelle Fachkonzeptstand.",
    requirementId: "REQ-COMMS-004",
    sourceLabel: "Ältere Abstimmungsnotiz",
    sourceTypeLabel: "Notiz",
    affectedAreaLabel: "Postfach",
    ownerLabel: "Redaktion",
    lastCheckedAt: "2026-02-01",
  },
  {
    id: "handoff",
    label: "Freigabeweg",
    status: "conflict",
    summary:
      "Zwei Quellen beschreiben unterschiedliche Zuständigkeiten und müssen geklärt werden.",
    requirementId: "REQ-HANDOFF-005",
    sourceLabel: "Fachkonzept und Review-Notiz",
    sourceTypeLabel: "Konflikt",
    affectedAreaLabel: "Übergabe",
    ownerLabel: "Teamleitung",
  },
];

function SourceCoverageDemo() {
  const [sources, setSources] = useState(BASE_SOURCES);
  const [status, setStatus] = useState("Quellenabdeckung geöffnet.");

  function setSourceStatus(
    id: string,
    nextStatus: SourceCoverageItem["status"],
  ) {
    setSources((current) =>
      current.map((source) =>
        source.id === id
          ? {
              ...source,
              status: nextStatus,
              ...(nextStatus === "covered"
                ? {
                    sourceLabel: "Validierte Quelle",
                    sourceTypeLabel: "Fachdokument",
                    lastCheckedAt: "2026-07-16",
                  }
                : {}),
            }
          : source,
      ),
    );
    setStatus("Quellenstatus aktualisiert.");
  }

  return (
    <SourceCoveragePanel
      sources={sources.map((source) => ({
        ...source,
        ...(source.status === "covered"
          ? {
              secondaryAction: {
                label: "Quelle öffnen",
                onClick: () => setStatus(`${source.label} geöffnet.`),
              },
            }
          : {
              action: {
                label: "Als belegt markieren",
                tone: "primary",
                onClick: () => setSourceStatus(source.id, "covered"),
              },
              secondaryAction: {
                label: "Klärung anfordern",
                tone: source.status === "conflict" ? "danger" : "secondary",
                onClick: () => setStatus("Klärung wurde vorgemerkt."),
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
          label: "Quellenbericht exportieren",
          onClick: () => setStatus("Quellenbericht wurde vorgemerkt."),
        },
        {
          label: "Freigabe vorbereiten",
          tone: "primary",
          disabled: sources.some((source) =>
            ["missing", "stale", "conflict"].includes(source.status),
          ),
          onClick: () => setStatus("Freigabe kann vorbereitet werden."),
        },
      ]}
    />
  );
}

export const Abdeckung: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <SourceCoverageDemo />
      </div>
    </main>
  ),
};

export const Belegt: Story = {
  render: () => (
    <main className="sb-page">
      <SourceCoveragePanel
        sources={BASE_SOURCES.map((source) => ({
          ...source,
          status: "covered",
          sourceLabel: "Validierte Quelle",
          sourceTypeLabel: "Fachdokument",
          lastCheckedAt: "2026-07-16",
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
      <SourceCoveragePanel sources={[]} />
    </main>
  ),
};
