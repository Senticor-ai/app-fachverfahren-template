import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  DocumentChecklistPanel,
  type DocumentChecklistItem,
} from "./documents.js";

const meta = {
  title: "Public Sector UI/Document Checklist",
  parameters: {
    docs: {
      description: {
        component:
          "Fachneutrale Dokumenten-Checkliste für Vollständigkeit, Pflichtunterlagen, Quellen, Eingangsdatum und Gültigkeit vor der fachlichen Nachweisprüfung.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const BASE_DOCUMENTS: DocumentChecklistItem[] = [
  {
    id: "application",
    label: "Antragsformular",
    requirement: "required",
    status: "available",
    description:
      "Der Antrag liegt unterschrieben oder elektronisch bestätigt vor.",
    sourceLabel: "Online-Antrag",
    fileName: "antrag.pdf",
    receivedAt: "2026-07-14",
  },
  {
    id: "identity",
    label: "Identitätsnachweis",
    requirement: "required",
    status: "review",
    description:
      "Der Nachweis ist vorhanden und muss der Akte zugeordnet werden.",
    sourceLabel: "Postfach",
    fileName: "identitaet.pdf",
    receivedAt: "2026-07-14",
  },
  {
    id: "eligibility",
    label: "Fachlicher Nachweis",
    requirement: "required",
    status: "missing",
    description: "Die Pflichtunterlage fehlt und muss nachgefordert werden.",
    sourceLabel: "Antragstellerin",
    validUntil: "2026-08-15",
  },
  {
    id: "older-proof",
    label: "Älterer Nachweis",
    requirement: "optional",
    status: "expired",
    description:
      "Das Dokument liegt vor, ist aber für die aktuelle Prüfung zu alt.",
    sourceLabel: "Akte",
    fileName: "nachweis-alt.pdf",
    receivedAt: "2025-09-30",
    validUntil: "2026-01-31",
  },
];

function DocumentChecklistDemo() {
  const [documents, setDocuments] = useState(BASE_DOCUMENTS);
  const [status, setStatus] = useState("Dokumentenliste geöffnet.");

  function setDocumentStatus(
    id: string,
    nextStatus: DocumentChecklistItem["status"],
  ) {
    setDocuments((current) =>
      current.map((document) =>
        document.id === id
          ? {
              ...document,
              status: nextStatus,
              ...(nextStatus === "available" && !document.receivedAt
                ? { receivedAt: "2026-07-16" }
                : {}),
            }
          : document,
      ),
    );
    setStatus("Dokumentstatus aktualisiert.");
  }

  return (
    <DocumentChecklistPanel
      documents={documents.map((document) => ({
        ...document,
        ...(document.status === "available"
          ? {
              secondaryAction: {
                label: "Details öffnen",
                onClick: () => setStatus(`${document.label} geöffnet.`),
              },
            }
          : {}),
        ...(document.status === "review"
          ? {
              action: {
                label: "Als vorhanden markieren",
                tone: "primary",
                onClick: () => setDocumentStatus(document.id, "available"),
              },
            }
          : {}),
        ...(document.status === "missing"
          ? {
              action: {
                label: "Nachfordern",
                tone: "primary",
                onClick: () => setStatus("Nachforderung vorbereitet."),
              },
              secondaryAction: {
                label: "Eingang erfassen",
                onClick: () => setDocumentStatus(document.id, "available"),
              },
            }
          : {}),
        ...(document.status === "expired"
          ? {
              action: {
                label: "Aktualisierung anfordern",
                tone: "danger",
                onClick: () => setStatus("Aktualisierung angefordert."),
              },
            }
          : {}),
      }))}
      footer={
        <p className="ps-muted" role="status">
          {status}
        </p>
      }
      actions={[
        {
          label: "Nachforderung vorbereiten",
          onClick: () => setStatus("Nachforderung vorbereitet."),
        },
        {
          label: "Zur Prüfung geben",
          tone: "primary",
          disabled: documents.some((document) =>
            ["missing", "expired"].includes(document.status),
          ),
          onClick: () => setStatus("Dokumente können geprüft werden."),
        },
      ]}
    />
  );
}

export const Checkliste: Story = {
  render: () => (
    <main className="sb-page">
      <div className="sb-stack">
        <DocumentChecklistDemo />
      </div>
    </main>
  ),
};

export const Vollstaendig: Story = {
  render: () => (
    <main className="sb-page">
      <DocumentChecklistPanel
        documents={BASE_DOCUMENTS.map((document) => ({
          ...document,
          status: "available",
          receivedAt: document.receivedAt ?? "2026-07-16",
        }))}
        actions={[
          {
            label: "Nachweise prüfen",
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
      <DocumentChecklistPanel documents={[]} />
    </main>
  ),
};
