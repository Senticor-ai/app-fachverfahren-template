// Story: die KI-/Agenten-UX-Bausteine — transparent nach EU-AI-Act (Art. 50 Kennzeichnung, Art. 14 Human-in-the-Loop).
// Zeigt, wie ein Verfahren KI SICHTBAR macht: einen gekennzeichneten Chat (AssistentPanel), den Agenten-Status
// (AgentStatusIndicator), gestreamten Text mit dezenter Abschluss-Ansage (StreamingText), die Nachvollziehbarkeit
// des Vorgehens samt Belegen (AgentTrace), die menschliche Freigabe eines geplanten Aufrufs (ToolCallCard) sowie
// das kontrollierte Einstell-Panel „der Mensch schaltet die KI“ (KiSteuerungPanel). Alle KI-Antworten kommen aus dem
// deterministischen Stub-PORT (createStubChatPort) — KEIN Netz, KEIN Modell. Bewusst NEUTRAL (Muster-Werte), damit die
// Story für JEDES Fachverfahren gilt.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { AssistentPanel } from "../components/AssistentPanel.js";
import { AgentStatusIndicator } from "../components/AgentStatusIndicator.js";
import { StreamingText } from "../components/StreamingText.js";
import { AgentTrace } from "../components/AgentTrace.js";
import {
  ToolCallCard,
  type ToolCallStatus,
} from "../components/ToolCallCard.js";
import { KiSteuerungPanel } from "../components/KiSteuerung.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { Button } from "../ui/button.js";
import { createStubChatPort } from "../lib/ai-assist.js";
import { defaultKiSteuerung } from "../lib/ki-steuerung.js";
import type { LeistungConfig } from "../types.js";

// Deterministischer Chat-PORT (kein Modell/Netz): yieldet generische Assistenten-Chunks, macht Streaming sichtbar
// und liefert am Ende Quelle + Art-50-Kennzeichnung. Modul-stabil, damit er nicht bei jedem Render neu entsteht.
const beispielChatPort = createStubChatPort({
  quelle: "Beispiel-Assistent (Stub, kein Modell)",
  chunks: [
    "Gern. ",
    "Ich ",
    "fasse ",
    "die ",
    "nächsten ",
    "Schritte ",
    "assistierend ",
    "zusammen ",
    "– ",
    "bitte ",
    "prüfen ",
    "Sie ",
    "das ",
    "Ergebnis.",
  ],
});

// Beispiel-KI-ANGEBOT eines Verfahrens (`LeistungConfig["ki"]`): assist/chat/voice werden angeboten — nur diese
// Schalter erscheinen im Panel. Autonomie-Obergrenze auf assist gedeckelt (der Mensch kann nur strenger stellen).
const beispielKiConfig: LeistungConfig["ki"] = {
  schwelleAutonom: 0.85,
  assist: {
    zweck: "Vorschläge zur Vollständigkeitsprüfung",
    quelle: "Beispiel-LLM (EU-Hosting)",
    maxSchwelleAutonom: 0.7,
  },
  chat: {
    zweck: "Assistierender Dialog zur Leistung",
    quelle: "Beispiel-Assistent (Stub)",
    begruessung: "Wie kann ich Sie unterstützen?",
  },
  voice: { sprachen: ["de-DE"], euResidenzErforderlich: true },
};

// ── Provider-freie Demo-Bausteine (jede Story wrappt selbst in <StatusRegionProvider>) ──────────────

/** Chat-Panel gegen den Stub-PORT: gestreamte, transparent gekennzeichnete Antwort + HITL-freundlicher Composer. */
function ChatDemo() {
  return (
    <AssistentPanel chatPort={beispielChatPort} titel="Beispiel-Assistent" />
  );
}

/** Gestreamter Text mit einer EINMALIGEN, dezenten Abschluss-Ansage beim Übergang streaming → fertig. */
function StreamingDemo() {
  const [streaming, setStreaming] = useState(true);
  const text = streaming
    ? "Der Assistent formuliert einen Vorschlag"
    : "Der Assistent formuliert einen Vorschlag. Bitte prüfen Sie das Ergebnis.";
  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <StreamingText
        text={text}
        streaming={streaming}
        abschlussAnsage="Vorschlag vollständig – bitte prüfen."
      />
      <Button
        size="sm"
        variant="outline"
        onClick={() => setStreaming((s) => !s)}
      >
        {streaming ? "Antwort abschließen" : "Erneut streamen"}
      </Button>
    </div>
  );
}

/** Ein geplanter Aufruf mit menschlicher Freigabe (HITL): der Zustand wandert ausstehend → genehmigt/abgelehnt. */
function ToolCallDemo() {
  const [status, setStatus] = useState<ToolCallStatus>("ausstehend");
  return (
    <ToolCallCard
      aktion="datensatz.aktualisieren"
      beschreibung="Aktualisiert einen Beispiel-Datensatz im Fachsystem. Nichts wird ohne Ihre Freigabe ausgeführt."
      parameter={[
        { name: "datensatzId", wert: "BEISPIEL-000123" },
        { name: "feld", wert: "status" },
        { name: "neuerWert", wert: "in Bearbeitung" },
      ]}
      status={status}
      onGenehmigen={() => setStatus("genehmigt")}
      onAblehnen={() => setStatus("abgelehnt")}
    />
  );
}

/** Kontrolliertes Einstell-Panel: `defaultKiSteuerung()` als Start, Änderungen über useState (kontrolliert). */
function SteuerungDemo() {
  const [steuerung, setSteuerung] = useState(defaultKiSteuerung());
  return (
    <KiSteuerungPanel
      config={beispielKiConfig}
      steuerung={steuerung}
      onChange={setSteuerung}
    />
  );
}

const meta = {
  title: "Fachverfahren Kit/KI/Agenten-UX",
  parameters: {
    docs: {
      description: {
        component:
          "Transparente KI-/Agenten-UX nach EU-AI-Act: gekennzeichneter Chat (AssistentPanel), mehrkanaliger Agenten-Status (AgentStatusIndicator), gestreamter Text mit einmaliger Abschluss-Ansage (StreamingText), nachvollziehbares Vorgehen samt Belegen (AgentTrace), menschliche Freigabe geplanter Aufrufe (ToolCallCard, HITL) und das kontrollierte Einstell-Panel „der Mensch schaltet die KI“ (KiSteuerungPanel). Alle Antworten kommen aus einem deterministischen Stub-PORT — kein Netz, kein Modell.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Chat-Panel: gestreamte Assistenten-Antwort aus dem Stub-PORT, dauerhaft als KI-generiert gekennzeichnet. */
export const Assistent: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-xl">
        <ChatDemo />
      </div>
    </StatusRegionProvider>
  ),
};

/** Agenten-Status mehrkanalig (Icon + Text, nie nur Farbe): bereit, denkt, handelt, Fehler. */
export const AgentStatus: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <AgentStatusIndicator status="idle" />
      <AgentStatusIndicator status="denkt" />
      <AgentStatusIndicator status="handelt" />
      <AgentStatusIndicator status="fehler" />
    </div>
  ),
};

/** Gestreamter Text: aria-busy statt aria-live; genau EINE höfliche Ansage beim Abschluss (Schalter unten). */
export const GestreamterText: Story = {
  render: () => (
    <StatusRegionProvider>
      <StreamingDemo />
    </StatusRegionProvider>
  ),
};

/** Nachvollziehbarkeit: die Schritte des Agenten samt herangezogener Belege — einsehbar, hier aufgeklappt. */
export const Trace: Story = {
  render: () => (
    <div className="max-w-xl">
      <AgentTrace
        defaultOffen
        schritte={[
          {
            titel: "Eingabe gelesen",
            detail: "Beispiel-Antrag mit Feld A und Feld B erfasst.",
          },
          {
            titel: "Regel geprüft",
            detail: "Beispiel-Regel R1 auf die Eingabe angewendet.",
            quellen: [{ titel: "Muster-Regelwerk", fundstelle: "Abschnitt 2" }],
          },
          {
            titel: "Vorschlag erzeugt",
            detail: "Ergebnis zur menschlichen Prüfung vorbereitet.",
            quellen: [
              { titel: "Beispiel-Codeliste", fundstelle: "Eintrag 12" },
              { titel: "Muster-Dokument" },
            ],
          },
        ]}
      />
    </div>
  ),
};

/** HITL-Freigabe eines geplanten Aufrufs: Genehmigen/Ablehnen; der Zustand trägt Icon + Text, nie nur Farbe. */
export const ToolFreigabe: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-xl">
        <ToolCallDemo />
      </div>
    </StatusRegionProvider>
  ),
};

/** KI-Steuerung: nur die angebotenen Schalter (assist/chat/voice), unabschaltbare menschliche Aufsicht, kontrolliert. */
export const Steuerung: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-2xl">
        <SteuerungDemo />
      </div>
    </StatusRegionProvider>
  ),
};

/** Kombiniert: ein transparenter Agenten-Arbeitsplatz — Chat, Status, geplanter Aufruf (HITL) und Nachvollziehbarkeit. */
export const Kombiniert: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <ChatDemo />
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
            <span className="text-sm font-medium text-foreground">
              Agenten-Status
            </span>
            <AgentStatusIndicator status="handelt" />
          </div>
          <ToolCallDemo />
          <AgentTrace
            schritte={[
              {
                titel: "Kontext geladen",
                detail: "Beispiel-Vorgang mit Muster-Feldern gelesen.",
              },
              {
                titel: "Beleg herangezogen",
                quellen: [
                  { titel: "Muster-Regelwerk", fundstelle: "Abschnitt 2" },
                ],
              },
            ]}
          />
        </div>
      </div>
    </StatusRegionProvider>
  ),
};
