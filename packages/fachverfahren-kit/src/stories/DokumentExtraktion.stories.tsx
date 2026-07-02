// Story: der integrierte KI-Extraktions-Assistent (DokumentExtraktion) — der Fluss Upload → KI-Vorschlag (Stub) →
// Nutzer bestaetigt/korrigiert → Feld befuellt. Der Extraktions-PORT ist vendor-neutral: hier ein deterministischer
// Stub, dessen Beispiel-Werte als DATEN (`muster`) kommen — KEINE Domaenen-Literale im Kit. In PROD dockt an DENSELBEN
// Port eine echte OCR-/KI-Bindung an. Bewusst NEUTRAL (Musteranmeldung).
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { DokumentExtraktion } from "../components/DokumentExtraktion.js";
import { AntragStepper } from "../components/AntragStepper.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { createFachverfahrenStore } from "../store.js";
import {
  createStubExtraktionPort,
  type ExtraktionsZielFeld,
} from "../lib/dokument-extraktion.js";
import type { LeistungConfig } from "../types.js";

// Zielfelder + Beispiel-Muster als DATEN (der Kit erfindet nichts). Ein echter Dienst liefert diese Vorschlaege real.
const zielFelder: ExtraktionsZielFeld[] = [
  { feld: "person.nachname", label: "Nachname", typ: "text" },
  { feld: "person.vorname", label: "Vorname", typ: "text" },
  { feld: "adresse.plz", label: "PLZ", typ: "plz" },
  { feld: "adresse.ort", label: "Ort", typ: "text" },
];

const stubPort = createStubExtraktionPort({
  quelle: "Stub-Extraktion (Demo — kein echtes Modell)",
  standardKonfidenz: 0.82,
  hinweise: [
    "Beispiel-Vorschlaege — bitte jeden Wert vor der Uebernahme pruefen.",
  ],
  muster: {
    "person.nachname": {
      wert: "Musterfrau",
      konfidenz: 0.95,
      fundstelle: "Kopfzeile, Zeile 1",
    },
    "person.vorname": {
      wert: "Alex",
      konfidenz: 0.9,
      fundstelle: "Kopfzeile, Zeile 1",
    },
    "adresse.plz": {
      wert: "12345",
      konfidenz: 0.71,
      fundstelle: "Anschriftblock",
    },
    "adresse.ort": {
      wert: "Musterstadt",
      konfidenz: 0.68,
      fundstelle: "Anschriftblock",
    },
  },
});

const meta = {
  title: "Fachverfahren/Dokument-Extraktion (KI-Hook)",
  parameters: {
    docs: {
      description: {
        component:
          "Innovativer, integrierter KI-Extraktions-Hook fuer den Dokument-Upload: hochgeladenes Dokument → Feld-Vorschlaege mit Konfidenz (aus dem vendor-neutralen DokumentExtraktionPort) → der Mensch bestaetigt oder korrigiert je Feld → das Antragsfeld wird befuellt. HITL, nie autonom bindend. Transparenz wie in der Sachbearbeitung (source/confidence/why).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Standalone: zeigt den vollstaendigen Fluss inkl. der befuellten Felder (Live-Zustand rechts). */
export const UploadVorschlagBestaetigen: Story = {
  render: () => {
    function Demo() {
      const [werte, setWerte] = useState<Record<string, string>>({});
      return (
        <StatusRegionProvider>
          <div className="sb-page grid gap-6 lg:grid-cols-2">
            <DokumentExtraktion
              zielFelder={zielFelder}
              port={stubPort}
              onUebernehmen={(feld, wert) =>
                setWerte((prev) => ({ ...prev, [feld]: wert }))
              }
            />
            <div className="rounded-md border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Befuellte Antragsfelder (Live)
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Was der Mensch bestaetigt, landet hier — genau wie im echten
                Antrag ueber <code>onUebernehmen</code>.
              </p>
              {Object.keys(werte).length === 0 ? (
                <p className="mt-4 rounded-sm border border-border bg-background p-3 text-sm text-muted-foreground">
                  Noch nichts uebernommen. Laden Sie ein Dokument hoch (Stub)
                  und bestaetigen Sie einen Vorschlag.
                </p>
              ) : (
                <dl className="mt-4 grid gap-0 text-sm">
                  {zielFelder
                    .filter((z) => werte[z.feld] !== undefined)
                    .map((z) => (
                      <div
                        key={z.feld}
                        className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-b-0"
                      >
                        <dt className="text-muted-foreground">{z.label}</dt>
                        <dd className="text-right font-medium text-foreground">
                          {werte[z.feld]}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
            </div>
          </div>
        </StatusRegionProvider>
      );
    }
    return <Demo />;
  },
};

// ── Der KI-Hook IM Antrag: der Assistent erscheint im ersten Schritt und befuellt die echten Antragsfelder. ──
type IntakeAntrag = {
  person: { nachname?: string; vorname?: string };
  adresse: { plz?: string; ort?: string };
};

const intakeConfig: LeistungConfig<IntakeAntrag> = {
  id: "musteranmeldung",
  label: "Musteranmeldung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 1 Demo-Satzung",
      titel: "Platzhalter — reale Grundlagen aus dem Fachkonzept",
    },
  ],
  antrag: {
    einleitung:
      "Neutrale Demo — der KI-Assistent oben befuellt die Felder aus einem hochgeladenen Dokument (Stub).",
    steps: [
      {
        id: "person",
        titel: "Person",
        felder: [
          {
            name: "person.nachname",
            label: "Nachname",
            typ: "text",
            required: true,
          },
          {
            name: "person.vorname",
            label: "Vorname",
            typ: "text",
            required: true,
          },
        ],
      },
      {
        id: "adresse",
        titel: "Anschrift",
        felder: [
          { name: "adresse.plz", label: "PLZ", typ: "plz", required: true },
          { name: "adresse.ort", label: "Ort", typ: "text", required: true },
        ],
      },
    ],
  },
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "festgesetzt",
        label: "Festsetzen",
        rollen: ["sachbearbeitung"],
      },
    ],
  },
  register: { suchfelder: ["nachname"] },
  detailSektionen: [
    {
      titel: "Person",
      felder: [{ pfad: "person.nachname", label: "Nachname" }],
    },
  ],
};

/** Der Assistent als OPTIONALE Fähigkeit des AntragStepper (extraktionPort-Prop) — befuellt echte Antragsfelder. */
export const ImAntragVorbefuellen: Story = {
  render: () => {
    const store = createFachverfahrenStore(intakeConfig);
    return (
      <StatusRegionProvider>
        <div className="sb-page">
          <AntragStepper
            config={intakeConfig}
            port={store}
            onDone={() => undefined}
            extraktionPort={stubPort}
          />
        </div>
      </StatusRegionProvider>
    );
  },
};
