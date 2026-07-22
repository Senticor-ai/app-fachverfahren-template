import { describe, expect, it } from "vitest";
import { aufbewahrungLaeuft, aufbewahrungsende } from "./aufbewahrung.js";

describe("aufbewahrungsende", () => {
  it("addiert die Monate kalendergenau (Monatsende-Klemmung)", () => {
    // Abschluss 31.01.2020 + 120 Monate (10 Jahre) → 31.01.2030.
    expect(aufbewahrungsende("2020-01-31T00:00:00.000Z", 120)).toBe(
      "2030-01-31T00:00:00.000Z",
    );
    // Monatsende-Klemmung: 31.12. + 2 Monate → 28.02.
    expect(aufbewahrungsende("2025-12-31T00:00:00.000Z", 2)).toBe(
      "2026-02-28T00:00:00.000Z",
    );
  });

  it("ungültiger Abschluss → null", () => {
    expect(aufbewahrungsende("kein-datum", 12)).toBeNull();
  });
});

describe("aufbewahrungLaeuft", () => {
  const closed = "2020-01-01T00:00:00.000Z";

  it("innerhalb der Frist → true (blockiert)", () => {
    // 120 Monate ab 2020-01-01 → 2030-01-01; 2026 liegt davor.
    expect(aufbewahrungLaeuft(closed, 120, "2026-07-22T00:00:00.000Z")).toBe(
      true,
    );
  });

  it("nach Ablauf der Frist → false (Löschung erlaubt)", () => {
    expect(aufbewahrungLaeuft(closed, 120, "2030-06-01T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("keine deklarierte Frist (undefined/0) → false (Default unverändert)", () => {
    expect(
      aufbewahrungLaeuft(closed, undefined, "2021-01-01T00:00:00.000Z"),
    ).toBe(false);
    expect(aufbewahrungLaeuft(closed, 0, "2021-01-01T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("nicht abgeschlossener Fall (kein closedAt) → false (Frist nicht angelaufen)", () => {
    expect(aufbewahrungLaeuft(null, 120, "2026-07-22T00:00:00.000Z")).toBe(
      false,
    );
    expect(aufbewahrungLaeuft(undefined, 120, "2026-07-22T00:00:00.000Z")).toBe(
      false,
    );
  });
});
