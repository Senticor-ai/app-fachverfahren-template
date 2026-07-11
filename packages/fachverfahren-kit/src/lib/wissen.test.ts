import { describe, it, expect } from "vitest";
import type { WissensArtikel } from "../types.js";
import { filtereWissen, hatHierarchie, wissensBaum } from "./wissen.js";

const art = (
  id: string,
  titel: string,
  over: Partial<WissensArtikel> = {},
): WissensArtikel => ({ id, titel, markdown: "", ...over });

describe("filtereWissen — Volltext über titel + markdown", () => {
  const artikel = [
    art("a", "Fristen im Widerspruch", { markdown: "§ 70 VwGO ..." }),
    art("b", "Gebührenordnung", { markdown: "Tarif nach Anlage 1" }),
  ];

  it("leere Suche liefert alle Artikel unverändert", () => {
    expect(filtereWissen(artikel, "  ").map((a) => a.id)).toEqual(["a", "b"]);
  });
  it("findet über den TITEL (case-insensitive)", () => {
    expect(filtereWissen(artikel, "gebühr").map((a) => a.id)).toEqual(["b"]);
  });
  it("findet über den MARKDOWN-Inhalt (Kategorie muss man nicht kennen)", () => {
    expect(filtereWissen(artikel, "vwgo").map((a) => a.id)).toEqual(["a"]);
  });
  it("kein Treffer → leere Liste", () => {
    expect(filtereWissen(artikel, "gibtsnicht")).toEqual([]);
  });
});

describe("wissensBaum — mehrstufige Hierarchie flach mit Tiefe", () => {
  it("ohne parentId: alle Wurzeln (Tiefe 0) in Einfüge-Reihenfolge", () => {
    const baum = wissensBaum([art("a", "A"), art("b", "B")]);
    expect(baum.map((e) => [e.artikel.id, e.tiefe])).toEqual([
      ["a", 0],
      ["b", 0],
    ]);
  });

  it("verschachtelt: Kind folgt Elternteil, Enkel eine Ebene tiefer", () => {
    const baum = wissensBaum([
      art("wurzel", "Handbuch"),
      art("kind", "Kapitel 1", { parentId: "wurzel" }),
      art("enkel", "Abschnitt 1.1", { parentId: "kind" }),
      art("wurzel2", "Recht"),
    ]);
    expect(baum.map((e) => [e.artikel.id, e.tiefe])).toEqual([
      ["wurzel", 0],
      ["kind", 1],
      ["enkel", 2],
      ["wurzel2", 0],
    ]);
  });

  it("unbekanntes parentId wird als Wurzel behandelt (defensive Config)", () => {
    const baum = wissensBaum([art("x", "X", { parentId: "gibtsnicht" })]);
    expect(baum.map((e) => [e.artikel.id, e.tiefe])).toEqual([["x", 0]]);
  });

  it("Zyklus terminiert und verliert keinen Artikel", () => {
    const baum = wissensBaum([
      art("a", "A", { parentId: "b" }),
      art("b", "B", { parentId: "a" }),
    ]);
    expect(baum.map((e) => e.artikel.id).sort()).toEqual(["a", "b"]);
  });
});

describe("hatHierarchie", () => {
  it("false ohne gültige parentId (flach oder nur unbekannte Eltern)", () => {
    expect(hatHierarchie([art("a", "A"), art("b", "B")])).toBe(false);
    expect(hatHierarchie([art("a", "A", { parentId: "fehlt" })])).toBe(false);
  });
  it("true bei mindestens einer gültigen parentId", () => {
    expect(
      hatHierarchie([art("a", "A"), art("b", "B", { parentId: "a" })]),
    ).toBe(true);
  });
});
