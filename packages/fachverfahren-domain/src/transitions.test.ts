import { describe, expect, it } from "vitest";
import {
  applyTransition,
  DomainRuleError,
  findTransition,
} from "./transitions.js";
import type { CaseDomainConfig, Vorgang } from "./types.js";

const config: CaseDomainConfig = {
  id: "demo",
  configVersion: "1",
  payloadVersion: "1",
  statusMachine: {
    initial: "eingegangen",
    states: [
      { key: "eingegangen", label: "Eingegangen", tone: "neu" },
      { key: "in-pruefung", label: "In Prüfung", tone: "info" },
      { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    ],
    transitions: [
      {
        from: "eingegangen",
        to: "in-pruefung",
        label: "Zur Prüfung",
        rollen: ["sachbearbeitung"],
        eventName: "start-pruefung",
      },
      {
        from: "in-pruefung",
        to: "festgesetzt",
        label: "Festsetzen",
        rollen: ["sachbearbeitung"],
        vierAugen: true,
        eventName: "festsetzen",
      },
    ],
  },
};

function baseVorgang(overrides: Partial<Vorgang> = {}): Vorgang {
  return {
    id: "v-1",
    vorgangsnummer: "FV-2026-0001",
    eingangIso: "2026-01-01T00:00:00.000Z",
    antragsdaten: {},
    status: "eingegangen",
    ki: { confidence: 0, flags: [] },
    nachweise: [],
    history: [
      {
        ts: "2026-01-01T00:00:00.000Z",
        aktion: "Antrag eingegangen",
        rolle: "buerger",
        akteur: "citizen.1",
      },
    ],
    ...overrides,
  };
}

describe("transitions", () => {
  it("selects by event name", () => {
    const t = findTransition(config, "eingegangen", "start-pruefung");
    expect(t?.to).toBe("in-pruefung");
  });

  it("applies a valid transition", () => {
    const { next, transition } = applyTransition({
      config,
      vorgang: baseVorgang(),
      eventName: "start-pruefung",
      rolle: "sachbearbeitung",
      actorId: "cw.1",
      nowIso: "2026-01-02T00:00:00.000Z",
    });
    expect(transition.to).toBe("in-pruefung");
    expect(next.status).toBe("in-pruefung");
    expect(next.history.at(-1)?.akteur).toBe("cw.1");
  });

  it("rejects vierAugen when same actor", () => {
    const vorgang = baseVorgang({
      status: "in-pruefung",
      history: [
        ...baseVorgang().history,
        {
          ts: "2026-01-02T00:00:00.000Z",
          aktion: "Zur Prüfung",
          rolle: "sachbearbeitung",
          akteur: "cw.1",
        },
      ],
    });
    expect(() =>
      applyTransition({
        config,
        vorgang,
        eventName: "festsetzen",
        rolle: "sachbearbeitung",
        actorId: "cw.1",
        nowIso: "2026-01-03T00:00:00.000Z",
      }),
    ).toThrow(DomainRuleError);
  });

  it("rejects vierAugen without actor", () => {
    expect(() =>
      applyTransition({
        config,
        vorgang: baseVorgang({ status: "in-pruefung" }),
        eventName: "festsetzen",
        rolle: "sachbearbeitung",
        actorId: "",
        nowIso: "2026-01-03T00:00:00.000Z",
      }),
    ).toThrow(/Akteur/);
  });

  it("allows vierAugen with different actor", () => {
    const vorgang = baseVorgang({
      status: "in-pruefung",
      history: [
        ...baseVorgang().history,
        {
          ts: "2026-01-02T00:00:00.000Z",
          aktion: "Zur Prüfung",
          rolle: "sachbearbeitung",
          akteur: "cw.1",
        },
      ],
    });
    const { next } = applyTransition({
      config,
      vorgang,
      eventName: "festsetzen",
      rolle: "sachbearbeitung",
      actorId: "cw.2",
      nowIso: "2026-01-03T00:00:00.000Z",
    });
    expect(next.status).toBe("festgesetzt");
  });
});
