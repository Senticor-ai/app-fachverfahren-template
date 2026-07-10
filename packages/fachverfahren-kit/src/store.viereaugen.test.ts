import { describe, it, expect } from "vitest";
import type { LeistungConfig } from "./types.js";
import { createFachverfahrenStore } from "./store.js";

// Ein Verfahren mit einem VIER-AUGEN-Übergang (Vorlage → Festsetzung).
function macheConfig(): LeistungConfig {
  return {
    id: "leistung",
    label: "Leistung",
    kommune: "Musterstadt",
    rechtsgrundlagen: [],
    antrag: {
      steps: [
        {
          id: "s1",
          titel: "Angaben",
          felder: [{ name: "name", label: "Name", typ: "text" }],
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
    register: { suchfelder: ["name"] },
    detailSektionen: [
      { titel: "Antrag", felder: [{ pfad: "name", label: "Name" }] },
    ],
    seed: ({ vorgangsnummer }) => [
      {
        id: "v1",
        vorgangsnummer: vorgangsnummer(),
        eingangIso: "2026-01-01T00:00:00.000Z",
        antragsdaten: { name: "Alex" },
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

const NOW = () => "2026-06-01T00:00:00.000Z";

describe("Vier-Augen (DEV-Store) — Vorbereiter ≠ Freigeber", () => {
  it("verweigert die Freigabe durch dieselbe Person, die vorgelegt hat", () => {
    const store = createFachverfahrenStore(macheConfig(), { now: NOW });
    store.uebergang(
      "v1",
      "vorgelegt",
      "sachbearbeitung",
      undefined,
      "sb.mueller",
    );
    expect(() =>
      store.uebergang(
        "v1",
        "festgesetzt",
        "sachbearbeitung",
        undefined,
        "sb.mueller",
      ),
    ).toThrow(/Vier-Augen/);
  });

  it("erlaubt die Freigabe durch eine ANDERE Person", () => {
    const store = createFachverfahrenStore(macheConfig(), { now: NOW });
    store.uebergang(
      "v1",
      "vorgelegt",
      "sachbearbeitung",
      undefined,
      "sb.mueller",
    );
    store.uebergang(
      "v1",
      "festgesetzt",
      "sachbearbeitung",
      undefined,
      "sb.schmidt",
    );
    expect(store.get("v1")?.status).toBe("festgesetzt");
  });

  it("bleibt robust, wenn ein NICHT-Übergangs-Vermerk dazwischenliegt (Kern der Kritik)", () => {
    const store = createFachverfahrenStore(macheConfig(), { now: NOW });
    store.uebergang(
      "v1",
      "vorgelegt",
      "sachbearbeitung",
      undefined,
      "sb.mueller",
    );
    // Ein fremder Akteur berührt die History mit einem NEUTRALEN Vermerk (z. B. Automation/Label) — DARF die
    // Vier-Augen-Prüfung NICHT aushebeln: der Vorbereiter bleibt sb.mueller.
    const v = store.get("v1")!;
    v.history.push({
      ts: "2026-06-01T00:00:01.000Z",
      aktion: "Label gesetzt",
      rolle: "service",
      art: "vermerk",
      akteur: "automation.service",
    });
    expect(() =>
      store.uebergang(
        "v1",
        "festgesetzt",
        "sachbearbeitung",
        undefined,
        "sb.mueller",
      ),
    ).toThrow(/Vier-Augen/);
  });
});
