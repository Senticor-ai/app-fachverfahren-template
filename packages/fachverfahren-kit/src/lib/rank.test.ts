import { describe, it, expect } from "vitest";
import { rankZwischen, verteilteRaenge, RANG_DIGITS } from "./rank.js";

describe("rankZwischen — reine Fractional-Index-Ordnung (lexikografisch)", () => {
  it("liefert bei fehlenden Grenzen einen mittleren Anker-Rang", () => {
    const r = rankZwischen();
    expect(r.length).toBeGreaterThan(0);
    // Mitte des base-62-Bruchs: die mittlere Ziffer des Alphabets.
    expect(r).toBe(RANG_DIGITS[Math.floor(RANG_DIGITS.length / 2)]);
  });

  it("erzeugt einen Rang STRIKT zwischen zwei Nachbarn", () => {
    const r = rankZwischen("1", "2");
    expect("1" < r).toBe(true);
    expect(r < "2").toBe(true);
  });

  it("findet auch zwischen unmittelbar benachbarten Rängen Platz (Descent)", () => {
    const r = rankZwischen("10", "11");
    expect("10" < r).toBe(true);
    expect(r < "11").toBe(true);
  });

  it("findet Platz, wenn ein Rang echtes Präfix des anderen ist", () => {
    const r = rankZwischen("1", "12");
    expect("1" < r).toBe(true);
    expect(r < "12").toBe(true);
  });

  it("hängt hinten an, wenn nur `vorher` gegeben ist (offenes Ende)", () => {
    const r = rankZwischen("V");
    expect("V" < r).toBe(true);
  });

  it("fügt vorne ein, wenn nur `nachher` gegeben ist (offener Anfang)", () => {
    const r = rankZwischen(undefined, "V");
    expect(r < "V").toBe(true);
    expect(r.length).toBeGreaterThan(0);
  });

  it("ist deterministisch (gleiche Eingabe → gleicher Rang)", () => {
    expect(rankZwischen("1", "2")).toBe(rankZwischen("1", "2"));
  });

  it("wirft, wenn `vorher` nicht kleiner als `nachher` ist (kein Platz dazwischen)", () => {
    expect(() => rankZwischen("2", "1")).toThrow();
    expect(() => rankZwischen("5", "5")).toThrow();
  });

  it("wirft, wenn `nachher` = `vorher` + Null-Ziffern ist — statt still die Ordnung zu brechen", () => {
    // Regression: Früher lieferte rankZwischen("1","10") still „10V" (> „10", weil „10" Präfix von „10V" ist) und
    // zerstörte damit die Board-Sortierung. Zwischen „1" und „10" existiert KEIN strikter Rang → Wurf (Vertrag).
    expect(() => rankZwischen("1", "10")).toThrow();
    expect(() => rankZwischen("1", "100")).toThrow();
    expect(() => rankZwischen("AB", "AB0")).toThrow();
  });

  it("liefert weiter einen gültigen Rang, wenn `nachher` auf einer Null-Ziffer endet, aber früh divergiert", () => {
    // Divergenz an einer Nicht-Null-Stelle VOR der Null-Ziffer → Platz existiert, KEIN Wurf.
    const r = rankZwischen("1", "30");
    expect("1" < r).toBe(true);
    expect(r < "30").toBe(true);
  });

  it("wiederholtes Einfügen zwischen denselben Nachbarn bleibt strikt geordnet (Kernkonvergenz)", () => {
    let lo = "1";
    const hi = "2";
    for (let i = 0; i < 50; i++) {
      const mid = rankZwischen(lo, hi);
      expect(lo < mid).toBe(true);
      expect(mid < hi).toBe(true);
      lo = mid; // immer weiter nach oben rücken — bleibt < hi
    }
  });
});

describe("verteilteRaenge — aufsteigend geordnete Startränge", () => {
  it("liefert `anzahl` strikt aufsteigende Ränge", () => {
    const raenge = verteilteRaenge(10);
    expect(raenge).toHaveLength(10);
    const sortiert = [...raenge].sort();
    expect(raenge).toEqual(sortiert);
    // strikt (keine Dubletten)
    expect(new Set(raenge).size).toBe(10);
  });

  it("liefert für 0 eine leere Liste", () => {
    expect(verteilteRaenge(0)).toEqual([]);
  });
});
