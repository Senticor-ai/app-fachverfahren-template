import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  KiVorschlag,
  SubsumtionPanel,
  type SubsumtionCriterion,
} from "./reasoning.js";

const meta = {
  title: "Public Sector UI/Reasoning",
  parameters: {
    docs: {
      description: {
        component:
          "Begründungs-/Transparenz-Cluster: SubsumtionPanel macht die rechtliche Subsumtion in vier Schritten sichtbar (recht:subsumtion), KiVorschlag setzt HCAI-/EU-AI-Act-Transparenz um (klar gekennzeichneter Vorschlag, Konfidenz, Modell, Warum?, Mensch entscheidet).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const antragKriterien: SubsumtionCriterion[] = [
  {
    label: "Antragsteller:in ist antragsberechtigt (§ 2 Abs. 1)",
    met: "erfuellt",
    note: "Berechtigung aus dem Fachregister bestätigt.",
  },
  {
    label: "Hauptwohnsitz im Zuständigkeitsbereich",
    met: "erfuellt",
    note: "Meldebestätigung liegt vor (Once-Only aus Melderegister).",
  },
  {
    label: "Erforderlicher Nachweis erbracht (§ 3)",
    met: "nicht-erfuellt",
    note: "Es liegt kein Nachweis in der Akte vor.",
  },
  {
    label: "Sachkundenachweis der antragstellenden Person",
    met: "unklar",
    note: "Eingereichtes Dokument ist unleserlich — Nachforderung erforderlich.",
  },
];

export const Subsumtion: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <h1>Rechtliche Subsumtion · gemischte Merkmale</h1>
        <SubsumtionPanel
          obersatz="Der Antrag auf die beantragte Erlaubnis ist genehmigungsfähig, wenn alle Tatbestandsmerkmale erfüllt sind."
          norm="§ 5 Abs. 1 i.V.m. § 2 Abs. 1 Mustergesetz"
          criteria={antragKriterien}
          ergebnis="Die Erlaubnis kann derzeit nicht erteilt werden: ein Merkmal ist nicht erfüllt, ein weiteres ist unklar und nachzufordern."
          ergebnisTone="nicht-erfuellt"
          sources={[
            "Mustergesetz § 2 Abs. 1, § 5 Abs. 1",
            "Verwaltungsvorschrift, Ziff. 5.2",
            "Akte: Antrag vom 2026-05-12, Nachweis offen",
          ]}
        />
      </section>
    </main>
  ),
};

export const KiVorschlagWarum: Story = {
  render: () => (
    <main className="sb-page sb-stack">
      <section className="sb-card sb-card--wide">
        <h1>KI-Vorschlag · Transparenz mit „Warum?“</h1>
        <KiVorschlag
          label="Empfohlene Gebührenstufe"
          value="Stufe 3 — 45,00 €"
          confidence={0.82}
          modelId="fachverfahren-assist-2026.06"
          rationale="Die Gebührenstufe leitet sich aus dem Verwaltungsaufwand (zusätzliche Prüfung erforderlich) ab; vergleichbare Vorgänge wurden überwiegend in Stufe 3 eingeordnet."
          sources={[
            "Gebührensatzung § 4 Abs. 2, Tarifstelle 3",
            "12 vergleichbare Vorgänge (Quartal 2026-Q1)",
          ]}
          onAccept={() => undefined}
          onReject={() => undefined}
          onOverride={() => undefined}
        />
      </section>
    </main>
  ),
};

function KiVorschlagDemo() {
  const [entscheidung, setEntscheidung] = useState<
    "offen" | "uebernommen" | "abgelehnt" | "ueberschrieben"
  >("offen");

  const statusText: Record<typeof entscheidung, string> = {
    offen: "Noch offen — bitte entscheiden.",
    uebernommen: "Übernommen: Vorschlag wurde in den Vorgang übernommen.",
    abgelehnt: "Abgelehnt: Vorschlag wurde verworfen.",
    ueberschrieben: "Überschrieben: manuelle Eingabe wird erfasst.",
  };

  return (
    <div className="sb-stack">
      <KiVorschlag
        label="Empfohlene Bearbeitungsfrist"
        value="bis 2026-07-15 (4 Wochen)"
        confidence={0.67}
        modelId="fachverfahren-assist-2026.06"
        rationale="Mittlere Komplexität: eine Nachforderung ist offen. Bei vergleichbaren Vorgängen lag die Bearbeitungsdauer typischerweise bei vier Wochen ab Eingang der fehlenden Unterlagen."
        sources={[
          "Bearbeitungsstatistik (Median 28 Tage)",
          "Dienstanweisung Fristen, Ziff. 2.1",
        ]}
        onAccept={() => setEntscheidung("uebernommen")}
        onReject={() => setEntscheidung("abgelehnt")}
        onOverride={() => setEntscheidung("ueberschrieben")}
      />
      <p className="ps-muted" role="status">
        {statusText[entscheidung]}
      </p>
    </div>
  );
}

export const KiVorschlagEntscheidung: Story = {
  render: () => (
    <main className="sb-page">
      <section className="sb-card sb-card--wide">
        <h1>KI-Vorschlag · der Mensch entscheidet</h1>
        <KiVorschlagDemo />
      </section>
    </main>
  ),
};
