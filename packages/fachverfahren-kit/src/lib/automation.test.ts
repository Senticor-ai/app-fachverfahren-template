import { describe, expect, it } from "vitest";
import type { AutomationRule } from "../types.js";
import {
  automationTriggerPasst,
  evalAutomationsregeln,
  pruefeAutomationsregeln,
} from "./automation.js";

describe("automationTriggerPasst", () => {
  it("wendet optionale Übergangsfilter an", () => {
    expect(
      automationTriggerPasst(
        { art: "beim-uebergang", nach: "in-pruefung" },
        { art: "beim-uebergang", von: "neu", nach: "in-pruefung" },
      ),
    ).toBe(true);
    expect(
      automationTriggerPasst(
        { art: "beim-uebergang", nach: "abgeschlossen" },
        { art: "beim-uebergang", von: "neu", nach: "in-pruefung" },
      ),
    ).toBe(false);
  });
});

describe("pruefeAutomationsregeln", () => {
  it("weist doppelte IDs, leere Aktionen und ungeschützte Mutationen aus", () => {
    const issues = pruefeAutomationsregeln([
      {
        id: "regel",
        trigger: { art: "beim-eingang" },
        dann: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
      { id: "regel", trigger: { art: "beim-eingang" }, dann: [] },
    ]);

    expect(issues.map((issue) => issue.code)).toEqual([
      "unguarded-mutation",
      "duplicate-id",
      "empty-actions",
    ]);
  });
});

describe("evalAutomationsregeln", () => {
  const regeln: AutomationRule[] = [
    {
      id: "dringend",
      trigger: { art: "beim-eingang" },
      wenn: { feld: "antrag.dringend", op: "==", wert: true },
      dann: [{ art: "setze-prioritaet", wert: "hoch" }],
    },
    {
      id: "status-hinweis",
      trigger: { art: "beim-eingang" },
      wenn: { feld: "$meta.status", op: "==", wert: "neu" },
      dann: [
        {
          art: "benachrichtigen",
          kanal: "intern",
          template: "eingang",
        },
      ],
    },
    {
      id: "aus",
      trigger: { art: "beim-eingang" },
      dann: [{ art: "audit", aktion: "ignoriert" }],
      aktiv: false,
    },
  ];

  it("liefert passende Aktions-Intentionen, führt sie aber nicht aus", () => {
    expect(
      evalAutomationsregeln(
        regeln,
        { art: "beim-eingang" },
        {
          daten: { antrag: { dringend: true } },
          metadaten: { status: "neu" },
        },
      ),
    ).toEqual([
      {
        regelId: "dringend",
        aktionen: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
      {
        regelId: "status-hinweis",
        aktionen: [
          {
            art: "benachrichtigen",
            kanal: "intern",
            template: "eingang",
          },
        ],
      },
    ]);
  });

  it("überspringt nicht passende, deaktivierte und ungültige Regeln", () => {
    expect(
      evalAutomationsregeln(
        [
          ...regeln,
          {
            id: "ungueltig",
            trigger: { art: "beim-eingang" },
            dann: [{ art: "status-uebergang", nach: "abgeschlossen" }],
          },
        ],
        { art: "frist-erreicht", fristTyp: "widerspruch" },
        { daten: { antrag: { dringend: true } } },
      ),
    ).toEqual([]);
  });
});
