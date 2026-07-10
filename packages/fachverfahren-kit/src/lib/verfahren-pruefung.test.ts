import { describe, expect, it } from "vitest";
import {
  pruefeLeistungConfig,
  verfahrenKennzahlen,
} from "./verfahren-pruefung.js";
import type { AutomationRule, LeistungConfig } from "../types.js";

function config(over: Partial<LeistungConfig> = {}): LeistungConfig {
  return {
    id: "demo",
    label: "Demo",
    kommune: "Musterstadt",
    rechtsgrundlagen: [{ norm: "§ 1", titel: "Demo" }],
    antrag: {
      steps: [
        {
          id: "s1",
          titel: "Angaben",
          felder: [
            { name: "a", label: "A", typ: "text", required: true },
            { name: "b", label: "B", typ: "text" },
          ],
        },
      ],
    },
    statusMachine: {
      initial: "eingegangen",
      states: [
        { key: "eingegangen", label: "Eingegangen", tone: "neu" },
        { key: "fertig", label: "Fertig", tone: "ok", terminal: true },
      ],
      transitions: [
        {
          from: "eingegangen",
          to: "fertig",
          label: "Abschließen",
          rollen: ["sachbearbeitung"],
        },
      ],
    },
    register: { suchfelder: [] },
    detailSektionen: [{ titel: "Antrag", felder: [{ pfad: "a", label: "A" }] }],
    ...over,
  };
}

describe("verfahrenKennzahlen", () => {
  it("zählt Schritte, Felder, Status, Übergänge, Detail-Sektionen", () => {
    const k = verfahrenKennzahlen(config());
    expect(k.schritte).toBe(1);
    expect(k.felder).toBe(2);
    expect(k.status).toBe(2);
    expect(k.uebergaenge).toBe(1);
    expect(k.detailSektionen).toBe(1);
    expect(k.rechtsgrundlagen).toBe(1);
  });
});

describe("pruefeLeistungConfig", () => {
  it("wohlgeformte Config ⇒ keine Befunde", () => {
    expect(pruefeLeistungConfig(config())).toEqual([]);
  });

  it("Initialzustand nicht in states ⇒ statusmachine-Fehler", () => {
    const kaputt = config({
      statusMachine: {
        initial: "gibt-es-nicht",
        states: [{ key: "eingegangen", label: "E", tone: "neu" }],
        transitions: [],
      },
    });
    const b = pruefeLeistungConfig(kaputt);
    expect(
      b.some((x) => x.bereich === "statusmachine" && x.schwere === "fehler"),
    ).toBe(true);
  });

  it("fehlende Antragsschritte + Detail-Sektionen ⇒ Hinweise", () => {
    const leer = config({ antrag: { steps: [] }, detailSektionen: [] });
    const b = pruefeLeistungConfig(leer);
    expect(
      b
        .filter((x) => x.schwere === "hinweis")
        .map((x) => x.bereich)
        .sort(),
    ).toEqual(["antrag", "detail"]);
  });

  it("mutierende Automation ohne `wenn` ⇒ automationen-Fehler (fail-closed)", () => {
    const regeln: AutomationRule[] = [
      {
        id: "kaputt",
        trigger: { art: "beim-eingang" },
        dann: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    ];
    const b = pruefeLeistungConfig(config(), regeln);
    expect(b.some((x) => x.bereich === "automationen")).toBe(true);
  });
});
