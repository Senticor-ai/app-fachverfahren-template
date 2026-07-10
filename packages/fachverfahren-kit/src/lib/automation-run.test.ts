import { describe, it, expect } from "vitest";
import type { LeistungConfig, WorkspaceConfig } from "../types.js";
import { createWorkspaceStore } from "../store.js";
import { evalAutomationen } from "./automation.js";
import { wendeAutomationEffekteAn } from "./automation-run.js";

// Ein Verfahren mit einem NORMALEN und einem VIER-AUGEN-Übergang, plus Automations-Regeln.
function macheConfig(): LeistungConfig {
  return {
    id: "leistung-a",
    label: "Leistung A",
    kommune: "Musterstadt",
    rechtsgrundlagen: [],
    antrag: {
      steps: [
        {
          id: "s1",
          titel: "Angaben",
          felder: [{ name: "betrag", label: "Betrag", typ: "number" }],
        },
      ],
    },
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "vorgelegt", label: "Vorgelegt", tone: "info" },
        {
          key: "festgesetzt",
          label: "Festgesetzt",
          tone: "ok",
          terminal: true,
        },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "vorgelegt",
          label: "Vorlegen",
          rollen: ["sachbearbeitung"],
        },
        {
          from: "vorgelegt",
          to: "festgesetzt",
          label: "Festsetzen",
          rollen: ["sachbearbeitung"],
          vierAugen: true,
        },
      ],
    },
    register: { suchfelder: ["betrag"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "betrag", label: "Betrag" }] },
    ],
    seed: ({ vorgangsnummer }) => [
      {
        id: "a-v1",
        vorgangsnummer: vorgangsnummer(),
        eingangIso: "2026-01-01T00:00:00.000Z",
        antragsdaten: { betrag: 5000 },
        status: "eingegangen",
        ki: { confidence: 0, flags: [] },
        nachweise: [],
        history: [
          {
            ts: "2026-01-01T00:00:00.000Z",
            aktion: "Antrag eingegangen",
            rolle: "buerger",
            art: "eingang",
          },
        ],
      },
    ],
  };
}

function macheWorkspace(): WorkspaceConfig {
  return {
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    verfahren: [{ procedureId: "leistung-a", config: macheConfig() }],
    prioritaeten: [{ key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 }],
    labels: [{ key: "eilt", label: "Eilt", tone: "block" }],
  };
}

const NOW = () => "2026-06-01T00:00:00.000Z";
const SERVICE = "automation.service";

describe("wendeAutomationEffekteAn — Ausführung mit Vier-Augen-Block", () => {
  it("wendet Metadaten-Effekte an (Priorität/Label)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const aufgabe = store.getTask("a-v1")!;
    const ergebnis = wendeAutomationEffekteAn(
      store,
      aufgabe,
      [
        { art: "setze-prioritaet", wert: "hoch" },
        { art: "label-hinzufuegen", label: "eilt" },
      ],
      { akteur: SERVICE },
    );
    expect(ergebnis.every((e) => e.status === "angewendet")).toBe(true);
    const t = store.getTask("a-v1")!;
    expect(t.prioritaet).toBe("hoch");
    expect(t.labels).toContain("eilt");
  });

  it("führt einen NORMALEN Statusübergang aus (Service-Akteur)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const aufgabe = store.getTask("a-v1")!;
    const ergebnis = wendeAutomationEffekteAn(
      store,
      aufgabe,
      [{ art: "status-uebergang", nach: "vorgelegt" }],
      { akteur: SERVICE },
    );
    expect(ergebnis[0]!.status).toBe("angewendet");
    expect(store.portFor("leistung-a")?.get("a-v1")?.status).toBe("vorgelegt");
  });

  it("BLOCKIERT einen Vier-Augen-Übergang (Automation legt vor, Mensch entscheidet)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    // erst vorlegen (normal), dann versuchen festzusetzen (vier-augen) per Automation
    store.taskUebergang(
      "a-v1",
      "vorgelegt",
      "sachbearbeitung",
      undefined,
      "sb.mensch",
    );
    const aufgabe = store.getTask("a-v1")!;
    const ergebnis = wendeAutomationEffekteAn(
      store,
      aufgabe,
      [{ art: "status-uebergang", nach: "festgesetzt" }],
      { akteur: SERVICE },
    );
    expect(ergebnis[0]!.status).toBe("blockiert");
    // Status UNVERÄNDERT — keine autonome Freigabe.
    expect(store.portFor("leistung-a")?.get("a-v1")?.status).toBe("vorgelegt");
  });

  it("End-to-End: evalAutomationen → wendeAutomationEffekteAn (fail-closed + Block zusammen)", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const aufgabe = store.getTask("a-v1")!;
    const vorgang = store.portFor("leistung-a")!.get("a-v1")!;
    const regeln = [
      {
        id: "hohe-summe",
        trigger: { art: "beim-eingang" as const },
        wenn: { feld: "betrag", op: ">=" as const, wert: 1000 },
        dann: [
          { art: "setze-prioritaet" as const, wert: "hoch" },
          { art: "label-hinzufuegen" as const, label: "eilt" },
        ],
      },
      {
        id: "gefaehrlich-ohne-wenn", // fail-closed: mutierend ohne wenn → wird NICHT gefeuert
        trigger: { art: "beim-eingang" as const },
        dann: [{ art: "status-uebergang" as const, nach: "festgesetzt" }],
      },
    ];
    const effekte = evalAutomationen(
      regeln,
      { art: "beim-eingang" },
      { aufgabe, vorgang },
    );
    // Nur die erste Regel feuert (2 Effekte); die zweite ist fail-closed übersprungen.
    expect(effekte).toHaveLength(2);
    const ergebnis = wendeAutomationEffekteAn(store, aufgabe, effekte, {
      akteur: SERVICE,
    });
    expect(ergebnis.every((e) => e.status === "angewendet")).toBe(true);
    const t = store.getTask("a-v1")!;
    expect(t.prioritaet).toBe("hoch");
    expect(t.labels).toContain("eilt");
    // Kein autonomer Statuswechsel.
    expect(store.portFor("leistung-a")?.get("a-v1")?.status).toBe(
      "eingegangen",
    );
  });

  it("meldet nicht unterstützte Effekte ehrlich statt still zu schlucken", () => {
    const store = createWorkspaceStore(macheWorkspace(), { now: NOW });
    const aufgabe = store.getTask("a-v1")!;
    const ergebnis = wendeAutomationEffekteAn(
      store,
      aufgabe,
      [{ art: "aufgabe-erstellen", titel: "Neue Aufgabe" }],
      { akteur: SERVICE },
    );
    expect(ergebnis[0]!.status).toBe("nicht-unterstuetzt");
  });
});
