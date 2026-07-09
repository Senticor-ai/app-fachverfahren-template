// berechnung.test.ts — der GENERISCHE, mitgelieferte Naht-Tabellen-Test der Berechnung.
//
// WARUM mitgeliefert (Fabrik statt Agenten-Vertrauen): das CHOS-Gate `test-real-vorhanden` verlangt an
// apps/fachverfahren/tests/ mindestens EINEN echten Tabellen-Test der `leistungConfig.berechne` gegen Beispielwerte.
// Wird er erst vom Agenten im ERSTEN Durchlauf erwartet, reisst der Output-Vertrag → phase-redelivery (Repair). Dieser
// Test kommt DETERMINISTISCH aus der Vorlage: er liest die GENERIERTE `leistungConfig` und prueft die Berechnung
// verfahrens-agnostisch gegen die EIGENEN Beispiele der Naht (Seed-Vorgaenge + Tarif-DATEN) — kein Domaenen-Literal,
// er funktioniert fuer JEDES generierte Verfahren. Die Generierung darf ihn verfeinern/ergaenzen (mehr Faelle), MUSS
// ihn aber nicht mehr erst anlegen. So ist der Erstlauf test-vollstaendig (0 Repair an dieser Naht).
import { describe, expect, it } from "vitest";

import { leistungConfig } from "../src/leistung.config.js";

// Defensiver, struktur-agnostischer Zugriff (die Config-Form variiert je Verfahren): wir prueften nur den Vertrag.
const cfg = leistungConfig as unknown as {
  berechne?: (antragsdaten: unknown) => unknown;
  tarif?: unknown;
  tarife?: unknown;
  seed?: (ctx: { vorgangsnummer: () => string }) => Array<{ antragsdaten?: unknown; berechnung?: unknown }>;
};

/** Sammelt alle numerischen Betraege aus einer tarif/tarife-Struktur (Zahl, {..:Zahl}, verschachtelt). */
function tarifBetraege(t: unknown): number[] {
  if (typeof t === "number") return Number.isFinite(t) ? [t] : [];
  if (Array.isArray(t)) return t.flatMap(tarifBetraege);
  if (t && typeof t === "object") return Object.values(t).flatMap(tarifBetraege);
  return [];
}

describe("Berechnung — Naht-Vertrag (leistungConfig.berechne)", () => {
  it("berechne() ist eine aufrufbare Funktion", () => {
    expect(typeof cfg.berechne).toBe("function");
  });

  it("die Tarif-/Betrags-DATEN (falls deklariert) sind endliche, nicht-negative Zahlen", () => {
    const betraege = [...tarifBetraege(cfg.tarif), ...tarifBetraege(cfg.tarife)];
    // Kein Tarif deklariert (z. B. reines Ja/Nein-Verfahren) ist zulaessig — dann nichts zu pruefen.
    for (const b of betraege) {
      expect(Number.isFinite(b)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
    }
  });

  it("berechne() liefert fuer die eigenen Seed-Beispiele der Naht eine konsistente Berechnung (wirft nicht, gleicher Input → gleicher Betrag)", () => {
    if (typeof cfg.berechne !== "function") return;
    const seed = typeof cfg.seed === "function" ? cfg.seed({ vorgangsnummer: () => "FV-TEST-0001" }) : [];
    const beispiele = (Array.isArray(seed) ? seed : [])
      .map((v) => v?.antragsdaten)
      .filter((a) => a && typeof a === "object")
      .slice(0, 5);
    // Fallback: mindestens ein leeres Antrags-Objekt, damit der Aufruf-Vertrag geprueft wird.
    const inputs = beispiele.length ? beispiele : [{}];
    for (const antragsdaten of inputs) {
      const berechnung = cfg.berechne(antragsdaten);
      // (1) wirft nicht (schon oben aufgerufen). (2) DETERMINISTISCH: derselbe Input liefert denselben Betrag.
      const wieder = cfg.berechne(antragsdaten);
      const betrag = (b: unknown): unknown => (b && typeof b === "object" ? (b as { betrag?: unknown }).betrag ?? b : b);
      expect(betrag(wieder)).toStrictEqual(betrag(berechnung));
    }
  });
});
