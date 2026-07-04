import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DecisionComposer, type DecisionRequirement } from "./decision.js";

const meta = {
  title: "Public Sector UI/Decision Composer",
  parameters: {
    docs: {
      description: {
        component:
          "Entscheidungsfläche für Sachbearbeitung: Ergebnis, Prüfpunkte, Auflagen, Rechtsgrundlagen, Begründung, Vier-Augen-Hinweis und auditierbare Aktionen in einem generischen Baustein.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const REQUIREMENTS: DecisionRequirement[] = [
  {
    id: "identity",
    label: "Identität und Zuständigkeit geprüft",
    status: "met",
    note: "Die Zuständigkeit wurde aus den Antragsdaten bestätigt.",
  },
  {
    id: "evidence",
    label: "Erforderliche Nachweise liegen vor",
    status: "met",
    note: "Alle Pflichtnachweise wurden im Vorgang akzeptiert.",
  },
  {
    id: "calculation",
    label: "Berechnung nachvollziehbar",
    status: "open",
    note: "Die manuelle Begründung muss noch ergänzt werden.",
  },
];

function DecisionDemo() {
  const [reason, setReason] = useState(
    "Die Voraussetzungen sind nach Aktenlage erfüllt. Die Entscheidung folgt den dokumentierten Prüfpunkten und der vorliegenden Berechnung.",
  );
  const [saved, setSaved] = useState(false);

  return (
    <div className="sb-stack">
      <DecisionComposer
        outcome="approved"
        decisionLabel="Bewilligung mit Auflage"
        summary="Der Vorgang kann vorbereitet werden; eine Nachreichung bleibt als Auflage im Bescheid sichtbar."
        requirements={REQUIREMENTS}
        conditions={[
          {
            id: "follow-up",
            label: "Nachweis aktualisieren",
            description:
              "Der aktualisierte Nachweis ist innerhalb der gesetzten Frist nachzureichen.",
          },
        ]}
        legalBasis={[
          "Mustergesetz § 2 Abs. 1",
          "Verwaltungsvorschrift, Ziff. 4.3",
        ]}
        reasonDraft={reason}
        onReasonDraftChange={(value) => {
          setReason(value);
          setSaved(false);
        }}
        auditNote={
          <p>
            Änderungen an Begründung und Entscheidung werden im Audit-Trail des
            Vorgangs vermerkt.
          </p>
        }
        secondaryActions={[
          {
            id: "save",
            label: "Entwurf speichern",
            onClick: () => setSaved(true),
          },
        ]}
        primaryAction={{
          id: "submit",
          label: "Zur Freigabe geben",
          tone: "primary",
          disabled: reason.trim().length < 24,
          onClick: () => setSaved(true),
        }}
      />
      <p className="ps-muted" role="status">
        {saved
          ? "Entwurf gespeichert."
          : "Noch nicht gespeichert — Begründung prüfen."}
      </p>
    </div>
  );
}

export const Vorbereitung: Story = {
  render: () => (
    <main className="sb-page">
      <DecisionDemo />
    </main>
  ),
};

export const VierAugenPruefung: Story = {
  render: () => (
    <main className="sb-page">
      <DecisionComposer
        title="Kritische Entscheidung vorbereiten"
        outcome="partially-approved"
        decisionLabel="Teilbewilligung"
        summary="Ein Teil der beantragten Leistung ist entscheidungsreif; ein Teil bleibt wegen unklarer Unterlagen offen."
        gateStatus="needs-review"
        requirements={[
          ...REQUIREMENTS.slice(0, 2),
          {
            id: "second-review",
            label: "Vier-Augen-Prüfung erforderlich",
            status: "open",
            note: "Die zweite Prüfung muss vor dem Versand dokumentiert sein.",
          },
        ]}
        reasonDraft="Die Teilbewilligung ist nach Aktenlage vertretbar. Der offene Teil wird erst nach Klärung der Nachweise entschieden."
        auditNote={
          <p>
            Vier-Augen-Entscheidungen dürfen erst nach dokumentierter
            Gegenprüfung abgeschlossen werden.
          </p>
        }
        primaryAction={{
          id: "request-review",
          label: "Gegenprüfung anfordern",
          tone: "primary",
          onClick: () => undefined,
        }}
      />
    </main>
  ),
};

export const Blockiert: Story = {
  render: () => (
    <main className="sb-page">
      <DecisionComposer
        outcome="deferred"
        decisionLabel="Entscheidung zurückgestellt"
        summary="Der Vorgang ist noch nicht entscheidungsreif, weil ein blockierender Prüfpunkt offen ist."
        gateStatus="blocked"
        requirements={[
          {
            id: "missing-evidence",
            label: "Pflichtnachweis vollständig",
            status: "blocked",
            note: "Der Nachweis fehlt und muss nachgefordert werden.",
          },
        ]}
        legalBasis={["Mustergesetz § 7 Abs. 2"]}
        reasonDraft="Eine Entscheidung ist ohne den Pflichtnachweis nicht möglich. Der Vorgang wird bis zum Eingang der Unterlagen zurückgestellt."
        secondaryActions={[
          {
            id: "request",
            label: "Nachforderung vorbereiten",
            onClick: () => undefined,
          },
        ]}
        primaryAction={{
          id: "submit",
          label: "Entscheiden",
          tone: "primary",
          disabled: true,
          onClick: () => undefined,
        }}
      />
    </main>
  ),
};
