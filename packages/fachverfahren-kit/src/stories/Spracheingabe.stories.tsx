// Story: die einwilligungs-gebundene Spracheingabe (VoiceInput) — Diktat als transparente Assistenz. Der Sprach-PORT
// wird als deterministischer Stub injiziert (kein Mikrofon, kein Netz, kein Modell im Kit): der Fluss
// Einwilligung → Hören → Verarbeiten → Vorschlag ist vollständig klickbar. Der erkannte Text wird NIE autonom
// übernommen — er geht als Vorschlag über onTranskript nach oben, wo der Mensch ihn im Feld bestätigt/bearbeitet.
// Das Datenschutz-Profil (on-device / EU / kein Audio-Versand) rendert die Komponente sichtbar aus dem Port-Profil.
// Bewusst NEUTRAL/verfahrensfrei (Muster-Text), damit die Story für JEDES Fachverfahren gilt.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { StatusRegionProvider } from "../components/StatusRegion.js";
import { VoiceInput } from "../components/VoiceInput.js";
import { createStubVoicePort } from "../lib/voice-input.js";
import { Label } from "../ui/label.js";
import { Textarea } from "../ui/textarea.js";

// Deterministischer Stub-PORT: generischer, verfahrensfreier Beispiel-Text; das Datenschutz-Default meldet die
// strengste Annahme (on-device, EU-Residenz, kein Audio-Versand) — sichtbar in der Komponente. Kein echtes Modell.
const stubPort = createStubVoicePort({
  text: "Dies ist eine diktierte Beispiel-Eingabe. Bitte prüfen und bestätigen Sie den Text vor der Übernahme.",
  quelle: "Stub-Transkription (kein echtes Modell)",
});

const meta = {
  title: "Fachverfahren Kit/Barrierefreiheit/Spracheingabe",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Einwilligungs-gebundene, barrierefreie Spracheingabe (WCAG 2.2 AA / BITV 2.0 / EN 301 549 / EU-AI-Act): vor dem Diktat ein Consent-Gate mit transparenter Datenschutz-Anzeige (on-device / EU-Residenz / kein Audio-Versand) aus dem Port-Profil, dann der Mikrofon-Button mit sichtbaren Zuständen (Icon UND Text, nie nur Farbe). Der erkannte Text wird NIE autonom übernommen — er geht als Vorschlag über onTranskript nach oben, wo der Mensch ihn im Feld bestätigt. PORT-only: kein Mikrofon/SpeechRecognition im Kit; hier ein deterministischer Stub statt Netz/Modell.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** „Bereit": der Sprach-PORT ist injiziert. Vor dem Diktat steht das Consent-Gate — erst Aufklärung + sichtbare
 *  Datenschutz-Anzeige + Aktivierung, danach der Mikrofon-Button mit den Zuständen hört/verarbeitet/fertig. */
export const Bereit: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-xl">
        <VoiceInput voicePort={stubPort} onTranskript={() => undefined} />
      </div>
    </StatusRegionProvider>
  ),
};

/** „Ohne Port": ohne injizierten VoicePort ist der Baustein deaktiviert und weist sichtbar darauf hin (Bedeutung
 *  via Icon UND Text, nicht nur Farbe). In PROD dockt hier eine echte, bevorzugt on-device/EU-gehostete Transkription an. */
export const OhnePort: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-xl">
        <VoiceInput onTranskript={() => undefined} />
      </div>
    </StatusRegionProvider>
  ),
};

/** Übernahme in ein Feld: onTranskript schreibt den erkannten Text als VORSCHLAG in ein Textfeld, das der Mensch
 *  anschließend prüft und bestätigt/bearbeitet. So bleibt die Entscheidung beim Menschen (kein autonomes Übernehmen). */
function UebernahmeInsFeldDemo() {
  const [wert, setWert] = useState("");
  return (
    <StatusRegionProvider>
      <div className="max-w-xl space-y-4">
        <VoiceInput
          voicePort={stubPort}
          label="Bemerkung diktieren"
          onTranskript={(text) => setWert(text)}
        />
        <div className="space-y-1.5">
          <Label htmlFor="bemerkung">
            Bemerkung (bitte prüfen und bestätigen)
          </Label>
          <Textarea
            id="bemerkung"
            value={wert}
            onChange={(e) => setWert(e.target.value)}
            rows={4}
            placeholder="Der diktierte Text erscheint hier zur Prüfung …"
          />
          <p className="text-xs text-muted-foreground">
            Der erkannte Text ist ein Vorschlag — Sie können ihn hier vor der
            Übernahme frei ändern.
          </p>
        </div>
      </div>
    </StatusRegionProvider>
  );
}

export const UebernahmeInsFeld: Story = {
  render: () => <UebernahmeInsFeldDemo />,
};
