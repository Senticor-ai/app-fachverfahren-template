// tarif.test — die server-autoritative Betragsberechnung (Root-Cause der Tenor-/Sollstellungs-Herkunft).
import { describe, expect, it } from "vitest";
import { berechneTarif, type TarifTabelle } from "./tarif.js";

const tabelle: TarifTabelle = {
  positionen: [
    { kategorie: "standard", betragCent: 5000, label: "Standard" },
    { kategorie: "express", betragCent: 9000, label: "Express" },
    { kategorie: "gebuehrenfrei", betragCent: 0, label: "Gebührenfrei" },
  ],
  defaultCent: 0,
};

describe("berechneTarif", () => {
  it("bekannte Kategorie → hinterlegter Betrag + bekannt=true + label", () => {
    expect(berechneTarif(tabelle, "express")).toEqual({
      betragCent: 9000,
      kategorie: "express",
      bekannt: true,
      label: "Express",
    });
  });

  it("gebührenfreie Kategorie (0) ist bekannt (nicht Fallback)", () => {
    const r = berechneTarif(tabelle, "gebuehrenfrei");
    expect(r.bekannt).toBe(true);
    expect(r.betragCent).toBe(0);
  });

  it("unbekannte Kategorie → defaultCent + bekannt=false (ehrliche Provenienz)", () => {
    const r = berechneTarif(tabelle, "gibtsnicht");
    expect(r).toEqual({
      betragCent: 0,
      kategorie: "gibtsnicht",
      bekannt: false,
    });
  });

  it("defensiv: negativer/ungültiger hinterlegter Betrag → 0", () => {
    const kaputt: TarifTabelle = {
      positionen: [{ kategorie: "x", betragCent: -100 }],
    };
    expect(berechneTarif(kaputt, "x").betragCent).toBe(0);
  });
});
