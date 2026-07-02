// Story: die generischen Feld-Fähigkeiten des AntragStepper, die ein Verfahren allein über DATEN nutzt —
// TYPISIERTE Werte je FeldTyp (Zahl-Staffel), Ja/Nein-TATBESTAND (Nein sperrt NICHT), DATA-DRIVEN Auswahl
// (`optionsRef` → `config.datenlisten`) und Datei-Upload (inline `file`-Feld + `config.nachweise()`).
// Bewusst NEUTRAL (Musteranmeldung, keine echten Sätze/Satzungen) — dieselbe UX entsteht identisch für jedes Verfahren.
import type { Meta, StoryObj } from "@storybook/react";

import { AntragStepper } from "../components/AntragStepper.js";
import { createFachverfahrenStore } from "../store.js";
import type { Berechnung, LeistungConfig } from "../types.js";

type DemoAntrag = {
  halter: { nachname?: string };
  tier: { anzahl?: number; kategorie?: string; auffaellig?: boolean };
  nachweis?: { name: string; groesse: number };
};

// Neutrale Demo-Staffel je ANZAHL (ganze Euro) — der `switch` greift nur, weil der Stepper `anzahl` typisiert (Zahl).
const STAFFEL: Record<number, number> = { 1: 50, 2: 80 };

function berechneDemo(a: DemoAntrag): Berechnung {
  const anzahl = a?.tier?.anzahl;
  const kat = a?.tier?.kategorie ?? "";
  const auffaellig = a?.tier?.auffaellig === true;
  const vollstaendig = typeof anzahl === "number" && kat !== "";
  const basis = typeof anzahl === "number" ? (STAFFEL[anzahl] ?? 110) : 0;
  const zuschlag = auffaellig ? 100 : 0;
  const positionen = [
    { label: `Grundbetrag (Anzahl ${anzahl ?? "—"})`, betrag: basis },
  ];
  if (zuschlag > 0)
    positionen.push({ label: "Zuschlag (auffälliges Tier)", betrag: zuschlag });
  return {
    betrag: basis + zuschlag,
    einheit: "EUR/Jahr",
    label: "Jahresbetrag (Demo)",
    begruendung: vollstaendig
      ? `Staffel nach Anzahl (${anzahl}) — Demo-Tarif; echte Sätze kämen aus dem Fachkonzept.`
      : "Bitte Anzahl und Kategorie wählen.",
    status: vollstaendig ? "final" : "provisional",
    positionen,
  };
}

const demoConfig: LeistungConfig<DemoAntrag> = {
  id: "musteranmeldung",
  label: "Musteranmeldung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 1 Demo-Satzung",
      titel: "Platzhalter — reale Grundlagen kommen aus dem Fachkonzept",
    },
  ],
  // DATA-DRIVEN Auswahl: das Verfahren liefert die Liste als DATEN; das Feld referenziert sie über `optionsRef`.
  datenlisten: {
    kategorien: [
      { value: "klein", label: "Kategorie A" },
      { value: "gross", label: "Kategorie B" },
    ],
  },
  antrag: {
    einleitung:
      "Neutrale Demo — zeigt typisierte Felder, Ja/Nein-Tatbestand, Daten-Auswahl und Nachweis-Upload.",
    steps: [
      {
        id: "halter",
        titel: "Anmelder:in",
        felder: [
          {
            name: "halter.nachname",
            label: "Nachname",
            typ: "text",
            required: true,
          },
        ],
      },
      {
        id: "tier",
        titel: "Angaben",
        felder: [
          // number: getippte Zahl kommt als ZAHL an (die Staffel matcht) — statt als String.
          {
            name: "tier.anzahl",
            label: "Anzahl",
            typ: "number",
            required: true,
            min: 1,
            max: 9,
          },
          // DATA-DRIVEN Select: Optionen aus config.datenlisten.kategorien (kein Freitext).
          {
            name: "tier.kategorie",
            label: "Kategorie",
            typ: "select",
            required: true,
            optionsRef: "kategorien",
          },
          // Ja/Nein-TATBESTAND: „Nein" ist gültig und sperrt den Antrag NICHT (anders als eine Pflicht-Checkbox).
          {
            name: "tier.auffaellig",
            label: "Auffälliges Tier?",
            typ: "ja-nein",
            required: true,
          },
          // Inline-Datei-Feld (optionaler Nachweis direkt im Schritt).
          {
            name: "nachweis",
            label: "Beleg (optional)",
            typ: "file",
            accept: "application/pdf,image/*",
          },
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
  berechne: (a) => berechneDemo(a),
  // config.nachweise(): erscheint als Upload im Review, sobald der Tatbestand es fordert (data-driven, je Auswahl).
  nachweise: (a) =>
    a?.tier?.auffaellig === true
      ? [
          {
            id: "gutachten",
            label: "Nachweis für auffälliges Tier",
            hochgeladen: false,
            erforderlich: true,
          },
        ]
      : [],
  register: { suchfelder: ["nachname"] },
  detailSektionen: [
    { titel: "Angaben", felder: [{ pfad: "tier.anzahl", label: "Anzahl" }] },
  ],
};

const meta = {
  title: "Fachverfahren/Antrag-Feldtypen",
  parameters: {
    docs: {
      description: {
        component:
          "Generische Feld-Fähigkeiten des AntragStepper — rein data-driven aus der LeistungConfig: typisierte Werte (Zahl-Staffel), Ja/Nein-Tatbestand, data-driven Auswahl (optionsRef) und Datei-Upload (file-Feld + config.nachweise()).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const GeneriseierteFeldtypen: Story = {
  render: () => {
    const store = createFachverfahrenStore(demoConfig);
    return (
      <div className="sb-page">
        <AntragStepper
          config={demoConfig}
          port={store}
          onDone={() => undefined}
        />
      </div>
    );
  },
};
