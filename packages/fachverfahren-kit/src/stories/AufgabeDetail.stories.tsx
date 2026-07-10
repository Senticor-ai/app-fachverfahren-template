// Stories: die Aufgaben-Detail-Bausteine (Phase 7) — KommentarThread, AktivitaetsFeed, RelationPanel. Je EINE Story
// unter dem gemeinsamen Meta-Titel „Fachverfahren Kit/Neu". Bewusst NEUTRAL (Muster-/Beispielwerte, keine echten
// Namen), damit sie für JEDES Fachverfahren gelten. Alle Inhalte kommen als DATEN über Props.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { KommentarThread } from "../components/KommentarThread.js";
import { AktivitaetsFeed } from "../components/AktivitaetsFeed.js";
import { RelationPanel } from "../components/RelationPanel.js";
import { TriageInbox } from "../components/TriageInbox.js";
import { KiSidecar } from "../components/KiSidecar.js";
import { BenutzerEinstellungen } from "../components/BenutzerEinstellungen.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { createStubAiAssistPort } from "../lib/ai-assist.js";
import type {
  AufgabeAktivitaet,
  AufgabeBeziehung,
  AufgabeKommentar,
  InboxItem,
} from "../types.js";

const kommentare: AufgabeKommentar[] = [
  {
    id: "k1",
    aufgabeId: "aufgabe-1",
    autorAkteurId: "sb.a",
    text: "Nachweis der Voraussetzungen liegt vor, Betrag plausibel.",
    erstelltIso: "2026-07-08T09:12:00.000Z",
  },
  {
    id: "k2",
    aufgabeId: "aufgabe-1",
    autorAkteurId: "sb.b",
    text: "Zweitprüfung angefordert (Vier-Augen).",
    erstelltIso: "2026-07-08T11:30:00.000Z",
  },
];

const aktivitaeten: AufgabeAktivitaet[] = [
  {
    id: "a1",
    aufgabeId: "aufgabe-1",
    akteurId: "sb.a",
    typ: "task.commented",
    zeitpunktIso: "2026-07-08T09:12:00.000Z",
  },
  {
    id: "a2",
    aufgabeId: "aufgabe-1",
    akteurId: "sb.a",
    typ: "task.ki-uebernommen",
    payload: { marking: "ki-vorschlag", prioritaet: "hoch" },
    zeitpunktIso: "2026-07-08T10:00:00.000Z",
  },
];

const beziehungen: AufgabeBeziehung[] = [
  {
    id: "b1",
    aufgabeId: "aufgabe-1",
    verknuepfteAufgabeId: "aufgabe-7",
    typ: "blocks",
    erstelltIso: "2026-07-08T08:00:00.000Z",
  },
  {
    id: "b2",
    aufgabeId: "aufgabe-1",
    verknuepfteAufgabeId: "aufgabe-3",
    typ: "relates",
    erstelltIso: "2026-07-08T08:05:00.000Z",
  },
];

const typLabels: Record<string, string> = {
  "task.commented": "Vermerk angelegt",
  "task.ki-uebernommen": "KI-Vorschlag übernommen",
};

const beziehungsLabels = {
  blocks: "blockiert",
  "blocked-by": "blockiert von",
  duplicate: "Dublette von",
  relates: "bezieht sich auf",
  "widerspruch-zu": "Widerspruch zu",
} as const;

const meta = {
  title: "Fachverfahren Kit/Neu",
  parameters: {
    docs: {
      description: {
        component:
          "Aufgaben-Detail-Bausteine (Phase 7, BITV 2.0 / WCAG 2.2 AA): interne Vermerke (append-only, rollen-gated), Aktivitäts-Feed (append-only, KI-Herkunft sichtbar) und Beziehungen zwischen Aufgaben. NEUTRAL gehalten — alle Inhalte kommen als DATEN über Props.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** KommentarThread — append-only Vermerke mit rollen-gated Composer. */
export const KommentarThreadStory: Story = {
  name: "KommentarThread",
  render: () => {
    const [liste, setListe] = useState<AufgabeKommentar[]>(kommentare);
    return (
      <div className="max-w-xl">
        <KommentarThread
          kommentare={liste}
          schreibenErlaubt
          onVermerk={(text) =>
            setListe((v) => [
              ...v,
              {
                id: `k${v.length + 1}`,
                aufgabeId: "aufgabe-1",
                autorAkteurId: "sb.angemeldet",
                text,
                erstelltIso: "2026-07-08T12:00:00.000Z",
              },
            ])
          }
        />
      </div>
    );
  },
};

/** KommentarThread (leer, ohne Schreibrecht) — Bürgerrollen sehen keinen Composer. */
export const KommentarThreadLeerStory: Story = {
  name: "KommentarThread — leer",
  render: () => (
    <div className="max-w-xl">
      <KommentarThread kommentare={[]} />
    </div>
  ),
};

/** AktivitaetsFeed — append-only Aktivität, KI-Herkunft als Badge sichtbar. */
export const AktivitaetsFeedStory: Story = {
  name: "AktivitaetsFeed",
  render: () => (
    <div className="max-w-xl">
      <AktivitaetsFeed aktivitaeten={aktivitaeten} typLabels={typLabels} />
    </div>
  ),
};

/** AktivitaetsFeed (leer) — noch keine Aktivität zu dieser Aufgabe (Empty-State). */
export const AktivitaetsFeedLeerStory: Story = {
  name: "AktivitaetsFeed — leer",
  render: () => (
    <div className="max-w-xl">
      <AktivitaetsFeed aktivitaeten={[]} typLabels={typLabels} />
    </div>
  ),
};

/** RelationPanel — Beziehungen zwischen Aufgaben, entfernbar. */
export const RelationPanelStory: Story = {
  name: "RelationPanel",
  render: () => {
    const [liste, setListe] = useState<AufgabeBeziehung[]>(beziehungen);
    return (
      <div className="max-w-xl">
        <RelationPanel
          beziehungen={liste}
          typLabels={beziehungsLabels}
          bearbeitenErlaubt
          onEntfernen={(id) => setListe((v) => v.filter((b) => b.id !== id))}
        />
      </div>
    );
  },
};

/** RelationPanel (leer, ohne Bearbeitungsrecht) — keine verknüpften Aufgaben, Bürgerrolle sieht keinen Entfernen-Knopf. */
export const RelationPanelLeerStory: Story = {
  name: "RelationPanel — leer",
  render: () => (
    <div className="max-w-xl">
      <RelationPanel beziehungen={[]} typLabels={beziehungsLabels} />
    </div>
  ),
};

const eingaenge: InboxItem[] = [
  {
    id: "inbox-1",
    procedureId: "musterantrag",
    tenantId: "demo-tenant",
    authorityId: "demo-authority",
    jurisdictionId: "de",
    quelle: "antrag",
    eingangIso: "2026-07-09T08:00:00.000Z",
    triageStatus: "pending",
    rohdaten: {},
    betreff: "Neuer Eingang · Musterantrag",
  },
  {
    id: "inbox-2",
    procedureId: "musterbescheinigung",
    tenantId: "demo-tenant",
    authorityId: "demo-authority",
    jurisdictionId: "de",
    quelle: "register",
    eingangIso: "2026-07-09T07:00:00.000Z",
    triageStatus: "pending",
    rohdaten: {},
    betreff: "Neuer Eingang · Musterbescheinigung",
  },
];

const verfahrenLabels: Record<string, string> = {
  musterantrag: "Musterantrag",
  musterbescheinigung: "Musterbescheinigung",
};

/** TriageInbox — verfahrensübergreifender Eingang mit Annehmen/Dublette/Zurückstellen/Ablehnen. */
export const TriageInboxStory: Story = {
  name: "TriageInbox",
  render: () => {
    const [liste, setListe] = useState<InboxItem[]>(eingaenge);
    return (
      <div className="max-w-3xl">
        <TriageInbox
          eingaenge={liste}
          verfahrenLabel={(p) => verfahrenLabels[p] ?? p}
          quelleLabel={{ antrag: "Antrag", register: "Register" }}
          onAnnehmen={(id) => setListe((v) => v.filter((e) => e.id !== id))}
          onTriage={(id) => setListe((v) => v.filter((e) => e.id !== id))}
        />
      </div>
    );
  },
};

/** TriageInbox (leer) — alles triagiert (Empty-State). */
export const TriageInboxLeerStory: Story = {
  name: "TriageInbox — leer",
  render: () => (
    <div className="max-w-3xl">
      <TriageInbox eingaenge={[]} onAnnehmen={() => {}} onTriage={() => {}} />
    </div>
  ),
};

const stubKi = createStubAiAssistPort({
  quelle: "Heuristik (Demo-Stub)",
  standardKonfidenz: 0.72,
  generator: () => ({
    wert: "Priorität: hoch",
    begruendung:
      "Restfrist knapp und ein Nachweis fehlt — Vorschlag zur Höherstufung. Die Entscheidung liegt bei Ihnen.",
  }),
});

/** KiSidecar — assistiver, transparenter KI-Vorschlag (EU-AI-Act Art. 50, HITL: Mensch entscheidet). */
export const KiSidecarStory: Story = {
  name: "KiSidecar",
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-md">
        <KiSidecar
          kiAssist={stubKi}
          eingabe={{ text: "Vorgang FV-2026-0001 — Musterantrag, Kategorie A" }}
          funktionsName="Priorisierung"
          onUebernahme={() => {}}
        />
      </div>
    </StatusRegionProvider>
  ),
};

/** BenutzerEinstellungen — persönliche Präferenzen (Theme + Startansicht + Darstellung), kontrolliert. */
export const BenutzerEinstellungenStory: Story = {
  name: "BenutzerEinstellungen",
  render: () => {
    const [prefs, setPrefs] = useState({
      standardansicht: "inbox",
      kompakteListen: false,
    });
    return (
      <StatusRegionProvider>
        <BenutzerEinstellungen
          praeferenzen={prefs}
          ansichten={[
            { wert: "inbox", label: "Eingang" },
            { wert: "liste", label: "Alle Verfahren" },
            { wert: "board", label: "Board" },
          ]}
          onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
        />
      </StatusRegionProvider>
    );
  },
};
