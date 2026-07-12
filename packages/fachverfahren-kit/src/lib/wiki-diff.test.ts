import { describe, it, expect } from "vitest";
import { wikiDiff, diffBilanz, type DiffZeile } from "./wiki-diff.js";

/** Kompakte Darstellung fürs Assert: „= a", „+ b", „- c". */
const kompakt = (d: DiffZeile[]): string[] =>
  d.map(
    (z) =>
      `${z.typ === "gleich" ? "=" : z.typ === "hinzu" ? "+" : "-"} ${z.zeile}`,
  );

describe("wikiDiff — reiner LCS-Zeilen-Diff", () => {
  it("identische Texte → alles unverändert", () => {
    const d = wikiDiff("a\nb\nc", "a\nb\nc");
    expect(kompakt(d)).toEqual(["= a", "= b", "= c"]);
    expect(diffBilanz(d)).toEqual({ hinzu: 0, weg: 0 });
  });

  it("reine Hinzufügung am Ende", () => {
    const d = wikiDiff("a\nb", "a\nb\nc");
    expect(kompakt(d)).toEqual(["= a", "= b", "+ c"]);
    expect(diffBilanz(d)).toEqual({ hinzu: 1, weg: 0 });
  });

  it("reine Entfernung in der Mitte", () => {
    const d = wikiDiff("a\nb\nc", "a\nc");
    expect(kompakt(d)).toEqual(["= a", "- b", "= c"]);
    expect(diffBilanz(d)).toEqual({ hinzu: 0, weg: 1 });
  });

  it("Ersetzung einer Zeile (weg + hinzu)", () => {
    const d = wikiDiff("a\nb\nc", "a\nB\nc");
    expect(kompakt(d)).toEqual(["= a", "- b", "+ B", "= c"]);
    expect(diffBilanz(d)).toEqual({ hinzu: 1, weg: 1 });
  });

  it("gemischt: Einfügung vorne, Entfernung hinten", () => {
    const d = wikiDiff("a\nb\nc", "x\na\nb");
    expect(kompakt(d)).toEqual(["+ x", "= a", "= b", "- c"]);
    expect(diffBilanz(d)).toEqual({ hinzu: 1, weg: 1 });
  });

  it("führt korrekte 1-basierte Zeilennummern (alt/neu)", () => {
    const d = wikiDiff("a\nb\nc", "a\nB\nc");
    expect(d).toEqual([
      { typ: "gleich", zeile: "a", alt: 1, neu: 1 },
      { typ: "weg", zeile: "b", alt: 2, neu: null },
      { typ: "hinzu", zeile: "B", alt: null, neu: 2 },
      { typ: "gleich", zeile: "c", alt: 3, neu: 3 },
    ]);
  });

  it("von leer zu Inhalt = nur Hinzufügungen (eine anfangs leere Zeile weg)", () => {
    const d = wikiDiff("", "a\nb");
    // "" split → [""] (eine leere Zeile); die wird durch die neuen Zeilen ersetzt.
    expect(diffBilanz(d)).toEqual({ hinzu: 2, weg: 1 });
    expect(d.filter((z) => z.typ === "hinzu").map((z) => z.zeile)).toEqual([
      "a",
      "b",
    ]);
  });

  it("mehrzeilig mit wiederkehrenden Zeilen (LCS wählt die längste gemeinsame Folge)", () => {
    const d = wikiDiff("x\nk\ny\nk\nz", "k\ny\nk");
    // Die gemeinsame Teilfolge k,y,k bleibt; x und z fallen weg.
    expect(kompakt(d)).toEqual(["- x", "= k", "= y", "= k", "- z"]);
    expect(diffBilanz(d)).toEqual({ hinzu: 0, weg: 2 });
  });

  it("ist stabil/deterministisch (zweimal derselbe Aufruf = gleiches Ergebnis)", () => {
    const eins = wikiDiff("a\nb\nc\nd", "a\nc\nd\ne");
    const zwei = wikiDiff("a\nb\nc\nd", "a\nc\nd\ne");
    expect(eins).toEqual(zwei);
    expect(kompakt(eins)).toEqual(["= a", "- b", "= c", "= d", "+ e"]);
  });
});
