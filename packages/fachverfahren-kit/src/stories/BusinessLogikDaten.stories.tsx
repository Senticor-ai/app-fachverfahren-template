// Story: Business-Logik als DATEN im Antrag — der AntragStepper wertet rein die Config-DATEN aus (KEIN `berechne`,
// KEIN `nachweise`): (1) TARIF-DATEN-Anzeige — der reine Interpreter rechnet die Live-Berechnung aus `config.tarif`
// (Staffel-Kaskade); (2) CODELISTEN-SELECT — ein Select bezieht seine Optionen ueber `optionsRef` aus
// `config.codelisten` (geerdet, mit Provenienz + `belege`); die gewaehlte Codeliste leitet die Nachweise ab;
// (3) PLAUSIBILITAETS-HINWEISE — weiche, nicht sperrende Hinweise (`FeldDef.hinweise`). Bewusst NEUTRAL.
import type { Meta, StoryObj } from "@storybook/react";

import { AntragStepper } from "../components/AntragStepper.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { createFachverfahrenStore } from "../store.js";
import type { LeistungConfig } from "../types.js";

type BLAntrag = {
  objekt: { kategorie?: string; menge?: number };
};

const config: LeistungConfig<BLAntrag> = {
  id: "musteranmeldung",
  label: "Musteranmeldung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "§ 1 Demo-Satzung",
      titel: "Platzhalter — reale Grundlagen aus dem Fachkonzept",
    },
  ],
  // CODELISTE mit Provenienz: ein Eintrag traegt `belege` → daraus leitet der Interpreter die Nachweise ab.
  codelisten: {
    kategorien: {
      id: "kategorien",
      label: "Kategorie",
      normRef: { norm: "Demo-VO#Anlage 1", status: "annahme" },
      eintraege: [
        {
          value: "a",
          label: "Kategorie A",
          normRef: { norm: "Demo-VO#Anlage 1", status: "annahme" },
          belege: ["Nachweis fuer Kategorie A"],
        },
        { value: "b", label: "Kategorie B" },
      ],
    },
  },
  // TARIF als DATEN (Staffel-Kaskade) — OHNE `berechne`: der reine Interpreter rechnet die Live-Berechnung.
  tarif: {
    einheit: "EUR/Jahr",
    label: "Jahresbetrag (Demo)",
    modus: "erste-treffende",
    normRef: { norm: "§ 1 Demo-Satzung", status: "annahme" },
    staffeln: [
      {
        label: "Kategorie A",
        bedingung: { feld: "objekt.kategorie", op: "==", wert: "a" },
        betrag: 120,
        normRef: { norm: "§ 1 Demo-Satzung", status: "annahme" },
      },
      {
        label: "Mengen-Staffel (ab 5)",
        bedingung: { feld: "objekt.menge", op: ">=", wert: 5 },
        betrag: 90,
      },
      { label: "Grundbetrag", betrag: 60 },
    ],
  },
  antrag: {
    einleitung:
      "Neutrale Demo — der Betrag oben und die Nachweise entstehen allein aus den Config-DATEN (Tarif + Codelisten), ohne Code.",
    steps: [
      {
        id: "angaben",
        titel: "Angaben",
        felder: [
          // CODELISTEN-SELECT: Optionen aus config.codelisten.kategorien (geerdet, mit Provenienz).
          {
            name: "objekt.kategorie",
            label: "Kategorie",
            typ: "select",
            required: true,
            optionsRef: "kategorien",
          },
          // PLAUSIBILITAETS-HINWEISE (weich, nicht sperrend, data-driven).
          {
            name: "objekt.menge",
            label: "Menge",
            typ: "number",
            required: true,
            min: 1,
            hinweise: [
              {
                wenn: { feld: "objekt.menge", op: ">=", wert: 5 },
                text: "Ab einer Menge von 5 greift eine gesonderte Staffel — der Betrag oben ist bereits angepasst.",
                ton: "info",
              },
              {
                wenn: { feld: "objekt.menge", op: ">", wert: 20 },
                text: "Ungewoehnlich hohe Menge — bitte pruefen.",
                ton: "warn",
              },
            ],
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
  register: { suchfelder: [] },
  detailSektionen: [
    { titel: "Angaben", felder: [{ pfad: "objekt.menge", label: "Menge" }] },
  ],
};

const meta = {
  title: "Fachverfahren/Business-Logik als Daten",
  parameters: {
    docs: {
      description: {
        component:
          "Der AntragStepper wertet reine Config-DATEN aus (kein berechne/nachweise): Tarif-Staffeln → Live-Berechnung, Codelisten → geerdeter Select + abgeleitete Nachweise, hinweise → weiche Plausibilitaets-Hinweise. Dieselbe UX fuer jedes Verfahren, nur die Daten unterscheiden sich.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TarifCodelistenUndHinweise: Story = {
  render: () => {
    const store = createFachverfahrenStore(config);
    return (
      <StatusRegionProvider>
        <div className="sb-page">
          <AntragStepper
            config={config}
            port={store}
            onDone={() => undefined}
          />
        </div>
      </StatusRegionProvider>
    );
  },
};
