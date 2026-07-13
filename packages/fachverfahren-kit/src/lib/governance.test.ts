import { describe, it, expect } from "vitest";
import type { LeistungConfig, StatusMachine } from "../types.js";
import {
  abgeleiteteTransitions,
  effektiveLeistungConfig,
  governanceMonotonieVerletzungen,
} from "./interpreter.js";

// Dual-Mode Phase 2a: die MONOTONE Governance-Opt-in-Derivation. Governance darf ueber die in der Config deklarierte
// Vier-Augen-Menge hinaus nur ANgeschaltet werden, nie ab — die effektive Menge ist die Obermenge. So gibt es EINE
// Wahrheit (die Ableitung), die DEV-Store und PROD-Policy teilen; keine zweite praezedenzlose Governance-Quelle.

const sm: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "pruefung", label: "In Prüfung", tone: "info" },
    { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
  ],
  transitions: [
    {
      from: "eingegangen",
      to: "pruefung",
      label: "Zur Prüfung",
      rollen: ["sb"],
    },
    {
      from: "pruefung",
      to: "festgesetzt",
      label: "Festsetzen",
      rollen: ["sb"],
      vierAugen: true,
    },
    {
      from: "pruefung",
      to: "abgelehnt",
      label: "Ablehnen",
      rollen: ["sb"],
      detailPflicht: true,
    },
  ],
};

describe("abgeleiteteTransitions — MONOTONE Governance-Opt-in-Derivation", () => {
  it("ohne governance: gibt die deklarierte Liste UNVERAENDERT (per Referenz) zurueck", () => {
    expect(abgeleiteteTransitions({ statusMachine: sm })).toBe(sm.transitions);
  });

  it("schaltet Vier-Augen fuer eine genannte Transition AN, laesst andere unveraendert", () => {
    const abgeleitet = abgeleiteteTransitions({
      statusMachine: sm,
      governance: {
        zusaetzlicheVierAugen: [{ from: "pruefung", to: "abgelehnt" }],
      },
    });
    expect(
      abgeleitet.find((t) => t.from === "pruefung" && t.to === "abgelehnt")
        ?.vierAugen,
    ).toBe(true);
    // andere Transition unveraendert (kein Vier-Augen dazuerfunden):
    expect(
      abgeleitet.find((t) => t.to === "pruefung")?.vierAugen,
    ).toBeUndefined();
    // die bereits deklarierte Vier-Augen-Transition bleibt erhalten:
    expect(abgeleitet.find((t) => t.to === "festgesetzt")?.vierAugen).toBe(
      true,
    );
    // Original wurde NICHT mutiert (reine Funktion):
    expect(
      sm.transitions.find((t) => t.to === "abgelehnt")?.vierAugen,
    ).toBeUndefined();
  });

  it("ist idempotent auf einer bereits Vier-Augen-pflichtigen Transition (keine Doppelung)", () => {
    const abgeleitet = abgeleiteteTransitions({
      statusMachine: sm,
      governance: {
        zusaetzlicheVierAugen: [{ from: "pruefung", to: "festgesetzt" }],
      },
    });
    expect(abgeleitet.filter((t) => t.to === "festgesetzt")).toHaveLength(1);
    expect(abgeleitet.find((t) => t.to === "festgesetzt")?.vierAugen).toBe(
      true,
    );
  });

  it("ignoriert einen Opt-in auf eine nicht existierende Transition (kein Phantom, kein Crash)", () => {
    const abgeleitet = abgeleiteteTransitions({
      statusMachine: sm,
      governance: { zusaetzlicheVierAugen: [{ from: "x", to: "y" }] },
    });
    expect(abgeleitet).toHaveLength(sm.transitions.length);
    expect(abgeleitet.some((t) => t.from === "x")).toBe(false);
  });

  it("MONOTONIE: schaltet NIE Vier-Augen ab — governanceMonotonieVerletzungen bleibt leer", () => {
    // Ohne Opt-in: die deklarierte Menge ist trivial ihre eigene Obermenge.
    expect(governanceMonotonieVerletzungen({ statusMachine: sm })).toEqual([]);
    // Mit Opt-in (schaltet an): die deklarierte Vier-Augen-Menge bleibt vollstaendig erhalten.
    expect(
      governanceMonotonieVerletzungen({
        statusMachine: sm,
        governance: {
          zusaetzlicheVierAugen: [{ from: "pruefung", to: "abgelehnt" }],
        },
      }),
    ).toEqual([]);
  });
});

describe("effektiveLeistungConfig — Contract-Projektion der abgeleiteten Governance (PROD liest den Contract)", () => {
  it("ohne governance: gibt DIESELBE config-Referenz zurueck (byte-identischer Contract)", () => {
    const config = { statusMachine: sm } as unknown as LeistungConfig;
    expect(effektiveLeistungConfig(config)).toBe(config);
  });

  it("mit governance: statusMachine.transitions traegt die abgeleitete Vier-Augen-Menge", () => {
    const config = {
      statusMachine: sm,
      governance: {
        zusaetzlicheVierAugen: [{ from: "pruefung", to: "abgelehnt" }],
      },
    } as unknown as LeistungConfig;
    const eff = effektiveLeistungConfig(config);
    expect(eff).not.toBe(config); // neue, projizierte Gestalt
    // Der Opt-in-Uebergang traegt jetzt Vier-Augen — so sieht ihn auch der committete Contract + die PROD-Policy.
    expect(
      eff.statusMachine.transitions.find((t) => t.to === "abgelehnt")
        ?.vierAugen,
    ).toBe(true);
    // Deklarierte Vier-Augen bleibt, uebrige Machine-Felder unveraendert.
    expect(
      eff.statusMachine.transitions.find((t) => t.to === "festgesetzt")
        ?.vierAugen,
    ).toBe(true);
    expect(eff.statusMachine.initial).toBe(sm.initial);
    // Original NICHT mutiert.
    expect(sm.transitions.find((t) => t.to === "abgelehnt")?.vierAugen).toBe(
      undefined,
    );
  });
});
