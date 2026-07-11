import { describe, expect, it } from "vitest";
import { letzterVorbereiter } from "@senticor/fachverfahren-kit";
import { leistungConfig } from "./leistung.config.js";

// Regression zur Demo-INTEGRITÄT der Vier-Augen-Kontrolle: Seed-Vorgänge, die bereits über „eingegangen" hinaus
// sind (in_pruefung/review_noetig/…), MÜSSEN einen aufgezeichneten Vorbereiter tragen (History-Eintrag
// art:"uebergang" + akteur). Sonst wäre `letzterVorbereiter` = undefined und ein EINZELNER Akteur dürfte den
// Review-Fall im Alleingang festsetzen — die Vier-Augen-Regel (Vorbereiter ≠ Freigeber) griffe auf den Demo-Daten
// gar nicht, obwohl sie das System vorführen soll.
describe("leistung.config Seed — Vier-Augen-Demo-Integrität", () => {
  let n = 0;
  const seeds = leistungConfig.seed!({
    vorgangsnummer: () => `FV-2026-${String(++n).padStart(4, "0")}`,
  });

  it("liefert überhaupt Seed-Vorgänge inkl. mindestens eines Review-pflichtigen (nicht 'eingegangen')", () => {
    expect(seeds.length).toBeGreaterThan(0);
    expect(seeds.some((v) => v.status !== "eingegangen")).toBe(true);
  });

  it("jeder Seed-Vorgang jenseits von 'eingegangen' hat einen aufgezeichneten Vorbereiter (letzterVorbereiter ≠ undefined)", () => {
    for (const v of seeds) {
      if (v.status === "eingegangen") continue;
      const vorbereiter = letzterVorbereiter(v.history);
      expect(
        vorbereiter,
        `Vorgang ${v.vorgangsnummer} (Status ${v.status}) ohne Vorbereiter — Vier-Augen griffe nicht`,
      ).toBeTruthy();
    }
  });

  it("ein 'eingegangen'-Vorgang hat NOCH keinen Vorbereiter (der Erst-Übergang wird erst live aufgezeichnet)", () => {
    const eingegangen = seeds.find((v) => v.status === "eingegangen");
    expect(eingegangen).toBeDefined();
    expect(letzterVorbereiter(eingegangen!.history)).toBeUndefined();
  });
});
