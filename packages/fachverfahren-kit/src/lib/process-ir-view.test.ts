import { describe, it, expect } from "vitest";
import type { ProzessDefinition } from "./process-ir.js";
import {
  bedingungKurz,
  prozessDefZuMermaid,
  prozessDefZuTabelle,
} from "./process-ir-view.js";

const def: ProzessDefinition = {
  id: "p",
  version: 1,
  knoten: [
    { id: "s", typ: "start" },
    {
      id: "u",
      typ: "userTask",
      rollen: ["sachbearbeitung"],
      catalogAction: "vorgelegt",
      label: "Vorlegen",
    },
    { id: "g", typ: "exclusiveGateway" },
    { id: "svc", typ: "serviceTask", catalogAction: "benachrichtigt" },
    { id: "e", typ: "ende" },
  ],
  kanten: [
    { id: "k1", von: "s", nach: "u" },
    { id: "k2", von: "u", nach: "g" },
    {
      id: "k3",
      von: "g",
      nach: "svc",
      guard: { feld: "betrag", op: ">=", wert: 100 },
    },
    { id: "k4", von: "g", nach: "e", default: true },
    { id: "k5", von: "svc", nach: "e" },
  ],
};

describe("prozessDefZuMermaid — flowchart-Projektion", () => {
  const m = prozessDefZuMermaid(def);

  it("beginnt mit flowchart + kodiert die Knotenform je Typ", () => {
    expect(m.startsWith("flowchart TD")).toBe(true);
    expect(m).toContain('s(("Start"))'); // Start = Kreis
    expect(m).toContain('u["Vorlegen"]'); // Task = Rechteck
    expect(m).toContain('g{"XOR"}'); // Gateway = Raute
    expect(m).toContain('e(("Ende"))');
  });

  it("beschriftet Guard- und Default-Kanten, schlichte Kanten ohne Label", () => {
    expect(m).toContain('g -->|"betrag ≥ 100"| svc');
    expect(m).toContain('g -->|"sonst"| e');
    expect(m).toContain("s --> u"); // ohne Label
  });

  it("ist deterministisch (gleiche Eingabe → gleiche Ausgabe)", () => {
    expect(prozessDefZuMermaid(def)).toBe(m);
  });

  it("entschaerft Mermaid-brechende Zeichen in Labels", () => {
    const boese = prozessDefZuMermaid({
      id: "x",
      version: 1,
      knoten: [
        {
          id: "n",
          typ: "userTask",
          rollen: ["r"],
          catalogAction: "z",
          label: 'A "B" | <C>',
        },
      ],
      kanten: [],
    });
    expect(boese).not.toContain('"A "B"'); // rohe Quotes/Pipes/Winkel raus
    expect(boese).toContain("A 'B' / ‹C›");
  });
});

describe("prozessDefZuTabelle — BITV-primaere Tabellen-Sicht", () => {
  const rows = prozessDefZuTabelle(def);

  it("eine Zeile je Knoten mit Typ/Label", () => {
    expect(rows).toHaveLength(5);
    const u = rows.find((r) => r.knotenId === "u")!;
    expect(u.typ).toBe("userTask");
    expect(u.rollen).toEqual(["sachbearbeitung"]);
    expect(u.catalogAction).toBe("vorgelegt");
  });

  it("listet ausgehende Kanten mit Guard/Default-Zusammenfassung", () => {
    const g = rows.find((r) => r.knotenId === "g")!;
    expect(g.ausgaenge).toEqual([
      { kanteId: "k3", nach: "svc", guard: "betrag ≥ 100" },
      { kanteId: "k4", nach: "e", default: true },
    ]);
  });

  it("Start/Ende ohne Rollen/catalogAction; serviceTask mit catalogAction", () => {
    expect(rows.find((r) => r.knotenId === "s")!.catalogAction).toBeUndefined();
    expect(rows.find((r) => r.knotenId === "svc")!.catalogAction).toBe(
      "benachrichtigt",
    );
  });
});

describe("bedingungKurz — kurze Bedingungs-Zusammenfassung", () => {
  it("Feld-Bedingung mit Operator-Symbol", () => {
    expect(bedingungKurz({ feld: "status", op: "==", wert: "eilt" })).toBe(
      "status = eilt",
    );
    expect(bedingungKurz({ feld: "n", op: "gesetzt" })).toBe("n gesetzt");
  });

  it("Gruppen rekursiv (∧ / ∨ / ¬)", () => {
    expect(
      bedingungKurz({
        alle: [
          { feld: "a", op: ">=", wert: 1 },
          { feld: "b", op: "==", wert: "x" },
        ],
      }),
    ).toBe("a ≥ 1 ∧ b = x");
    expect(bedingungKurz({ nicht: { feld: "c", op: "gesetzt" } })).toBe(
      "¬(c gesetzt)",
    );
  });
});
