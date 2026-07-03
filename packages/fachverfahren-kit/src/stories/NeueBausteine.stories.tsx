// Stories: die NEUEN generischen Bausteine (M-Welle) — je EINE Story pro Baustein unter dem gemeinsamen Meta-Titel
// „Fachverfahren Kit/Neu". Bewusst NEUTRAL (Muster-/Beispielwerte, keine Domäne, keine echten Namen/Städte), damit
// die Stories für JEDES Fachverfahren gelten. Bausteine, die über die zentrale StatusRegion ANSAGEN
// (NotificationCenter/FristenKalender/SprachvariantenText/DruckAnsicht/ExportDialog/ThemeToggle/
// BarrierefreiheitsPanel), sind in <StatusRegionProvider> gewrappt, damit `announce` real greift.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { WorkflowDiagramm } from "../components/WorkflowDiagramm.js";
import { VergleichsAnsicht } from "../components/VergleichsAnsicht.js";
import {
  NotificationCenter,
  type Benachrichtigung,
} from "../components/NotificationCenter.js";
import {
  FristenKalender,
  type KalenderEintrag,
} from "../components/FristenKalender.js";
import {
  VertretungPanel,
  type Vertretung,
} from "../components/VertretungPanel.js";
import { SprachvariantenText } from "../components/SprachvariantenText.js";
import { DruckAnsicht } from "../components/DruckAnsicht.js";
import { ExportDialog } from "../components/ExportDialog.js";
import { ThemeToggle } from "../components/ThemeToggle.js";
import { BarrierefreiheitsPanel } from "../components/BarrierefreiheitsPanel.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import { Button } from "../ui/button.js";
import type { StatusMachine } from "../types.js";

// ── Neutrale Beispiel-Zustandsmaschine: eingegangen → in-pruefung → entschieden (terminal). ──
const beispielStatusMachine: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "in-pruefung", label: "In Prüfung", tone: "info" },
    { key: "entschieden", label: "Entschieden", tone: "ok", terminal: true },
  ],
  transitions: [
    {
      from: "eingegangen",
      to: "in-pruefung",
      label: "Zur Prüfung",
      rollen: ["sachbearbeitung"],
    },
    {
      from: "in-pruefung",
      to: "entschieden",
      label: "Entscheiden",
      rollen: ["sachbearbeitung"],
      vierAugen: true,
      detailPflicht: true,
    },
  ],
};

// ── Interaktive Beispiel-Wrapper (Hooks leben in Komponenten, nicht in `render`) ─────────────────

/** NotificationCenter mit lokalem Lese-Status: einzeln oder alle als gelesen markieren. */
function NotificationBeispiel() {
  const [eintraege, setEintraege] = useState<Benachrichtigung[]>([
    {
      id: "n1",
      titel: "Entwurf gespeichert",
      text: "Ihre Angaben wurden zwischengespeichert.",
      typ: "ok",
      zeitIso: "2026-01-05T09:15:00",
    },
    {
      id: "n2",
      titel: "Prüfung gestartet",
      text: "Der Vorgang wird derzeit bearbeitet.",
      typ: "info",
      zeitIso: "2026-01-05T10:30:00",
      gelesen: true,
    },
    {
      id: "n3",
      titel: "Unterlage fehlt",
      text: "Bitte reichen Sie den ausstehenden Nachweis nach.",
      typ: "warn",
      zeitIso: "2026-01-05T11:45:00",
    },
  ]);

  const markiere = (id: string) =>
    setEintraege((vorher) =>
      vorher.map((n) => (n.id === id ? { ...n, gelesen: true } : n)),
    );
  const alle = () =>
    setEintraege((vorher) => vorher.map((n) => ({ ...n, gelesen: true })));

  return (
    <StatusRegionProvider>
      <div className="max-w-xl">
        <NotificationCenter
          benachrichtigungen={eintraege}
          onMarkiereGelesen={markiere}
          onAlleGelesen={alle}
        />
      </div>
    </StatusRegionProvider>
  );
}

const kalenderEintraege: KalenderEintrag[] = [
  { datum: "2026-02-10", label: "Frist zur Stellungnahme", art: "frist" },
  { datum: "2026-02-17", label: "Beratungstermin", art: "termin" },
  {
    datum: "2026-02-24",
    label: "Erinnerung: Unterlagen sichten",
    art: "hinweis",
  },
];

/** FristenKalender mit vorgewähltem Tag; die Auswahl listet die Einträge des Tages. */
function KalenderBeispiel() {
  const [tag, setTag] = useState<Date | undefined>(new Date(2026, 1, 10));
  return (
    <StatusRegionProvider>
      <div className="max-w-2xl">
        <FristenKalender
          eintraege={kalenderEintraege}
          ausgewaehlt={tag}
          onAuswahl={setTag}
        />
      </div>
    </StatusRegionProvider>
  );
}

/** VertretungPanel als Formular (mit gespiegeltem Wert) plus eine nur-lesende Beispiel-Ansicht. */
function VertretungBeispiel() {
  const [vertretung, setVertretung] = useState<Vertretung>({
    vertreterName: "",
    umfang: "",
  });
  return (
    <div className="max-w-2xl space-y-4">
      <VertretungPanel onChange={setVertretung} />
      <p className="text-xs text-muted-foreground">
        Erfasste bevollmächtigte Stelle: {vertretung.vertreterName || "—"}
      </p>
      <VertretungPanel
        readOnly
        titel="Beispiel (nur Anzeige)"
        vertretung={{
          vertreterName: "Muster-Kanzlei",
          umfang: "Vertretung im gesamten Verfahren",
          gueltigVonIso: "2026-01-01",
          gueltigBisIso: "2026-12-31",
        }}
      />
    </div>
  );
}

/** SprachvariantenText: derselbe Inhalt in Standard- und Leichter Sprache (lang-Attribut je Variante). */
function SprachvariantenBeispiel() {
  const [code, setCode] = useState("de");
  return (
    <StatusRegionProvider>
      <div className="max-w-2xl">
        <SprachvariantenText
          titel="Erläuterung zum Antrag"
          aktiv={code}
          onWechsel={setCode}
          varianten={[
            {
              code: "de",
              label: "Standardsprache",
              text: "Dieser Antrag erfasst Ihre Angaben Schritt für Schritt. Nach dem Absenden prüft die zuständige Stelle die Unterlagen und teilt Ihnen das Ergebnis schriftlich mit.",
            },
            {
              code: "de-x-leicht",
              label: "Leichte Sprache",
              text: "Sie füllen den Antrag Schritt für Schritt aus. Danach prüft die Behörde Ihre Angaben. Sie bekommen dann eine Antwort.",
            },
          ]}
        />
      </div>
    </StatusRegionProvider>
  );
}

const meta = {
  title: "Fachverfahren Kit/Neu",
  parameters: {
    docs: {
      description: {
        component:
          "Neue generische, config-getriebene Bausteine (BITV 2.0 / WCAG 2.2 AA): Ablauf-Diagramm, Zwei-Spalten-Vergleich, flüchtige In-App-Benachrichtigungen, Fristen-Kalender, Vertretung/Vollmacht, Sprachvarianten (inkl. Leichte Sprache), Druck-Ansicht, CSV-Export, Farbschema- und Barrierefreiheits-Steuerung. NEUTRAL gehalten — alle Inhalte kommen als DATEN über Props.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** WorkflowDiagramm — visualisiert die `StatusMachine` als Mermaid-Zustandsdiagramm (SICHT auf denselben Vertrag). */
export const WorkflowDiagrammStory: Story = {
  name: "WorkflowDiagramm",
  render: () => (
    <div className="max-w-2xl">
      <WorkflowDiagramm statusMachine={beispielStatusMachine} />
    </div>
  ),
};

/** VergleichsAnsicht — Antrag vs. Register: ein paar abweichende Felder werden mehrkanalig markiert. */
export const VergleichsAnsichtStory: Story = {
  name: "VergleichsAnsicht",
  render: () => (
    <div className="max-w-3xl">
      <VergleichsAnsicht
        titel="Antrag und Registerdaten im Vergleich"
        links={{
          label: "Antrag",
          eintraege: [
            { feld: "name", label: "Name", wert: "Muster, A." },
            { feld: "geburtsdatum", label: "Geburtsdatum", wert: "1980-01-01" },
            { feld: "plz", label: "Postleitzahl", wert: "00000" },
            { feld: "ort", label: "Ort", wert: "Musterort" },
          ],
        }}
        rechts={{
          label: "Register",
          eintraege: [
            { feld: "name", label: "Name", wert: "Muster, A." },
            { feld: "geburtsdatum", label: "Geburtsdatum", wert: "1980-01-02" },
            { feld: "plz", label: "Postleitzahl", wert: "11111" },
            { feld: "ort", label: "Ort", wert: "Musterort" },
          ],
        }}
      />
    </div>
  ),
};

/** NotificationCenter — flüchtige In-App-Hinweise (info/ok/warn) mit Lese-Status; KEINE förmliche Zustellung. */
export const NotificationCenterStory: Story = {
  name: "NotificationCenter",
  render: () => <NotificationBeispiel />,
};

/** FristenKalender — Monats-Überblick über Fristen/Termine als DATEN (2–3 Einträge). */
export const FristenKalenderStory: Story = {
  name: "FristenKalender",
  render: () => <KalenderBeispiel />,
};

/** VertretungPanel — Vollmacht/Vertretung erfassen (Formular) und nur-lesend anzeigen. */
export const VertretungPanelStory: Story = {
  name: "VertretungPanel",
  render: () => <VertretungBeispiel />,
};

/** SprachvariantenText — Standardsprache + Leichte Sprache, korrektes lang-Attribut je Variante. */
export const SprachvariantenTextStory: Story = {
  name: "SprachvariantenText",
  render: () => <SprachvariantenBeispiel />,
};

/** DruckAnsicht — druckfreundliche Zusammenfassung; die Bedienleiste (.no-print) entfällt im Ausdruck. */
export const DruckAnsichtStory: Story = {
  name: "DruckAnsicht",
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-2xl">
        <DruckAnsicht
          titel="Zusammenfassung des Antrags"
          untertitel="Aktenzeichen: MUSTER-0001/26"
          fusszeile="Stand: 05.01.2026 — Muster-Behörde"
        >
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Antragsart</dt>
            <dd className="font-medium text-foreground">Muster-Leistung</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium text-foreground">In Prüfung</dd>
            <dt className="text-muted-foreground">Eingang</dt>
            <dd className="font-medium text-foreground">05.01.2026</dd>
          </dl>
        </DruckAnsicht>
      </div>
    </StatusRegionProvider>
  ),
};

/** ExportDialog — CSV-Export einer Beispiel-Tabelle mit Spaltenauswahl (lokaler Blob-Download, kein Netz). */
export const ExportDialogStory: Story = {
  name: "ExportDialog",
  render: () => (
    <StatusRegionProvider>
      <ExportDialog
        titel="Vorgänge exportieren"
        dateiname="vorgaenge.csv"
        zeilen={[
          {
            az: "MUSTER-0001/26",
            status: "Eingegangen",
            eingang: "2026-01-05",
          },
          { az: "MUSTER-0002/26", status: "In Prüfung", eingang: "2026-01-08" },
          {
            az: "MUSTER-0003/26",
            status: "Entschieden",
            eingang: "2026-01-12",
          },
        ]}
        spalten={[
          { key: "az", label: "Aktenzeichen" },
          { key: "status", label: "Status" },
          { key: "eingang", label: "Eingang" },
        ]}
      >
        <Button variant="outline">Exportieren</Button>
      </ExportDialog>
    </StatusRegionProvider>
  ),
};

/** ThemeToggle — 3-Wege-Farbschema (Hell/Dunkel/System), Wahl über die zentrale StatusRegion angesagt. */
export const ThemeToggleStory: Story = {
  name: "ThemeToggle",
  render: () => (
    <StatusRegionProvider>
      <ThemeToggle />
    </StatusRegionProvider>
  ),
};

/** BarrierefreiheitsPanel — Schalter für Schrift/Kontrast/Bewegung/Kompaktheit; jede Umschaltung wird angesagt. */
export const BarrierefreiheitsPanelStory: Story = {
  name: "BarrierefreiheitsPanel",
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-md">
        <BarrierefreiheitsPanel />
      </div>
    </StatusRegionProvider>
  ),
};
