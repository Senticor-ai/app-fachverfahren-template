import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  EvidenceReviewGrid,
  type EvidenceReviewItem,
  type EvidenceReviewStatus,
} from "./evidence.js";

const meta = {
  title: "Public Sector UI/Evidence Review",
  parameters: {
    docs: {
      description: {
        component:
          "Nachweisprüfung für Sachbearbeitung: Status je Nachweis, Quelle, Frist, Konfidenz und klare Aktionen zum Akzeptieren, Ablehnen oder Nachfordern.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ITEMS: EvidenceReviewItem[] = [
  {
    id: "identity",
    label: "Identitätsnachweis",
    source: "aus Anmeldung übernommen",
    status: "accepted",
    description: "Personenbezug ist nachvollziehbar und im Vorgang vermerkt.",
    fileName: "bundid-bestaetigung.pdf",
    confidence: 0.98,
  },
  {
    id: "income",
    label: "Einkommensnachweis",
    source: "hochgeladen durch Antragsteller:in",
    status: "pending",
    description:
      "Die Angaben müssen mit den Beträgen im Antrag abgeglichen werden.",
    fileName: "einkommen-juni.pdf",
    confidence: 0.82,
  },
  {
    id: "rent",
    label: "Mietnachweis",
    source: "fehlt im Antrag",
    status: "missing",
    description:
      "Für die Entscheidung ist ein aktueller Nachweis erforderlich.",
    dueAt: "2026-07-15",
  },
  {
    id: "bank",
    label: "Kontoverbindung",
    source: "OCR-Vorschlag",
    status: "rejected",
    description: "Die erkannte IBAN ist unvollständig.",
    fileName: "kontoauszug.pdf",
    confidence: 0.41,
  },
];

function EvidenceDemo() {
  const [items, setItems] = useState(ITEMS);

  function update(id: string, status: EvidenceReviewStatus) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  return (
    <EvidenceReviewGrid
      items={items}
      onAccept={(id) => update(id, "accepted")}
      onReject={(id) => update(id, "rejected")}
      onRequest={(id) => update(id, "missing")}
      actions={
        <button type="button" className="ps-btn ps-btn--ghost">
          Nachweise exportieren
        </button>
      }
    />
  );
}

export const Pruefung: Story = {
  render: () => (
    <main className="sb-page">
      <EvidenceDemo />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <EvidenceReviewGrid items={[]} />
    </main>
  ),
};

export const Nachforderung: Story = {
  render: () => (
    <main className="sb-page">
      <EvidenceReviewGrid
        title="Nachweise nachfordern"
        description="Fehlende oder unklare Nachweise bleiben sichtbar, bis sie im Vorgang geklärt sind."
        items={ITEMS.filter((item) => item.status !== "accepted")}
        onRequest={() => undefined}
      />
    </main>
  ),
};
