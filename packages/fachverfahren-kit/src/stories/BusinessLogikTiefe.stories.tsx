// Story: INTELLIGENTE Business-Logik-Tiefe im Antrag (M1–M5) — der AntragStepper wertet reine Config-DATEN aus.
// Bewusst VERFAHRENSFREI (neutrale „Objekt-Anmeldung", Kategorien/Sonderklasse) — die Story gilt für JEDES
// Verfahren; konkrete Fachbeispiele leben in ihren Domänen-Modulen, nicht im offenen Kit.
//  M1 Codeliste mit FLAG + AUTO-ABLEITUNG — markierte Einträge (Sonderklasse) farbig; das Zielfeld wird automatisch
//     aus dem Codelisten-Merkmal gesetzt (read-only „automatisch abgeleitet"), die Tarif-Staffel liest es.
//  M3 PROGRESSIVE DISCLOSURE — der `rolle: "kontext"`-Schritt (Vorgangsart) ZUERST; Folge-Schritte erscheinen erst
//     über `sichtbarWenn` (Anmeldung blendet die Objekt-Angaben ein, Abmeldung nicht).
//  M2 SPRACHE PRO FELD — Leichte Sprache + Amts-/Fachbegriff je Feld (nicht panel-weit).
//  M5 ZWEI-EBENEN-BEGRÜNDUNG — die Bürger-Karte zeigt `begruendungBuerger` (einfach, ohne §), der Bescheid die
//     rechtliche Fassung.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { AntragStepper } from "../components/AntragStepper.js";
import { LanguageSwitch } from "../components/LanguageSwitch.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { createFachverfahrenStore } from "../store.js";
import type { LeistungConfig } from "../types.js";

type ObjektAntrag = {
  vorgang?: { art?: string };
  objekt?: { kategorie?: string; sonderpflichtig?: boolean };
};

// NEUTRALE INSTANZ — der Kit trägt KEINE Domänen-Literale; alles hier ist Config-DATEN.
const configMitTiefe: LeistungConfig<ObjektAntrag> = {
  id: "objekt-anmeldung",
  label: "Objekt-Anmeldung",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [
    {
      norm: "KAG#§ 3",
      titel: "Kommunalabgabengesetz — Aufwandsteuer (Beispiel)",
      satzung: false,
    },
    { norm: "Satzung#§ 4", titel: "Sätze", satzung: true },
  ],
  antrag: {
    einleitung:
      "Wählen Sie zuerst, was Sie tun möchten — die folgenden Schritte richten sich danach.",
    konditionierendesFeld: "vorgang.art",
    steps: [
      // M3 — KONTEXT-Schritt (Vorgangsart) ZUERST: konditioniert den Rest.
      {
        id: "vorgangsart",
        titel: "Was möchten Sie tun?",
        rolle: "kontext",
        felder: [
          {
            name: "vorgang.art",
            label: "Vorgangsart",
            labelFachlich: "Prozessvariante (Lebenslage)",
            typ: "select",
            required: true,
            options: [
              { value: "anmeldung", label: "Objekt anmelden" },
              { value: "abmeldung", label: "Objekt abmelden" },
            ],
          },
        ],
      },
      // M3 — nur bei „anmeldung" sichtbar (Abmeldung braucht keine Kategorie/Berechnung).
      {
        id: "objekt",
        titel: "Angaben zum Objekt",
        rolle: "erhebung",
        sichtbarWenn: { feld: "vorgang.art", op: "==", wert: "anmeldung" },
        felder: [
          {
            name: "objekt.kategorie",
            label: "Kategorie Ihres Objekts",
            labelFachlich: "Kategorie gem. Anlage zur Satzung",
            leichteSprache: "Welche Art hat Ihr Objekt?",
            typ: "select",
            required: true,
            optionsRef: "kategorien",
          },
          // M1 — ABGELEITETES Feld: read-only, wird aus dem Kategorie-Merkmal automatisch gesetzt.
          {
            name: "objekt.sonderpflichtig",
            label: "Sonderklasse",
            labelFachlich: "Einstufung (§ 2 Anlage)",
            typ: "ja-nein",
            abgeleitet: {
              ausCodeliste: "kategorien",
              merkmal: "sonderpflichtig",
            },
          },
        ],
      },
    ],
  },
  // M1 — CODELISTE mit MERKMAL (sonderpflichtig), MARKIERUNG (Badge) + AUTO-ABLEITUNG in das Zielfeld.
  codelisten: {
    kategorien: {
      id: "kategorien",
      label: "Kategorie",
      normRef: { norm: "VO#§ 2", status: "belegt" },
      ableitungen: [
        {
          ausMerkmal: "sonderpflichtig",
          setzeFeld: "objekt.sonderpflichtig",
          default: false,
        },
      ],
      eintraege: [
        {
          value: "standard",
          label: "Standard-Kategorie",
          merkmale: { sonderpflichtig: false },
        },
        {
          value: "sonder-a",
          label: "Sonderklasse A",
          markierung: { ton: "kritisch", label: "Sonderklasse" },
          merkmale: { sonderpflichtig: true },
          normRef: { norm: "VO#§ 2 Abs. 1", status: "belegt" },
        },
        {
          value: "sonder-b",
          label: "Sonderklasse B",
          markierung: { ton: "kritisch", label: "Sonderklasse" },
          merkmale: { sonderpflichtig: true },
        },
        { value: "mischform", label: "Mischform (nicht gelistet)" },
      ],
    },
  },
  // M5 — TARIF als DATEN: die Staffel liest das ABGELEITETE Feld (objekt.sonderpflichtig). Die normRefs speisen die
  // rechtliche Begründung; die Bürger-Karte zeigt die einfache Fassung (ohne §).
  tarif: {
    einheit: "EUR/Jahr",
    label: "Jahresbetrag",
    modus: "erste-treffende",
    staffeln: [
      {
        label: "Erhöhter Satz für Sonderklassen",
        bedingung: { feld: "objekt.sonderpflichtig", op: "==", wert: true },
        betrag: 600,
        normRef: { norm: "Satzung#§ 5", status: "annahme" },
      },
      {
        label: "Regelsatz",
        betrag: 120,
        normRef: { norm: "Satzung#§ 4", status: "annahme" },
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
    {
      titel: "Objekt",
      felder: [{ pfad: "objekt.kategorie", label: "Kategorie" }],
    },
  ],
};

// BASELINE (rückwärtskompatibel) — dieselbe Domäne OHNE die neuen Felder: ein flacher Antrag ohne rolle/
// sichtbarWenn/markierung/abgeleitet rendert unverändert. Beweist: das Kit degradiert sauber.
const configOhneTiefe: LeistungConfig<ObjektAntrag> = {
  id: "objekt-anmeldung-flach",
  label: "Objekt-Anmeldung (ohne Tiefe)",
  kommune: "Stadt Musterstadt",
  rechtsgrundlagen: [{ norm: "Satzung#§ 4", titel: "Sätze" }],
  antrag: {
    steps: [
      {
        id: "angaben",
        titel: "Angaben zum Objekt",
        felder: [
          {
            name: "objekt.kategorie",
            label: "Kategorie Ihres Objekts",
            typ: "text",
            required: true,
          },
        ],
      },
    ],
  },
  tarif: {
    einheit: "EUR/Jahr",
    label: "Jahresbetrag",
    staffeln: [{ label: "Regelsatz", betrag: 120 }],
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
  detailSektionen: [],
};

const meta = {
  title: "Fachverfahren/Business-Logik-Tiefe (M1–M5)",
  parameters: {
    docs: {
      description: {
        component:
          "Der AntragStepper trägt die intelligente Fach-Tiefe rein aus DATEN: markierte Codelisten-Einträge (M1) + Auto-Ableitung eines read-only Zielfelds, Vorgangsart-zuerst mit progressive disclosure (M3), pro-Feld Bürger-/Leichte-/Amtssprache (M2) und zwei Begründungs-Ebenen (M5). Verfahrensfreie Instanz — dieselbe UX gilt für jedes Verfahren; ohne die neuen Felder rendert alles unverändert (rückwärtskompatibel).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** M1 + M3 + M5: „Sonderklasse A" wählen → Sonderklasse-Badge (rot), das Feld „Sonderklasse" wird automatisch auf
 *  „Ja" abgeleitet (read-only), und die Live-Berechnung springt auf den erhöhten Satz mit bürgernaher Begründung. */
export const MitTiefe: Story = {
  render: () => {
    const store = createFachverfahrenStore(configMitTiefe);
    return (
      <StatusRegionProvider>
        <div className="sb-page">
          <AntragStepper
            config={configMitTiefe}
            port={store}
            onDone={() => undefined}
          />
        </div>
      </StatusRegionProvider>
    );
  },
};

/** M2: Leichte Sprache + Fachbegriffe PRO FELD — die LanguageSwitch schaltet die Leichte-Sprache-Fassung je Feld,
 *  ein Umschalter blendet die Amts-/Fachbezeichnung (Sachbearbeiter-Sicht) ein. */
export const SpracheProFeld: Story = {
  render: () => {
    const Demo = () => {
      const [leicht, setLeicht] = useState(false);
      const [fach, setFach] = useState(false);
      const store = createFachverfahrenStore(configMitTiefe);
      return (
        <div className="sb-page">
          <div className="mb-4 flex flex-wrap items-center gap-4 rounded-md border border-border bg-surface-2 p-3">
            <LanguageSwitch
              sprachen={[{ code: "de", label: "Deutsch" }]}
              aktiv="de"
              onWechsel={() => undefined}
              leichteSprache={leicht}
              onLeichteSprache={setLeicht}
            />
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={fach}
                onChange={(e) => setFach(e.target.checked)}
              />
              Fachbegriffe zeigen (Sachbearbeiter-Sicht)
            </label>
          </div>
          <AntragStepper
            config={configMitTiefe}
            port={store}
            onDone={() => undefined}
            leichteSprache={leicht}
            zeigeFachbegriffe={fach}
          />
        </div>
      );
    };
    return (
      <StatusRegionProvider>
        <Demo />
      </StatusRegionProvider>
    );
  },
};

/** Rückwärtskompatibel: dieselbe Domäne OHNE die neuen Felder — flacher Antrag, unveränderte UX. */
export const OhneTiefeFelder: Story = {
  render: () => {
    const store = createFachverfahrenStore(configOhneTiefe);
    return (
      <StatusRegionProvider>
        <div className="sb-page">
          <AntragStepper
            config={configOhneTiefe}
            port={store}
            onDone={() => undefined}
          />
        </div>
      </StatusRegionProvider>
    );
  },
};
