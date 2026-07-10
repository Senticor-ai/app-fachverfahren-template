import { describe, it, expect } from "vitest";
import type { Aufgabe, AutomationRule, Vorgang } from "../types.js";
import {
  bauKontext,
  evalAutomationen,
  istMutierendeAktion,
  pruefeAutomationen,
  regelIstMutierend,
  triggerPasst,
} from "./automation.js";

function macheAufgabe(over: Partial<Aufgabe> = {}): Aufgabe {
  return {
    id: "a-1",
    procedureId: "leistung",
    tenantId: "t1",
    authorityId: "b1",
    jurisdictionId: "de",
    titel: "Testaufgabe",
    sortRank: "V",
    version: 1,
    ...over,
  };
}

function macheVorgang(
  status: string,
  antragsdaten: Record<string, unknown> = {},
): Vorgang {
  return {
    id: "v-1",
    vorgangsnummer: "FV-2026-0001",
    eingangIso: "2026-01-01T00:00:00.000Z",
    antragsdaten,
    status,
    ki: { confidence: 0, flags: [] },
    nachweise: [],
    history: [],
  };
}

describe("triggerPasst — Trigger-Matching mit optionalen Filtern", () => {
  it("matcht gleiche `art` ohne Parameter (beim-eingang)", () => {
    expect(triggerPasst({ art: "beim-eingang" }, { art: "beim-eingang" })).toBe(
      true,
    );
  });

  it("matcht `beim-uebergang` nur, wenn gesetzte von/nach-Filter passen", () => {
    const regel = { art: "beim-uebergang", nach: "festgesetzt" } as const;
    expect(
      triggerPasst(regel, {
        art: "beim-uebergang",
        von: "pruefung",
        nach: "festgesetzt",
      }),
    ).toBe(true);
    expect(
      triggerPasst(regel, {
        art: "beim-uebergang",
        von: "pruefung",
        nach: "abgelehnt",
      }),
    ).toBe(false);
  });

  it("unterscheidet verschiedene `art`", () => {
    expect(
      triggerPasst({ art: "beim-eingang" }, { art: "zuweisung-geaendert" }),
    ).toBe(false);
  });

  it("matcht `manuell` nur bei gleichem Label", () => {
    expect(
      triggerPasst(
        { art: "manuell", label: "eskalieren" },
        { art: "manuell", label: "eskalieren" },
      ),
    ).toBe(true);
    expect(
      triggerPasst(
        { art: "manuell", label: "eskalieren" },
        { art: "manuell", label: "schliessen" },
      ),
    ).toBe(false);
  });
});

describe("bauKontext — `$`-Projektion der Metadaten neben die Antragsdaten", () => {
  it("stellt Status/Priorität/Zuweisung als $-Schlüssel bereit", () => {
    const ctx = bauKontext(
      macheAufgabe({ prioritaet: "hoch", zugewiesenAn: "sb.mueller" }),
      macheVorgang("eingegangen", { betrag: 500 }),
    );
    expect(ctx.$status).toBe("eingegangen");
    expect(ctx.$prioritaet).toBe("hoch");
    expect(ctx.$zugewiesenAn).toBe("sb.mueller");
    expect(ctx.betrag).toBe(500);
  });
});

describe("evalAutomationen — reine Effekt-Absichten (kein Effekt)", () => {
  it("feuert eine Regel, wenn Trigger passt UND Bedingung über Antragsdaten erfüllt ist", () => {
    const regeln: AutomationRule[] = [
      {
        id: "hohe-summe-priorisieren",
        trigger: { art: "beim-eingang" },
        wenn: { feld: "betrag", op: ">=", wert: 1000 },
        dann: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    ];
    const aktionen = evalAutomationen(
      regeln,
      { art: "beim-eingang" },
      {
        aufgabe: macheAufgabe(),
        vorgang: macheVorgang("eingegangen", { betrag: 5000 }),
      },
    );
    expect(aktionen).toEqual([{ art: "setze-prioritaet", wert: "hoch" }]);
  });

  it("feuert NICHT, wenn die Bedingung nicht erfüllt ist", () => {
    const regeln: AutomationRule[] = [
      {
        id: "hohe-summe-priorisieren",
        trigger: { art: "beim-eingang" },
        wenn: { feld: "betrag", op: ">=", wert: 1000 },
        dann: [{ art: "setze-prioritaet", wert: "hoch" }],
      },
    ];
    const aktionen = evalAutomationen(
      regeln,
      { art: "beim-eingang" },
      {
        aufgabe: macheAufgabe(),
        vorgang: macheVorgang("eingegangen", { betrag: 100 }),
      },
    );
    expect(aktionen).toEqual([]);
  });

  it("wertet Bedingungen über den $status aus (Nicht-Antragsfeld)", () => {
    const regeln: AutomationRule[] = [
      {
        id: "nach-festsetzung-benachrichtigen",
        trigger: { art: "beim-uebergang", nach: "festgesetzt" },
        wenn: { feld: "$status", op: "==", wert: "festgesetzt" },
        dann: [
          { art: "benachrichtigen", kanal: "postfach", template: "bescheid" },
        ],
      },
    ];
    const aktionen = evalAutomationen(
      regeln,
      { art: "beim-uebergang", von: "pruefung", nach: "festgesetzt" },
      { aufgabe: macheAufgabe(), vorgang: macheVorgang("festgesetzt") },
    );
    expect(aktionen).toHaveLength(1);
    expect(aktionen[0]!.art).toBe("benachrichtigen");
  });

  it("überspringt deaktivierte Regeln (aktiv:false)", () => {
    const regeln: AutomationRule[] = [
      {
        id: "aus",
        trigger: { art: "beim-eingang" },
        wenn: { feld: "betrag", op: ">=", wert: 0 },
        dann: [{ art: "setze-prioritaet", wert: "hoch" }],
        aktiv: false,
      },
    ];
    expect(
      evalAutomationen(
        regeln,
        { art: "beim-eingang" },
        {
          aufgabe: macheAufgabe(),
          vorgang: macheVorgang("eingegangen", { betrag: 10 }),
        },
      ),
    ).toEqual([]);
  });
});

describe("fail-closed — mutierende Regel ohne `wenn`", () => {
  it("wird von evalAutomationen NICHT ausgeführt, auch wenn der Trigger passt", () => {
    const regeln: AutomationRule[] = [
      {
        id: "gefaehrlich-ohne-wenn",
        trigger: { art: "beim-eingang" },
        // KEIN `wenn` — würde bei fail-open dauerhaft feuern.
        dann: [{ art: "status-uebergang", nach: "festgesetzt" }],
      },
    ];
    const aktionen = evalAutomationen(
      regeln,
      { art: "beim-eingang" },
      {
        aufgabe: macheAufgabe(),
        vorgang: macheVorgang("eingegangen"),
      },
    );
    expect(aktionen).toEqual([]);
  });

  it("eine NICHT-mutierende Regel (ki-vorschlag) ohne `wenn` darf feuern", () => {
    const regeln: AutomationRule[] = [
      {
        id: "immer-vorschlagen",
        trigger: { art: "beim-eingang" },
        dann: [
          {
            art: "ki-vorschlag",
            vorschlag: {
              wert: "vollständig",
              quelle: "kommunales LLM",
              konfidenz: 0.8,
              begruendung: "alle Pflichtfelder gesetzt",
              funktionsName: "Vollständigkeitsprüfung",
              risikoklasse: "begrenzt",
            },
          },
        ],
      },
    ];
    const aktionen = evalAutomationen(
      regeln,
      { art: "beim-eingang" },
      {
        aufgabe: macheAufgabe(),
        vorgang: macheVorgang("eingegangen"),
      },
    );
    expect(aktionen).toHaveLength(1);
    expect(aktionen[0]!.art).toBe("ki-vorschlag");
  });

  it("pruefeAutomationen meldet die mutierende Regel ohne `wenn`", () => {
    const probleme = pruefeAutomationen([
      {
        id: "gefaehrlich-ohne-wenn",
        trigger: { art: "beim-eingang" },
        dann: [{ art: "zuweisen", an: "sb.mueller" }],
      },
    ]);
    expect(probleme).toHaveLength(1);
    expect(probleme[0]!.regelId).toBe("gefaehrlich-ohne-wenn");
    expect(probleme[0]!.art).toBe("mutierend-ohne-wenn");
  });
});

describe("Aktions-Klassifikation", () => {
  it("erkennt mutierende vs. anzeigende Aktionen", () => {
    expect(istMutierendeAktion("status-uebergang")).toBe(true);
    expect(istMutierendeAktion("zuweisen")).toBe(true);
    expect(istMutierendeAktion("benachrichtigen")).toBe(false);
    expect(istMutierendeAktion("ki-vorschlag")).toBe(false);
  });

  it("regelIstMutierend prüft die gesamte Aktionsliste", () => {
    expect(
      regelIstMutierend({
        id: "gemischt",
        trigger: { art: "beim-eingang" },
        dann: [
          { art: "benachrichtigen", kanal: "postfach", template: "x" },
          { art: "setze-prioritaet", wert: "hoch" },
        ],
      }),
    ).toBe(true);
  });
});
