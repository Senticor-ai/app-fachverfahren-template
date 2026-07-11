import { describe, it, expect } from "vitest";
import { createWorkspaceStore, feldFehler, stepGueltig } from "./index.js";
import type { LeistungConfig, StepDef, WorkspaceConfig } from "./types.js";

// Durable, CI-sichere Bürger-Antrag-JOURNEY über die ECHTEN Kit-/Store-Funktionen (kein Browser, keine
// nachgebaute Logik): Pflichtfeld-Validierung blockt den unvollständigen Antrag → der vollständige Antrag wird
// über `einreichen` zu GENAU EINEM Vorgang, der die Antragsdaten trägt und im Arbeitsvorrat auftaucht.
// Schliesst den Audit-Blocker „Bürger Antrag→Absenden nirgends e2e getestet" als persistenten Test.

const antragStep: StepDef = {
  id: "antragsteller",
  titel: "Antragsteller",
  felder: [
    { name: "name", label: "Name", typ: "text", required: true },
    { name: "plz", label: "Postleitzahl", typ: "plz", required: true },
    {
      name: "kategorie",
      label: "Kategorie",
      typ: "select",
      required: true,
      options: [
        { value: "a", label: "Kategorie A" },
        { value: "b", label: "Kategorie B" },
      ],
    },
  ],
};

const config: LeistungConfig = {
  id: "gebuehr",
  label: "Gebührenantrag",
  kommune: "Musterstadt",
  rechtsgrundlagen: [{ norm: "§ 1", titel: "Demo" }],
  antrag: { steps: [antragStep] },
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "geprueft", label: "Geprüft", tone: "ok", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "geprueft",
        label: "Prüfen",
        rollen: ["sachbearbeitung"],
      },
    ],
  },
  register: { suchfelder: ["name"] },
  detailSektionen: [
    { titel: "Antrag", felder: [{ pfad: "name", label: "Name" }] },
  ],
};

const workspaceConfig: WorkspaceConfig = {
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  verfahren: [{ procedureId: "gebuehr", config }],
  prioritaeten: [{ key: "normal", label: "Normal", tone: "info", ordinal: 1 }],
  labels: [],
};

const NOW = () => "2026-06-01T00:00:00.000Z";
const wert = (daten: Record<string, unknown>, name: string): unknown =>
  daten[name];

describe("Bürger-Antrag-Journey — Validierung → Einreichen → Vorgang", () => {
  it("BLOCKT einen unvollständigen Antrag (fehlende Pflichtfelder) — kein Absenden möglich", () => {
    const unvollstaendig = { name: "Muster" }; // plz + kategorie fehlen
    expect(stepGueltig(antragStep, unvollstaendig)).toBe(false);
    // Jedes fehlende Pflichtfeld meldet einen Fehler.
    expect(feldFehler(antragStep.felder[1]!, undefined)).not.toBeNull(); // plz
    expect(feldFehler(antragStep.felder[2]!, undefined)).not.toBeNull(); // kategorie
  });

  it("BLOCKT eine wohlgeformt-aber-ungültige Pflichtangabe (PLZ zu kurz)", () => {
    const falschePlz = { name: "Muster", plz: "12", kategorie: "a" };
    expect(stepGueltig(antragStep, falschePlz)).toBe(false);
    expect(feldFehler(antragStep.felder[1]!, "12")).not.toBeNull();
  });

  it("GIBT einen vollständigen, gültigen Antrag frei (alle Pflichtfelder ok)", () => {
    const vollstaendig = { name: "Muster", plz: "12345", kategorie: "a" };
    expect(stepGueltig(antragStep, vollstaendig)).toBe(true);
    for (const feld of antragStep.felder) {
      expect(feldFehler(feld, wert(vollstaendig, feld.name))).toBeNull();
    }
  });

  it("EINREICHEN erzeugt GENAU EINEN Vorgang mit den Antragsdaten, im Arbeitsvorrat sichtbar", () => {
    const store = createWorkspaceStore(workspaceConfig, { now: NOW });
    const vorher = store.listTasks().length;
    const daten = { name: "Muster", plz: "12345", kategorie: "a" };

    const vorgang = store.portFor("gebuehr")!.einreichen(daten);

    // Genau ein neuer Vorgang.
    expect(store.listTasks().length).toBe(vorher + 1);
    // Initial-Status der StatusMachine.
    expect(vorgang.status).toBe("eingegangen");
    // Die Antragsdaten sind IM Vorgang angekommen (nicht verloren — Wurzel des „alles-0"-Bugs).
    expect(vorgang.antragsdaten).toMatchObject({
      name: "Muster",
      plz: "12345",
      kategorie: "a",
    });
    // Im verfahrensübergreifenden Arbeitsvorrat auffindbar, richtig zugeordnet.
    const task = store.getTask(vorgang.id);
    expect(task).toBeDefined();
    expect(task!.procedureId).toBe("gebuehr");
    expect(task!.vorgangId).toBe(vorgang.id);
  });
});
