import { describe, it, expect } from "vitest";
import { formatBetrag, formatBetragStatus } from "./format.js";
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

describe("formatBetragStatus — provisorisch ≠ endgültig (tiefer App-Audit P2)", () => {
  it("markiert einen provisorischen Betrag als (vorläufig)", () => {
    const r = formatBetragStatus({
      betrag: 0,
      einheit: "EUR/Jahr",
      status: "provisional",
    });
    expect(r.vorlaeufig).toBe(true);
    expect(n(r.betrag)).toBe("0,00 €/Jahr");
    expect(n(r.text)).toBe("0,00 €/Jahr (vorläufig)");
  });
  it("zeigt einen endgültigen Betrag OHNE Vorläufig-Marker", () => {
    const r = formatBetragStatus({
      betrag: 120,
      einheit: "EUR/Jahr",
      status: "final",
    });
    expect(r.vorlaeufig).toBe(false);
    expect(n(r.text)).toBe("120,00 €/Jahr");
    expect(r.text).not.toContain("vorläufig");
  });
});
