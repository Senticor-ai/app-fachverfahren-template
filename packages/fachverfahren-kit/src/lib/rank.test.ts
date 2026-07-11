import { describe, it, expect } from "vitest";
import {
  raengeFuerEinordnung,
  rankZwischen,
  verteilteRaenge,
  RANG_DIGITS,
} from "./rank.js";

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

describe("raengeFuerEinordnung — Board-Neuordnen ohne Off-by-one", () => {
  const karten = [
    { id: "T1", sortRank: "1" },
    { id: "T2", sortRank: "2" },
    { id: "T3", sortRank: "3" },
    { id: "T4", sortRank: "4" },
  ];

  it("ABWÄRTS gezogene Karte landet VOR der Zielkarte (nicht dahinter)", () => {
    // Regression: T1 auf T3 fallen lassen → T1 zwischen T2 und T3 (vorher T2, nachher T3). Früher rutschte T1
    // wegen des Voll-Listen-Index zwischen T3 und T4 (eine Position zu tief).
    expect(raengeFuerEinordnung(karten, "T1", "T3")).toEqual({
      vorher: "2",
      nachher: "3",
    });
  });

  it("AUFWÄRTS gezogene Karte landet ebenfalls vor der Zielkarte", () => {
    expect(raengeFuerEinordnung(karten, "T4", "T2")).toEqual({
      vorher: "1",
      nachher: "2",
    });
  });

  it("Drop auf die LETZTE Karte ordnet DAVOR ein (nicht ganz ans Ende)", () => {
    expect(raengeFuerEinordnung(karten, "T1", "T4")).toEqual({
      vorher: "3",
      nachher: "4",
    });
  });

  it("Drop auf die ERSTE Karte ordnet an den Anfang (offener unterer Rand)", () => {
    expect(raengeFuerEinordnung(karten, "T4", "T1")).toEqual({ nachher: "1" });
  });

  it("vorZielId=null ordnet ans Ende (offener oberer Rand)", () => {
    expect(raengeFuerEinordnung(karten, "T1", null)).toEqual({ vorher: "4" });
  });

  it("unbekannte Zielkarte → ans Ende statt Absturz", () => {
    expect(raengeFuerEinordnung(karten, "T1", "GIBTSNICHT")).toEqual({
      vorher: "4",
    });
  });

  it("liefert einen mit rankZwischen verträglichen, strikt einordnenden Rang", () => {
    const { vorher, nachher } = raengeFuerEinordnung(karten, "T1", "T3");
    const rang = rankZwischen(vorher, nachher);
    expect("2" < rang && rang < "3").toBe(true);
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
