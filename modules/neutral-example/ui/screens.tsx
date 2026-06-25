// App-MOUNT-Kontrakt eines Fachverfahren-Moduls. Die LAUFENDE App entdeckt jede `modules/<domain>/ui/screens.tsx`
// automatisch (import.meta.glob in apps/.../src/app/ModuleHost.tsx) und hängt die exportierten Screens in die
// passende Surface ein (Bürger / Sachbearbeitung / optional Aufsicht). So wird ein vom CHOS-Build gefülltes Modul
// OHNE App-Shell-Änderung in der laufenden App sichtbar — die `.stories.tsx` sind nur für Storybook, DIESE Datei
// ist der App-Einstieg.
//
// KERNREGEL: @senticor/public-sector-ui KOMPONIEREN, nicht nachbauen. Diese Datei ist die KOMPILIERENDE Referenz —
// Werte/Felder ersetzen, Struktur behalten. (Deterministisch: ISO-Datumsliteral statt Date.now().)
import { useState } from "react";
import {
  FormStep,
  FormField,
  CaseInbox,
  CaseDetailPanel,
  type FieldState,
  type CaseRow,
  type InboxFilter,
} from "@senticor/public-sector-ui";

/** Metadaten für den Mount (Navigations-Label + Surface-Beschriftung). `domain` MUSS dem Ordnernamen entsprechen. */
export const moduleMeta = {
  domain: "neutral-example",
  label: "Neutrales Beispiel",
  citizenLabel: "Antrag stellen",
  caseworkerLabel: "Vorgänge",
};

/** Bürger-Surface: geführte Antrags-Maske. Server-autoritative Prüfung gehört ins Modul (hier nur Client-Hilfe). */
export function CitizenScreen() {
  const [name, setName] = useState("");
  const [plz, setPlz] = useState("");
  const [summary, setSummary] = useState("");
  const plzState: FieldState | undefined =
    plz === "" ? undefined : /^\d{5}$/.test(plz) ? "ok" : "err";
  return (
    <FormStep
      title="Antrag — Neutrales Beispiel"
      description="Generische Referenz-Maske. Ersetze Felder/Logik durch das Fachverfahren."
    >
      <FormField
        id="ne-name"
        label="Name"
        value={name}
        onChange={setName}
        required
        hint="Vor- und Nachname"
        autoComplete="name"
      />
      <FormField
        id="ne-plz"
        label="Postleitzahl"
        value={plz}
        onChange={setPlz}
        required
        hint="5-stellig"
        autoComplete="postal-code"
        // optionale Props nur setzen, wenn definiert (exactOptionalPropertyTypes: kein `undefined` durchreichen).
        {...(plzState ? { state: plzState } : {})}
        {...(plzState === "err"
          ? { message: "Bitte 5 Ziffern eingeben." }
          : {})}
      />
      <FormField
        id="ne-summary"
        label="Anliegen"
        value={summary}
        onChange={setSummary}
        hint="Kurzbeschreibung des Anliegens"
      />
    </FormStep>
  );
}

const demoCases: CaseRow[] = [
  {
    id: "NE-2026-0001",
    applicant: "Anna Muster",
    subject: "Neutrales Beispiel – Antrag",
    status: "offen",
    dueAt: "2026-07-01",
  },
  {
    id: "NE-2026-0002",
    applicant: "Max Beispiel",
    subject: "Neutrales Beispiel – Nachforderung",
    status: "in-pruefung",
    dueAt: "2026-06-28",
    overdue: true,
  },
];
const demoFilters: InboxFilter[] = [
  { label: "Offen", value: "offen", count: 1 },
  { label: "In Prüfung", value: "in-pruefung", count: 1 },
];

/** Sachbearbeitungs-Surface: Posteingang + Detailpanel (4-Augen-Aktionen kämen in den children-Slot). */
export function CaseworkerScreen() {
  // immer ein definierter Fall ausgewählt (exactOptionalPropertyTypes: selectedId/row dürfen nicht undefined sein).
  const [selectedId, setSelectedId] = useState<string>(demoCases[0]!.id);
  const [activeFilters, setActiveFilters] = useState<string[]>([
    "offen",
    "in-pruefung",
  ]);
  const selected = demoCases.find((c) => c.id === selectedId) ?? demoCases[0]!;
  const toggleFilter = (value: string) =>
    setActiveFilters((f) =>
      f.includes(value)
        ? f.length > 1
          ? f.filter((x) => x !== value)
          : f
        : [...f, value],
    );
  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      }}
    >
      <CaseInbox
        cases={demoCases}
        selectedId={selectedId}
        onSelect={setSelectedId}
        filters={demoFilters}
        activeFilters={activeFilters}
        onToggleFilter={toggleFilter}
      />
      <CaseDetailPanel row={selected} />
    </div>
  );
}
