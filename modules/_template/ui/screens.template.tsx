// App-EINSTIEG des Moduls (Vorlage). Beim Befüllen nach `modules/<domain>/ui/screens.tsx` umbenennen + ausfüllen.
// Die laufende App entdeckt diese Datei automatisch (ModuleHost.tsx, import.meta.glob) und hängt die Screens unter
// „Fachverfahren" in die Bürger-/Sachbearbeitungs-Surface ein. KOMPONIERE @senticor/public-sector-ui (keine neuen
// Primitive). Referenz: modules/neutral-example/ui/screens.tsx.
import { useState } from "react";
import { FormStep, FormField } from "@senticor/public-sector-ui";

export const moduleMeta = {
  domain: "replace-with-domain",
  label: "Fachverfahren (ersetzen)",
  citizenLabel: "Antrag",
  caseworkerLabel: "Vorgänge",
};

export function CitizenScreen() {
  const [name, setName] = useState("");
  return (
    <FormStep
      title="Antrag (Vorlage)"
      description="Felder + Logik durch das Fachverfahren ersetzen."
    >
      <FormField
        id="name"
        label="Name"
        value={name}
        onChange={setName}
        required
        hint="Vor- und Nachname"
        autoComplete="name"
      />
    </FormStep>
  );
}

export function CaseworkerScreen() {
  return (
    <div style={{ padding: "1.5rem" }}>
      Sachbearbeitungs-Surface (Vorlage) — CaseInbox/CaseDetailPanel
      komponieren.
    </div>
  );
}
