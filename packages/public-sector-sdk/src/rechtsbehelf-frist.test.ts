import { describe, expect, it } from "vitest";
import {
  istRechtsbehelfVerfristet,
  rechtsbehelfVerfristetAb,
} from "./rechtsbehelf-frist.js";

const monat = { fristWert: 1, fristEinheit: "monat" as const };

describe("rechtsbehelfVerfristetAb", () => {
  it("Monatsfrist: endet am gleichnamigen Tag (§ 188 Abs. 2), verfristet ab dem Folgetag 00:00 UTC", () => {
    // Bekanntgabe 15.01. (10:00) → Frist endet 15.02. (24:00) → verfristet ab 16.02. 00:00.
    expect(rechtsbehelfVerfristetAb("2026-01-15T10:00:00.000Z", monat)).toBe(
      "2026-02-16T00:00:00.000Z",
    );
  });

  it("Monatsende-Klemmung: 31.01. + 1 Monat → 28.02. (kein 03.03.)", () => {
    // 31.01. → Fristende 28.02. → verfristet ab 01.03. 00:00.
    expect(rechtsbehelfVerfristetAb("2026-01-31T08:00:00.000Z", monat)).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });

  it("Wochenfrist = 7 Tage, Tagesfrist direkt", () => {
    expect(
      rechtsbehelfVerfristetAb("2026-01-15T00:00:00.000Z", {
        fristWert: 2,
        fristEinheit: "woche",
      }),
    ).toBe("2026-01-30T00:00:00.000Z"); // 15.01. + 14 Tage = 29.01., verfristet ab 30.01.
    expect(
      rechtsbehelfVerfristetAb("2026-01-15T00:00:00.000Z", {
        fristWert: 3,
        fristEinheit: "tag",
      }),
    ).toBe("2026-01-19T00:00:00.000Z"); // 15.01. + 3 Tage = 18.01., verfristet ab 19.01.
  });

  it("ungültiger Anker → null", () => {
    expect(rechtsbehelfVerfristetAb("kein-datum", monat)).toBeNull();
  });
});

describe("istRechtsbehelfVerfristet", () => {
  const bekanntgabe = "2026-01-15T10:00:00.000Z";

  it("am letzten Fristtag (ganztags) noch fristgerecht — auch nachts", () => {
    expect(
      istRechtsbehelfVerfristet(bekanntgabe, monat, "2026-02-15T23:59:59.000Z"),
    ).toBe(false);
  });

  it("ab dem Folgetag 00:00 verfristet", () => {
    expect(
      istRechtsbehelfVerfristet(bekanntgabe, monat, "2026-02-16T00:00:00.000Z"),
    ).toBe(true);
  });

  it("früher Zeitpunkt (kurz nach Bekanntgabe) ist nie verfristet", () => {
    expect(
      istRechtsbehelfVerfristet(bekanntgabe, monat, "2026-01-16T09:00:00.000Z"),
    ).toBe(false);
  });

  it("ungültiges now → null (unbestimmbar, nicht als verfristet werten)", () => {
    expect(istRechtsbehelfVerfristet(bekanntgabe, monat, "kaputt")).toBeNull();
  });
});
