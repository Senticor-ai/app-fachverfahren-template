import { describe, it, expect } from "vitest";
import { formatBetrag } from "./format.js";
const n = (x: string) => x.replace(/[\u00a0\u202f]/g, " ");

describe("formatBetrag — Betrag in der natürlichen Haupteinheit", () => {
  it("formatiert Währungsbeträge als Euro (Betrag = ganze Euro, kein /100)", () => {
    // Konvention: 120 = 120,00 € (die Einheit, in der Fachkonzepte/Generierung ihre Sätze führen).
    expect(n(formatBetrag(120, "EUR/Jahr"))).toBe("120,00 €/Jahr");
    expect(n(formatBetrag(90, "EUR/Jahr"))).toBe("90,00 €/Jahr");
    expect(n(formatBetrag(180, "EUR"))).toBe("180,00 €");
    expect(n(formatBetrag(26, "EUR"))).toBe("26,00 €");
  });

  it("zeigt 0,00 € korrekt (Null-Betrag)", () => {
    expect(n(formatBetrag(0, "EUR"))).toBe("0,00 €");
  });

  it("hängt einen Nicht-Währungs-Suffix an", () => {
    expect(n(formatBetrag(120, "EUR/Monat"))).toBe("120,00 €/Monat");
  });

  it("formatiert Nicht-Währungs-Einheiten ganzzahlig je Einheit", () => {
    expect(n(formatBetrag(3, "Stück"))).toBe("3 Stück");
    expect(n(formatBetrag(2, "Einheiten"))).toBe("2 Einheiten");
  });

  it("fällt bei ungültigem Währungscode defensiv auf EUR zurück", () => {
    expect(n(formatBetrag(120, "EUR"))).toBe("120,00 €");
  });
});
