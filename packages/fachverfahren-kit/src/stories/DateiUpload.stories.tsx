// Story: der generische Nachweis-Upload (DateiUpload) — DATEN-getriebene Positionen, barrierefreie Dropzones und
// server-autoritative Detail-Zustände (uploading/scanning/rejected). Die Einschränkungen (erlaubte Typen, maximale
// Größe) kommen als DATEN am `Nachweis` und steuern accept + Hinweis + Fail-Fast-Vorprüfung — KEINE Domänen-Literale
// im Kit. Bewusst NEUTRAL (Muster-Nachweise), damit die Story für JEDES Fachverfahren gilt.
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { DateiUpload } from "../components/DateiUpload.js";
import { StatusRegionProvider } from "../components/StatusRegion.js";
import type { Nachweis } from "../types.js";

// Verfahrensfreie Beispiel-Nachweise. `akzeptierteTypen`/`maxGroesseBytes` sind OPTIONAL: ein Nachweis ohne sie
// akzeptiert wie bisher jede Datei.
const nachweiseMitEinschraenkung: Nachweis[] = [
  {
    id: "identitaet",
    label: "Identitätsnachweis",
    hochgeladen: false,
    erforderlich: true,
    akzeptierteTypen: ["application/pdf", "image/*"],
    maxGroesseBytes: 10 * 1024 * 1024,
  },
  {
    id: "ergaenzung",
    label: "Ergänzende Unterlage",
    hochgeladen: false,
    akzeptierteTypen: [".pdf"],
    maxGroesseBytes: 5 * 1024 * 1024,
  },
];

const nachweiseSchlicht: Nachweis[] = [
  { id: "beleg-a", label: "Beleg A", hochgeladen: true, erforderlich: true },
  { id: "beleg-b", label: "Beleg B", hochgeladen: false },
];

function Interaktiv({ nachweise }: { nachweise: Nachweis[] }) {
  const [log, setLog] = useState<string>("");
  return (
    <StatusRegionProvider>
      <div className="max-w-2xl">
        <DateiUpload
          nachweise={nachweise}
          onChange={(id, datei) =>
            setLog(
              datei
                ? `onChange(${id}): ${datei.name} (${datei.groesse} B)`
                : `onChange(${id}): entfernt`,
            )
          }
        />
        <p className="mt-3 text-xs text-muted-foreground">{log}</p>
      </div>
    </StatusRegionProvider>
  );
}

const meta = {
  title: "Fachverfahren/Nachweis-Upload",
  parameters: {
    docs: {
      description: {
        component:
          "Barrierefreier, DATEN-getriebener Nachweis-Upload (BITV 2.0 / WCAG 2.2 AA): je Position eine tastaturbedienbare Dropzone, aria-live-Statusansagen, sichtbarer Fokus. Erlaubte Typen und Maximalgröße sind DATEN am Nachweis (accept + Hinweis + Fail-Fast-Vorprüfung). Der Server bleibt für Format/Größe/Virenscan autoritativ (Loading/Scanning/Rejected).",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default: erlaubte Typen + Maximalgröße als DATEN → sichtbarer Einschränkungs-Hinweis + accept + Vorprüfung. */
export const MitEinschraenkungen: Story = {
  render: () => <Interaktiv nachweise={nachweiseMitEinschraenkung} />,
};

/** Ohne Einschränkungen: verhält sich wie bisher (jeder Typ), eine Position ist bereits serverseitig hochgeladen. */
export const OhneEinschraenkungen: Story = {
  render: () => <Interaktiv nachweise={nachweiseSchlicht} />,
};

/** Empty: der Antrag fordert keine Nachweise. */
export const Empty: Story = {
  render: () => <Interaktiv nachweise={[]} />,
};

/** Server-autoritative Detail-Zustände: Übertragung (mit Fortschritt), Virenscan, Ablehnung — vom Server gemeldet. */
export const ServerZustaende: Story = {
  render: () => (
    <StatusRegionProvider>
      <div className="max-w-2xl">
        <DateiUpload
          nachweise={[
            {
              id: "u",
              label: "Wird übertragen",
              hochgeladen: false,
              erforderlich: true,
            },
            { id: "s", label: "Virenscan läuft", hochgeladen: false },
            {
              id: "r",
              label: "Abgelehnt",
              hochgeladen: false,
              erforderlich: true,
            },
          ]}
          onChange={() => {}}
          uploadStatus={{
            u: { phase: "uploading", fortschritt: 62 },
            s: { phase: "scanning" },
            r: {
              phase: "rejected",
              grund: "groesse",
              meldung: "Die Datei überschreitet die zulässige Größe.",
            },
          }}
        />
      </div>
    </StatusRegionProvider>
  ),
};
