import { describe, it, expect } from "vitest";
import { formatBetrag } from "./format.js";
const n = (x: string) => x.replace(/[\u00a0\u202f]/g, " ");

describe("formatBetrag — cent-bewusste Betrags-Anzeige", () => {
  it("teilt Währungsbeträge (Cent) durch 100 statt sie roh als Euro zu zeigen", () => {
    // Regression: 12000 Cent = 120,00 € (früher fälschlich „12.000,00 €").
    expect(n(formatBetrag(12000, "EUR/Jahr"))).toBe("120,00 €/Jahr");
    expect(n(formatBetrag(9000, "EUR/Jahr"))).toBe("90,00 €/Jahr");
    expect(n(formatBetrag(18000, "EUR"))).toBe("180,00 €");
  });

  it("zeigt 0,00 € korrekt (Null-Betrag)", () => {
    expect(n(formatBetrag(0, "EUR"))).toBe("0,00 €");
  });

  it("hängt einen Nicht-Währungs-Suffix an", () => {
    expect(n(formatBetrag(12000, "EUR/Monat"))).toBe("120,00 €/Monat");
  });

  it("formatiert Nicht-Währungs-Einheiten ganzzahlig je Einheit (kein /100)", () => {
    expect(n(formatBetrag(3, "Stück"))).toBe("3 Stück");
    expect(n(formatBetrag(2, "Einheiten"))).toBe("2 Einheiten");
  });

  it("fällt bei ungültigem Währungscode defensiv auf EUR zurück (mit /100)", () => {
    expect(n(formatBetrag(12000, "EUR"))).toBe("120,00 €");
  });
});
