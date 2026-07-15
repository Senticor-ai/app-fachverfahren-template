import { describe, it, expect } from "vitest";

import { pickForeground, themeToCssVars } from "./KommuneTheme.js";

// Regression: parseColor konnte kein hsl() -> pickForeground lieferte null -> themeToCssVars setzte
// KEIN --primary-foreground -> im Dark-Mode fiel der (dunkle) Token-Wert ein und der Marken-Hintergrund
// trug dunklen Text (BITV-AA-Verstoss, real gemessen: 2.83:1). Diese Tests sichern die Kontrast-
// Ableitung fuer hsl-Markenfarben ab (die Default-Kommune liefert primary als hsl).
describe("KommuneTheme — kontrastrobustere Vordergrund-Ableitung", () => {
  it("leitet fuer eine dunkle hsl-Markenfarbe weissen Vordergrund ab", () => {
    expect(pickForeground("hsl(174 62% 26%)")).toBe("#ffffff");
  });

  it("leitet fuer eine helle hsl-Markenfarbe dunklen Vordergrund ab", () => {
    expect(pickForeground("hsl(50 100% 80%)")).toBe("#0b0b0b");
  });

  it("waehlt am korrekten WCAG-Uebergang: mittelhelle Farbe -> Schwarz (nicht Weiss)", () => {
    // Die im Dark-Mode aufgehellte Marken-Primary (L~43%, Luminanz ~0.34) MUSS Schwarz bekommen
    // (7.8:1) — mit der alten Schwelle 0.4 kam faelschlich Weiss (2.76:1). Regressionsschutz.
    expect(pickForeground("hsl(174 62% 43%)")).toBe("#0b0b0b");
  });

  it("akzeptiert hsl mit Kommas ebenso", () => {
    expect(pickForeground("hsl(174, 62%, 26%)")).toBe("#ffffff");
  });

  it("parst weiterhin hex und rgb", () => {
    expect(pickForeground("#0b3d2e")).toBe("#ffffff");
    expect(pickForeground("#ffe08a")).toBe("#0b0b0b");
    expect(pickForeground("rgb(20, 60, 40)")).toBe("#ffffff");
  });

  it("injiziert --primary-foreground auch fuer eine hsl-Markenfarbe", () => {
    const vars = themeToCssVars({
      name: "Default-Kommune",
      brand: { primary: "hsl(174 62% 26%)" },
    });
    expect(vars["--primary"]).toBe("hsl(174 62% 26%)");
    // Theme-unabhaengiger, kontrast-sicherer Vordergrund (statt Token-Fallback im Dark-Mode).
    expect(vars["--primary-foreground"]).toBe("#ffffff");
  });
});
