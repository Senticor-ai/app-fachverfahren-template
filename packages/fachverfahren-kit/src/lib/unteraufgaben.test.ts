import { describe, it, expect } from "vitest";
import type { Aufgabe } from "../types.js";
import {
  istWurzel,
  boardWurzeln,
  boardKarten,
  unteraufgabenVon,
  kinderAnzahl,
} from "./unteraufgaben.js";

const a = (id: string, parentAufgabeId?: string): Aufgabe => ({
  id,
  tenantId: "t1",
  authorityId: "b1",
  jurisdictionId: "de",
  titel: id,
  labels: [],
  sortRank: id,
  version: 1,
  ...(parentAufgabeId ? { parentAufgabeId } : {}),
});

const alle = [
  a("p1"),
  a("p2"),
  a("k1", "p1"),
  a("k2", "p1"),
  a("k3", "p2"),
  a("verwaist", "gibtsnicht"),
];

describe("Unteraufgaben — reine Eltern/Kind-Ableitung", () => {
  it("istWurzel: nur Aufgaben ohne parentAufgabeId (Waise mit fehlendem Parent zählt NICHT)", () => {
    expect(alle.filter(istWurzel).map((x) => x.id)).toEqual(["p1", "p2"]);
  });

  it("boardWurzeln: echte Wurzeln UND Waisen (Parent nicht im Bestand) — kein unsichtbares Kind", () => {
    expect(boardWurzeln(alle).map((x) => x.id)).toEqual([
      "p1",
      "p2",
      "verwaist",
    ]);
    // Kinder mit existierendem Parent bleiben aufs Detail beschränkt (nicht auf dem Board).
    expect(boardWurzeln(alle).map((x) => x.id)).not.toContain("k1");
  });

  it("unteraufgabenVon: die direkten Kinder eines Elternteils (Rang-Reihenfolge erhalten)", () => {
    expect(unteraufgabenVon(alle, "p1").map((x) => x.id)).toEqual(["k1", "k2"]);
    expect(unteraufgabenVon(alle, "p2").map((x) => x.id)).toEqual(["k3"]);
    expect(unteraufgabenVon(alle, "p3")).toEqual([]);
  });

  it("boardKarten (ohne Filter): Wurzeln + Waisen, aber KEINE Kinder mit sichtbarem Parent", () => {
    // gefiltert == alle (kein Filter) → Kinder mit sichtbarem Parent bleiben aufs Detail beschränkt.
    expect(boardKarten(alle, alle).map((x) => x.id)).toEqual([
      "p1",
      "p2",
      "verwaist",
    ]);
  });

  it("boardKarten (Filter versteckt den Parent): das gefilterte Kind wird zur eigenen Karte PROMOTET (nicht unsichtbar)", () => {
    // Reproduktion des Review-Defekts: „gefiltert" enthält NUR k1 (z. B. „Nur meine" — k1 mir zugewiesen, p1 nicht).
    // p1 existiert im Gesamtbestand, ist aber weggefiltert → k1 muss als eigene Karte erscheinen, sonst unerreichbar.
    const gefiltert = [a("k1", "p1")];
    expect(boardKarten(alle, gefiltert).map((x) => x.id)).toEqual(["k1"]);
  });

  it("boardKarten: ein gefiltertes Kind, dessen Parent EBENFALLS im Filter sichtbar ist, bleibt aufs Detail beschränkt", () => {
    const gefiltert = [a("p1"), a("k1", "p1")];
    expect(boardKarten(alle, gefiltert).map((x) => x.id)).toEqual(["p1"]);
  });

  it("kinderAnzahl: zählt reale Kinder je Elternteil (auch für nicht existierende Eltern)", () => {
    const n = kinderAnzahl(alle);
    expect(n.get("p1")).toBe(2);
    expect(n.get("p2")).toBe(1);
    expect(n.get("gibtsnicht")).toBe(1);
    expect(n.get("k1")).toBeUndefined();
  });
});
