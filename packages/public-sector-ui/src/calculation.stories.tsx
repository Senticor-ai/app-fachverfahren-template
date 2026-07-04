import type { Meta, StoryObj } from "@storybook/react";
import {
  CalculationTrace,
  type CalculationAssumption,
  type CalculationInput,
  type CalculationStep,
} from "./calculation.js";

const meta = {
  title: "Public Sector UI/Calculation Trace",
  parameters: {
    docs: {
      description: {
        component:
          "Berechnungsherleitung für Fachverfahren: Eingabewerte, Rechenschritte, Annahmen, Quellen und Ergebnisstatus werden prüfbar und barrierefrei dargestellt.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const INPUTS: CalculationInput[] = [
  {
    id: "base",
    label: "Bemessungswert",
    value: "1.200 EUR",
    source: "aus Antrag übernommen",
  },
  {
    id: "household",
    label: "Haushaltsgröße",
    value: "3 Personen",
    source: "aus Registerabgleich",
    onceOnly: true,
  },
  {
    id: "period",
    label: "Zeitraum",
    value: "2026-07",
    source: "aus Vorgangsdaten",
  },
];

const STEPS: CalculationStep[] = [
  {
    id: "base",
    label: "Grundbetrag bestimmen",
    status: "applied",
    value: "1.200 EUR",
    formula: "1.200 EUR",
    note: "Der Bemessungswert wird aus den geprüften Angaben übernommen.",
    references: ["Fachregel: Grundbetrag aus bestätigtem Bemessungswert"],
  },
  {
    id: "factor",
    label: "Faktor anwenden",
    status: "applied",
    value: "900 EUR",
    formula: "1.200 EUR × 0,75 = 900 EUR",
    note: "Der Faktor ist für diese Konstellation einschlägig.",
    references: ["Tarifregel: Faktor 0,75"],
  },
  {
    id: "cap",
    label: "Höchstbetrag prüfen",
    status: "skipped",
    value: "keine Änderung",
    note: "Der berechnete Betrag liegt unterhalb des Höchstbetrags.",
    references: ["Fachregel: Höchstbetrag"],
  },
  {
    id: "rounding",
    label: "Rundung",
    status: "applied",
    value: "900 EUR",
    formula: "900 EUR → 900 EUR",
    note: "Beträge werden in ganzen Euro dargestellt.",
  },
];

const ASSUMPTIONS: CalculationAssumption[] = [
  {
    id: "factor-source",
    label: "Faktor",
    value: "0,75",
    validationHint:
      "Annahme zu validieren gegen die fachliche Tarifquelle vor produktiver Nutzung.",
  },
];

export const Nachvollziehbar: Story = {
  render: () => (
    <main className="sb-page">
      <CalculationTrace
        resultStatus="final"
        resultLabel="Berechneter Anspruch"
        resultValue="900 EUR"
        inputs={INPUTS}
        steps={STEPS}
        sources={[
          "Fachkonzept: Berechnungsregel",
          "Geprüfte Konfiguration: Tarifregel",
        ]}
      />
    </main>
  ),
};

export const MitAnnahmen: Story = {
  render: () => (
    <main className="sb-page">
      <CalculationTrace
        title="Vorläufige Berechnung prüfen"
        resultStatus="provisional"
        resultLabel="Vorläufiger Betrag"
        resultValue="900 EUR"
        inputs={INPUTS}
        steps={[
          ...STEPS.slice(0, 2),
          {
            id: "assumption",
            label: "Tarifannahme markieren",
            status: "assumption",
            value: "Faktor 0,75",
            note: "Dieser Wert ist als Annahme sichtbar und blockiert keine technische Vorschau.",
            references: ["TBD-FACHQUELLE"],
          },
        ]}
        assumptions={ASSUMPTIONS}
        sources={["Fachkonzept: offene Tarifvalidierung"]}
      />
    </main>
  ),
};

export const Blockiert: Story = {
  render: () => (
    <main className="sb-page">
      <CalculationTrace
        resultStatus="blocked"
        resultLabel="Berechnung nicht möglich"
        resultValue="offen"
        inputs={INPUTS.slice(0, 1)}
        steps={[
          {
            id: "missing-input",
            label: "Pflichtwert prüfen",
            status: "blocked",
            value: "fehlt",
            note: "Ein erforderlicher Eingabewert fehlt. Die Berechnung muss vor der Entscheidung vervollständigt werden.",
          },
        ]}
        sources={["Fachkonzept: Pflichtwertprüfung"]}
      />
    </main>
  ),
};

export const Leer: Story = {
  render: () => (
    <main className="sb-page">
      <CalculationTrace
        resultLabel="Noch kein Ergebnis"
        resultValue="offen"
        steps={[]}
      />
    </main>
  ),
};
