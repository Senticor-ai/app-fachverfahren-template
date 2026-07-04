import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  CommunicationThread,
  type CommunicationMessage,
} from "./communication.js";

const meta = {
  title: "Public Sector UI/Communication Thread",
  parameters: {
    docs: {
      description: {
        component:
          "Kommunikationsfläche für Fachverfahren: Nachrichten, Nachforderungen, Fristen, Anhänge und Entwürfe werden fachneutral und barrierefrei im Vorgang dargestellt.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const MESSAGES: CommunicationMessage[] = [
  {
    id: "request-1",
    subject: "Nachforderung Unterlage",
    body: "Für die weitere Prüfung wird eine aktuelle Unterlage benötigt. Bitte reichen Sie die Unterlage fristgerecht nach.",
    authorLabel: "Sachbearbeitung",
    at: "2026-07-01 09:30",
    direction: "outbound",
    status: "sent",
    kind: "request",
    channelLabel: "Postfach",
    dueAt: "2026-07-15",
    attachments: [{ id: "template", label: "Nachforderung.pdf" }],
  },
  {
    id: "reply-1",
    subject: "Unterlage nachgereicht",
    body: "Die angeforderte Unterlage wurde hochgeladen. Bitte prüfen Sie, ob weitere Angaben erforderlich sind.",
    authorLabel: "Antragsteller:in",
    at: "2026-07-03 14:10",
    direction: "inbound",
    status: "unread",
    kind: "message",
    channelLabel: "Online-Postfach",
    attachments: [{ id: "proof", label: "unterlage.pdf", href: "#" }],
  },
  {
    id: "internal-1",
    subject: "Interner Prüfhinweis",
    body: "Die eingereichte Unterlage sollte mit dem Nachweisraster abgeglichen werden.",
    authorLabel: "Prüfteam",
    at: "2026-07-03 15:25",
    direction: "internal",
    status: "read",
    kind: "notice",
  },
];

function CommunicationDemo() {
  const [messages, setMessages] = useState(MESSAGES);
  const [subject, setSubject] = useState("Antwort auf Nachreichung");
  const [body, setBody] = useState(
    "Vielen Dank. Die Unterlage wird geprüft; Sie erhalten eine Rückmeldung im Postfach.",
  );
  const [dueAt, setDueAt] = useState("2026-07-18");
  const [status, setStatus] = useState("Entwurf noch nicht gesendet.");

  function markRead(id: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, status: "read" } : message,
      ),
    );
    setStatus("Nachricht als gelesen markiert.");
  }

  return (
    <CommunicationThread
      messages={messages}
      onMarkRead={markRead}
      onReply={(id) => setSubject(`Antwort zu ${id}`)}
      draft={{
        subject,
        body,
        dueAt,
        statusLabel: status,
        submitLabel: "Entwurf senden",
        disabled: subject.trim().length < 3 || body.trim().length < 12,
        onSubjectChange: setSubject,
        onBodyChange: setBody,
        onDueAtChange: setDueAt,
        onSubmit: () => setStatus("Entwurf wurde zum Versand vorgemerkt."),
      }}
    />
  );
}

export const Vorgangskommunikation: Story = {
  render: () => (
    <main className="sb-page">
      <CommunicationDemo />
    </main>
  ),
};

export const NurTimeline: Story = {
  render: () => (
    <main className="sb-page">
      <CommunicationThread
        title="Kommunikationsverlauf"
        description="Read-only Darstellung für Audit, Aufsicht oder abgeschlossene Vorgänge."
        messages={MESSAGES}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <CommunicationThread messages={[]} />
    </main>
  ),
};
