// Stories: DossierAkte360 — die generische 360°-Dossier-/Fallakte-Sicht (Case-Management).
//
// Alle fachlichen Begriffe (Handlungsfelder, Phasen, Status) stehen AUSSCHLIESSLICH in den Props dieser Story
// (dem Aufrufer), NICHT in der Komponente — das belegt die Domänen-Neutralität. Sämtliche Daten sind
// SYNTHETISCH („Klient:in A", subject.1, Muster-Werte); keine echten Personen/PII.
import type { Meta, StoryObj } from "@storybook/react";

import {
  DossierAkte360,
  type DossierTermin,
  type DossierZiel,
} from "../components/DossierAkte360.js";
import type { DescriptionListItem } from "../components/DescriptionList.js";
import type { TimelineItem } from "../components/Timeline.js";
import { Badge } from "../ui/badge.js";

const meta: Meta<typeof DossierAkte360> = {
  title: "Fachverfahren/DossierAkte360",
  component: DossierAkte360,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DossierAkte360>;

// ── Synthetische Beispieldaten (Integrationsberatung als AUFRUFER-Kontext, kein Kit-Literal) ─────
const stammdaten: DescriptionListItem[] = [
  { label: "Geburtsdatum", value: "01.01.1990" },
  { label: "Nationalität", value: "Musterland" },
  { label: "Muttersprache", value: "Beispielisch" },
  { label: "Anschrift", value: "Musterstraße 1, 00000 Musterstadt" },
  { label: "Familienstand", value: "ledig" },
];

const ziele: DossierZiel[] = [
  {
    id: "ziel.1",
    titel: "Sprachkurs B1 abschließen",
    kategorie: "Handlungsfeld: Sprache",
    status: { label: "laufend", tone: "info" },
    frist: "30.09.2026",
    schritte: [
      { id: "s.1", label: "Kurs anmelden", erledigt: true },
      { id: "s.2", label: "Modul 1 besuchen", erledigt: true },
      { id: "s.3", label: "Modul 2 besuchen", erledigt: false },
      { id: "s.4", label: "Prüfung ablegen", erledigt: false },
    ],
  },
  {
    id: "ziel.2",
    titel: "Ausbildungsplatz finden",
    kategorie: "Handlungsfeld: Arbeit",
    status: { label: "neu", tone: "neu" },
    fortschrittProzent: 0,
    schritte: [{ id: "s.5", label: "Bewerbungsunterlagen erstellen" }],
  },
  {
    id: "ziel.3",
    titel: "Hausärztliche Anbindung",
    kategorie: "Handlungsfeld: Gesundheit",
    status: { label: "erreicht", tone: "ok" },
    fortschrittProzent: 100,
    schritte: [
      { id: "s.6", label: "Praxis auswählen", erledigt: true },
      { id: "s.7", label: "Ersttermin wahrnehmen", erledigt: true },
    ],
  },
];

const termine: DossierTermin[] = [
  {
    id: "t.1",
    titel: "Beratungsgespräch",
    zeit: "20.07.2026, 10:00",
    beschreibung: "Zielvereinbarung fortschreiben",
    badge: { label: "Bevorstehend", tone: "info" },
  },
  {
    id: "t.2",
    titel: "Nachweis Sprachkurs",
    zeit: "05.07.2026",
    beschreibung: "Teilnahmebestätigung ausstehend",
    badge: { label: "Überfällig", tone: "warn" },
  },
];

const verlauf: TimelineItem[] = [
  {
    id: "v.1",
    title: "Fall aufgenommen",
    time: "01.06.2026",
    tone: "info",
    state: "done",
  },
  {
    id: "v.2",
    title: "In Betreuung aktiviert",
    time: "03.06.2026",
    description: "Erstgespräch geführt, Handlungsfelder priorisiert.",
    tone: "ok",
    state: "done",
  },
  {
    id: "v.3",
    title: "Zielvereinbarung erstellt",
    time: "10.06.2026",
    tone: "ok",
    state: "current",
  },
];

/** Vollständig gefüllte Fallakte mit allen fünf Sektionen. */
export const Vollstaendig: Story = {
  render: () => (
    <div className="mx-auto max-w-3xl">
      <DossierAkte360
        titel="Klient:in A"
        untertitel="Fall FALL-2026-0001"
        merkmale={[
          { label: "Phase", value: "Orientierung", tone: "info" },
          { label: "Sprache", value: "Beispielisch" },
        ]}
        kopfAktion={<Badge tone="info">In Betreuung</Badge>}
        stammdaten={stammdaten}
        ziele={ziele}
        termine={termine}
        notizen={[
          {
            id: "n.1",
            text: "Klient:in wünscht Termine bevorzugt vormittags.",
            autor: "SB",
            zeit: "10.06.2026, 09:15",
          },
        ]}
        verlauf={verlauf}
        labels={{ ziele: "Integrationsziele" }}
      />
    </div>
  ),
};

/** Neuer, noch leerer Fall: jede Sektion zeigt ihren Leerzustand (role=status), keine stummen Listen. */
export const LeererFall: Story = {
  render: () => (
    <div className="mx-auto max-w-3xl">
      <DossierAkte360
        titel="Klient:in B"
        untertitel="Fall FALL-2026-0002 — neu aufgenommen"
        labels={{ ziele: "Integrationsziele" }}
      />
    </div>
  ),
};
