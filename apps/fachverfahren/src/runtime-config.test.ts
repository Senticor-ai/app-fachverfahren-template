import { describe, it, expect } from "vitest";
import { brandingZuTheme, type RuntimeBranding } from "./runtime-config.js";

describe("brandingZuTheme — flacher Runtime-branding-Block → KommuneTheme", () => {
  it("ohne branding und ohne Fallback → null (neutrales Default-Kit)", () => {
    expect(brandingZuTheme(undefined)).toBeNull();
    expect(brandingZuTheme({})).toBeNull();
  });

  it("ohne branding, aber mit Fallback-Namen → nur der Name (kein brand/logo/quelle)", () => {
    const theme = brandingZuTheme(undefined, "Stadt Musterstadt");
    expect(theme).toEqual({ name: "Stadt Musterstadt" });
  });

  it("übernimmt gesetzte Markenfarben in brand (nur gesetzte Schlüssel)", () => {
    const b: RuntimeBranding = {
      name: "Stadt Beispielheim",
      primary: "hsl(174 62% 26%)",
      ring: "#123456",
    };
    const theme = brandingZuTheme(b);
    expect(theme?.name).toBe("Stadt Beispielheim");
    expect(theme?.brand).toEqual({
      primary: "hsl(174 62% 26%)",
      ring: "#123456",
    });
    // accent/surface/rail waren NICHT gesetzt → dürfen nicht als Schlüssel auftauchen.
    expect(theme?.brand && "accent" in theme.brand).toBe(false);
    expect(theme?.brand && "surface" in theme.brand).toBe(false);
  });

  it("mappt logoSrc → logo mit Default-alt aus dem Namen", () => {
    const theme = brandingZuTheme({ name: "Stadt X", logoSrc: "/wappen.svg" });
    expect(theme?.logo).toEqual({ src: "/wappen.svg", alt: "Logo Stadt X" });
  });

  it("übernimmt explizites logoAlt und logoHref", () => {
    const theme = brandingZuTheme({
      logoSrc: "/wappen.svg",
      logoAlt: "Wappen der Stadt X",
      logoHref: "https://x.example",
    });
    expect(theme?.logo).toEqual({
      src: "/wappen.svg",
      alt: "Wappen der Stadt X",
      href: "https://x.example",
    });
  });

  it("mappt sourceUrl/geprueftAm/verifiziert → quelle (Provenienz)", () => {
    const theme = brandingZuTheme({
      name: "Stadt X",
      sourceUrl: "https://x.example",
      sourceGeprueftAm: "2026-07-11",
      sourceVerifiziert: true,
    });
    expect(theme?.quelle).toEqual({
      url: "https://x.example",
      geprueftAm: "2026-07-11",
      verifiziert: true,
    });
  });

  it("branding.name schlägt den Fallback-Namen", () => {
    const theme = brandingZuTheme({ name: "Aus Runtime" }, "Aus Build-Zeit");
    expect(theme?.name).toBe("Aus Runtime");
  });

  it("nur ein Logo (kein Name, keine Farbe) reicht für ein Theme (name = leer)", () => {
    const theme = brandingZuTheme({ logoSrc: "/w.svg" });
    expect(theme).not.toBeNull();
    expect(theme?.name).toBe("");
    expect(theme?.logo?.src).toBe("/w.svg");
    expect("brand" in (theme ?? {})).toBe(false);
  });
});
