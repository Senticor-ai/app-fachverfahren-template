import { describe, it, expect } from "vitest";
import type { StatusMachine } from "../types.js";
import {
  erlaubteUebergaenge,
  findeUebergang,
  validiereStatusMachine,
} from "./status-machine.js";

const sm: StatusMachine = {
  initial: "eingegangen",
  states: [
    { key: "eingegangen", label: "Eingegangen", tone: "neu" },
    { key: "pruefung", label: "In Prüfung", tone: "info" },
    { key: "festgesetzt", label: "Festgesetzt", tone: "ok", terminal: true },
    { key: "abgelehnt", label: "Abgelehnt", tone: "block", terminal: true },
  ],
  transitions: [
    {
      from: "eingegangen",
      to: "pruefung",
      label: "Prüfen",
      rollen: ["sachbearbeitung"],
    },
    {
      from: "pruefung",
      to: "festgesetzt",
      label: "Festsetzen",
      rollen: ["sachbearbeitung"],
      vierAugen: true,
    },
    {
      from: "pruefung",
      to: "abgelehnt",
      label: "Ablehnen",
      rollen: ["aufsicht"],
      detailPflicht: true,
    },
  ],
};

describe("findeUebergang / erlaubteUebergaenge", () => {
  it("findet den Übergang (rollen-gefiltert)", () => {
    expect(findeUebergang(sm, "eingegangen", "pruefung")?.label).toBe("Prüfen");
    expect(
      findeUebergang(sm, "pruefung", "abgelehnt", "sachbearbeitung"),
    ).toBeUndefined();
    expect(findeUebergang(sm, "pruefung", "abgelehnt", "aufsicht")?.label).toBe(
      "Ablehnen",
    );
  });
  it("listet die erlaubten Übergänge je Rolle", () => {
    expect(erlaubteUebergaenge(sm, "pruefung").map((t) => t.to)).toEqual([
      "festgesetzt",
      "abgelehnt",
    ]);
    expect(
      erlaubteUebergaenge(sm, "pruefung", "sachbearbeitung").map((t) => t.to),
    ).toEqual(["festgesetzt"]);
  });
  it("ist defensiv gegen eine fehlende Machine", () => {
    expect(findeUebergang(undefined, "a", "b")).toBeUndefined();
    expect(erlaubteUebergaenge(undefined, "a")).toEqual([]);
  });
});

describe("validiereStatusMachine — strukturelle Vollständigkeit", () => {
  it("akzeptiert eine wohlgeformte Machine", () => {
    expect(validiereStatusMachine(sm)).toEqual([]);
  });
  it("meldet ein fehlendes Initial", () => {
    const p = validiereStatusMachine({ ...sm, initial: "gibtsnicht" });
    expect(p.some((x) => x.art === "initial-fehlt")).toBe(true);
  });
  it("meldet einen Endzustand mit Ausgang", () => {
    const p = validiereStatusMachine({
      ...sm,
      transitions: [
        ...sm.transitions,
        { from: "festgesetzt", to: "pruefung", label: "x", rollen: ["a"] },
      ],
    });
    expect(
      p.some(
        (x) => x.art === "terminal-mit-ausgang" && x.state === "festgesetzt",
      ),
    ).toBe(true);
  });
  it("meldet eine Sackgasse (nicht-terminal ohne Ausgang)", () => {
    const p = validiereStatusMachine({
      initial: "a",
      states: [
        { key: "a", label: "A", tone: "neu" },
        { key: "b", label: "B", tone: "info" },
      ],
      transitions: [{ from: "a", to: "b", label: "x", rollen: ["r"] }],
    });
    expect(p.some((x) => x.art === "sackgasse" && x.state === "b")).toBe(true);
  });
  it("meldet einen unerreichbaren State", () => {
    const p = validiereStatusMachine({
      initial: "a",
      states: [
        { key: "a", label: "A", tone: "neu", terminal: true },
        { key: "insel", label: "Insel", tone: "info", terminal: true },
      ],
      transitions: [],
    });
    expect(p.some((x) => x.art === "unerreichbar" && x.state === "insel")).toBe(
      true,
    );
  });
  it("meldet eine Kante in einen unbekannten State", () => {
    const p = validiereStatusMachine({
      ...sm,
      transitions: [
        ...sm.transitions,
        { from: "eingegangen", to: "phantom", label: "x", rollen: ["r"] },
      ],
    });
    expect(
      p.some(
        (x) => x.art === "kante-unbekannter-state" && x.state === "phantom",
      ),
    ).toBe(true);
  });
});
