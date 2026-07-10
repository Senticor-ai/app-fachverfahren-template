import { describe, it, expect } from "vitest";
import type { BoardConfig, PriorityDef, StatusMachine } from "../types.js";
import { boardSpalten } from "./interpreter.js";

const statusMachine: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "pruefung", label: "In Prüfung", tone: "info" },
    { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
  ],
  transitions: [],
};

const prioritaeten: PriorityDef[] = [
  { key: "niedrig", label: "Niedrig", tone: "info", ordinal: 3 },
  { key: "hoch", label: "Hoch", tone: "warn", ordinal: 1 },
  { key: "dringend", label: "Dringend", tone: "block", ordinal: 0 },
];

describe("boardSpalten — Kanban-Spalten aus DATEN", () => {
  it("leitet Status-Spalten aus der State-Machine ab (Default-Achse)", () => {
    const spalten = boardSpalten({ statusMachine });
    expect(spalten.map((s) => s.key)).toEqual([
      "eingegangen",
      "pruefung",
      "festgesetzt",
      "abgelehnt",
    ]);
  });

  it("normalisiert Endzustände zu State-Groups (block→abgebrochen, sonst→erledigt)", () => {
    const spalten = boardSpalten({ statusMachine });
    const byKey = Object.fromEntries(spalten.map((s) => [s.key, s.gruppe]));
    expect(byKey.festgesetzt).toBe("erledigt");
    expect(byKey.abgelehnt).toBe("abgebrochen");
    expect(byKey.eingegangen).toBeUndefined();
  });

  it("bevorzugt explizite board.spalten vor der Ableitung", () => {
    const board: BoardConfig = {
      achse: "status",
      spalten: [{ key: "x", label: "Eigene Spalte" }],
    };
    expect(boardSpalten({ statusMachine, board })).toEqual([
      { key: "x", label: "Eigene Spalte" },
    ]);
  });

  it("bildet für die Prioritäts-Achse Spalten nach ordinal (aufsteigend)", () => {
    const board: BoardConfig = { achse: "prioritaet" };
    const spalten = boardSpalten({ statusMachine, board, prioritaeten });
    expect(spalten.map((s) => s.key)).toEqual(["dringend", "hoch", "niedrig"]);
  });

  it("fällt für die Prioritäts-Achse auf Workspace-Prioritäten zurück", () => {
    const board: BoardConfig = { achse: "prioritaet" };
    const spalten = boardSpalten({ statusMachine, board }, prioritaeten);
    expect(spalten.map((s) => s.key)).toEqual(["dringend", "hoch", "niedrig"]);
  });

  it("liefert für die Zuweisungs-Achse ohne explizite Spalten eine leere Liste (dynamisch)", () => {
    const board: BoardConfig = { achse: "zuweisung" };
    expect(boardSpalten({ statusMachine, board })).toEqual([]);
  });
});
