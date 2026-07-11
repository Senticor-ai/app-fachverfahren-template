import { describe, it, expect } from "vitest";
import type { FristDauer } from "../types.js";
import {
  formatFristDauer,
  formatFristDauerObj,
  faelligkeitAb,
  faelligkeitAbDauer,
  FRIST_EINHEIT_DEFAULT,
} from "./frist.js";

describe("formatFristDauer — typisierte Dauer in korrektem Deutsch (Einheit steuert das Wort)", () => {
  it("rendert eine Monatsfrist als »1 Monat« — nicht als »1 Tag« oder »30 Tage« (Content-Audit-Wurzel)", () => {
    const gerendert = formatFristDauer(1, "monat");
    expect(gerendert).toBe("1 Monat");
    // Der Bug: eine Monatsfrist wurde als roher Tage-Wert (widerspruch_vwgo_tage = 1) modelliert.
    expect(gerendert).not.toBe("1 Tag");
    expect(gerendert).not.toBe("30 Tage");
    expect(gerendert).not.toContain("Tag");
  });

  it("pluralisiert korrekt je Einheit (Singular bei 1, Plural sonst)", () => {
    expect(formatFristDauer(1, "tag")).toBe("1 Tag");
    expect(formatFristDauer(4, "tag")).toBe("4 Tage");
    expect(formatFristDauer(1, "woche")).toBe("1 Woche");
    expect(formatFristDauer(2, "woche")).toBe("2 Wochen");
    expect(formatFristDauer(3, "monat")).toBe("3 Monate");
    expect(formatFristDauer(1, "jahr")).toBe("1 Jahr");
    expect(formatFristDauer(4, "jahr")).toBe("4 Jahre");
    expect(formatFristDauer(0, "tag")).toBe("0 Tage");
  });

  it("nutzt den Default-Einheit tag ohne Angabe (roher Zahl-Wert bleibt lesbar)", () => {
    expect(FRIST_EINHEIT_DEFAULT).toBe("tag");
    expect(formatFristDauer(4)).toBe("4 Tage");
    expect(formatFristDauerObj({ wert: 1 })).toBe("1 Tag");
    expect(formatFristDauerObj({ wert: 1, einheit: "monat" })).toBe("1 Monat");
  });

  it("gruppiert große Werte deutsch (Tausenderpunkt)", () => {
    expect(formatFristDauer(1000, "tag")).toBe("1.000 Tage");
  });
});

describe("faelligkeitAb — Fälligkeit über ECHTE Kalender-Arithmetik (kein Tage×30)", () => {
  it("addiert eine Monatsfrist kalendergenau (nicht +30 Tage)", () => {
    // 15.01. + 1 Monat = 15.02. (echte Kalender-Arithmetik). +30 Tage ergäbe fälschlich den 14.02.
    expect(faelligkeitAb("2026-01-15T00:00:00.000Z", 1, "monat")).toBe(
      "2026-02-15T00:00:00.000Z",
    );
    // 31.01. + 1 Monat: Monatsende-Klemmung auf den 28.02. (2026 kein Schaltjahr) — nicht 03.03.
    expect(faelligkeitAb("2026-01-31T00:00:00.000Z", 1, "monat")).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    // Schaltjahr: 31.01.2024 + 1 Monat → 29.02.2024.
    expect(faelligkeitAb("2024-01-31T00:00:00.000Z", 1, "monat")).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("addiert Jahre kalendergenau mit Monatsende-Klemmung", () => {
    // 29.02.2024 + 1 Jahr → 28.02.2025 (2025 kein Schaltjahr).
    expect(faelligkeitAb("2024-02-29T00:00:00.000Z", 1, "jahr")).toBe(
      "2025-02-28T00:00:00.000Z",
    );
    expect(faelligkeitAb("2026-07-01T00:00:00.000Z", 4, "jahr")).toBe(
      "2030-07-01T00:00:00.000Z",
    );
  });

  it("addiert Wochen (7 Tage) und Tage direkt", () => {
    expect(faelligkeitAb("2026-07-01T00:00:00.000Z", 2, "woche")).toBe(
      "2026-07-15T00:00:00.000Z",
    );
    expect(faelligkeitAb("2026-07-01T00:00:00.000Z", 4, "tag")).toBe(
      "2026-07-05T00:00:00.000Z",
    );
  });

  it("ist stabil-absolut: identische Eingabe ⇒ identisches Ergebnis (kein Date.now)", () => {
    const a = faelligkeitAb("2026-03-10T09:00:00.000Z", 1, "monat");
    const b = faelligkeitAb("2026-03-10T09:00:00.000Z", 1, "monat");
    expect(a).toBe(b);
    expect(a).toBe("2026-04-10T09:00:00.000Z");
  });

  it("nutzt Default tag ohne Einheit und liefert null bei ungültigem Anker", () => {
    expect(faelligkeitAb("2026-07-01T00:00:00.000Z", 3)).toBe(
      "2026-07-04T00:00:00.000Z",
    );
    expect(faelligkeitAb("kein-datum", 1, "monat")).toBeNull();
    expect(faelligkeitAbDauer("kein-datum", { wert: 1 })).toBeNull();
  });

  it("faelligkeitAbDauer nimmt ein FristDauer-Objekt an", () => {
    const dauer: FristDauer = { wert: 1, einheit: "monat" };
    expect(faelligkeitAbDauer("2026-01-15T00:00:00.000Z", dauer)).toBe(
      "2026-02-15T00:00:00.000Z",
    );
  });

  it("interpretiert einen offsetlosen ISO-Zeitanteil als UTC — Fälligkeit ist zeitzonen-STABIL", () => {
    // Regression: Ohne UTC-Erzwingung parste `new Date(...)` den offsetlosen String als LOKALZEIT → das
    // Fälligkeitsdatum driftete mit der Server-Zeitzone (rechtlich relevant: 28.02. vs. 01.03.). Dieses Ergebnis
    // muss in JEDER Test-Runner-Zeitzone identisch sein.
    expect(faelligkeitAb("2026-01-31T20:00:00", 1, "monat")).toBe(
      "2026-02-28T20:00:00.000Z",
    );
    // Date-only bleibt UTC-Mitternacht (laut Spec bereits UTC).
    expect(faelligkeitAb("2026-01-15", 1, "monat")).toBe(
      "2026-02-15T00:00:00.000Z",
    );
    // „Z" bleibt unverändert absolut.
    expect(faelligkeitAb("2026-01-31T20:00:00.000Z", 1, "monat")).toBe(
      "2026-02-28T20:00:00.000Z",
    );
    // Expliziter Offset bleibt erhalten: 20:00−05:00 ⇒ Anker 2026-02-01T01:00Z, +1 Tag ⇒ 2026-02-02T01:00Z.
    expect(faelligkeitAb("2026-01-31T20:00:00-05:00", 1, "tag")).toBe(
      "2026-02-02T01:00:00.000Z",
    );
  });
});
