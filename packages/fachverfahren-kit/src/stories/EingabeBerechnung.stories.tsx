// Story: die EINGABE-/BERECHNUNGS-Bausteine des Kits — das Währungs-Eingabefeld (BetragEingabe), das DATEN-validierte
// Textfeld (ValidiertesFeld) und die read-only Gebühren-Aufstellung (GebuehrenAnzeige). Alle drei sind die EINGABE-
// bzw. AUSGABE-Seite zu `format.ts`/`lib/eingabe.ts`: der/die Bürger:in tippt in gewohnter de-DE-Schreibweise,
// `parseBetrag`/`validiereFeld` prüfen rein und deterministisch, die Anzeige formatiert über `formatBetrag`. Bewusst
// NEUTRAL (Position A/B, Muster-Beträge), damit die Story für JEDES Fachverfahren gilt — keine Domänen-Literale.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { BetragEingabe } from "../components/BetragEingabe.js";
import { GebuehrenAnzeige } from "../components/GebuehrenAnzeige.js";
import { ValidiertesFeld } from "../components/ValidiertesFeld.js";
import type { EingabeRegel } from "../lib/eingabe.js";
import type { Berechnung } from "../types.js";

// ── Neutrale Beispiel-Berechnung: zwei Positionen + Summe, Einheit EUR (natürliche Haupteinheit, kein Cent). ──
const beispielBerechnung: Berechnung = {
  betrag: 175,
  einheit: "EUR",
  label: "Beispiel-Gebühr",
  begruendung: "Summe der Positionen A und B (neutrales Muster-Beispiel).",
  status: "final",
  positionen: [
    { label: "Position A", betrag: 120 },
    { label: "Position B", betrag: 55 },
  ],
};

// Dieselbe Aufstellung, aber vorläufig (status: "provisional") — die Komponente weist das über einen Callout aus.
const vorlaeufigeBerechnung: Berechnung = {
  ...beispielBerechnung,
  status: "provisional",
};

// DATEN-getriebene Regeln — je eine je Typ (text/zahl/iban/datum). Werte sind generisch, keine Domänen-Literale.
const regelText: EingabeRegel = {
  typ: "text",
  pflicht: true,
  minLaenge: 3,
  maxLaenge: 40,
};
const regelZahl: EingabeRegel = {
  typ: "zahl",
  pflicht: true,
  min: 0,
  max: 100,
};
const regelIban: EingabeRegel = { typ: "iban", pflicht: true };
const regelDatum: EingabeRegel = { typ: "datum", pflicht: true };

/** BetragEingabe interaktiv: `wert` ist die kanonische Zahl (Euro) | null; die Komponente zeigt beim Blur die
 *  formatierte Vorschau ODER die Fehlermeldung. Darunter spiegelt die Story den zurückgemeldeten Wert. */
function BetragInteraktiv() {
  const [wert, setWert] = useState<number | null>(null);
  return (
    <div className="max-w-md space-y-3">
      <BetragEingabe
        name="beispiel.betrag"
        label="Betrag (Beispiel)"
        wert={wert}
        onWert={setWert}
        waehrung="EUR"
        pflicht
        hilfetext="In gewohnter Schreibweise, z. B. 1.234,56 — die Vorschau erscheint beim Verlassen des Feldes."
      />
      <p className="text-xs text-muted-foreground">
        Zurückgemeldeter Wert (onWert):{" "}
        {wert === null ? "— (leer oder ungültig)" : String(wert)}
      </p>
    </div>
  );
}

/** ValidiertesFeld mit je einer EingabeRegel für text/zahl/iban/datum — Live-Validierung ab dem ersten Blur. */
function ValidierteFelderInteraktiv() {
  const [text, setText] = useState("");
  const [zahl, setZahl] = useState("");
  const [iban, setIban] = useState("");
  const [datum, setDatum] = useState("");
  return (
    <div className="max-w-md space-y-6">
      <ValidiertesFeld
        name="feld.text"
        label="Kurzer Text (Pflicht)"
        regel={regelText}
        wert={text}
        onWert={setText}
        hilfetext="Mindestens 3, höchstens 40 Zeichen."
      />
      <ValidiertesFeld
        name="feld.zahl"
        label="Zahl"
        regel={regelZahl}
        wert={zahl}
        onWert={setZahl}
        hilfetext="Dezimalzahl zwischen 0 und 100 (z. B. 42,5)."
      />
      <ValidiertesFeld
        name="feld.iban"
        label="IBAN"
        regel={regelIban}
        wert={iban}
        onWert={setIban}
        hilfetext="Format und Prüfsumme (Mod 97) werden geprüft — z. B. DE00…"
      />
      <ValidiertesFeld
        name="feld.datum"
        label="Datum"
        regel={regelDatum}
        wert={datum}
        onWert={setDatum}
        hilfetext="Im Format TT.MM.JJJJ."
      />
    </div>
  );
}

const meta = {
  title: "Fachverfahren Kit/Eingabe & Berechnung/Bausteine",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Die Eingabe-/Berechnungs-Bausteine des Kits (BITV 2.0 / WCAG 2.2 AA): BetragEingabe (Währungsfeld, tippt frei de-DE, parst via parseBetrag beim Blur, Fehler ODER formatierte Vorschau), ValidiertesFeld (DATEN-getriebene EingabeRegel für Text/Zahl/IBAN/Datum, Live-Validierung ab dem ersten Blur) und GebuehrenAnzeige (read-only Aufstellung einer Berechnung: Positionen + Summe, einheitlich über formatBetrag). Alle Signale (Fehler, Vorläufigkeit) über Farbe + Icon + Text — nie über die Feldgröße.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Währungsfeld: freie Eingabe in de-DE, geparst beim Blur; gültig → formatierte Vorschau, ungültig → Fehlermeldung. */
export const Waehrungsfeld: Story = {
  render: () => <BetragInteraktiv />,
};

/** Validierte Felder: je eine EingabeRegel für Text/Zahl/IBAN/Datum — der Fehler erscheint nach dem ersten Blur. */
export const ValidierteFelder: Story = {
  render: () => <ValidierteFelderInteraktiv />,
};

/** Gebühren-Aufstellung: eine neutrale Berechnung (Position A + B = Summe), einheitlich in EUR formatiert. */
export const Gebuehrenaufstellung: Story = {
  render: () => (
    <div className="max-w-md">
      <GebuehrenAnzeige berechnung={beispielBerechnung} />
    </div>
  ),
};

/** Vorläufig: dieselbe Aufstellung mit `status: "provisional"` — ein Callout weist den vorläufigen Charakter aus. */
export const GebuehrenaufstellungVorlaeufig: Story = {
  render: () => (
    <div className="max-w-md">
      <GebuehrenAnzeige berechnung={vorlaeufigeBerechnung} />
    </div>
  ),
};
