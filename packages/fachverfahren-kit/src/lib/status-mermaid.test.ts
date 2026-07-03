import { describe, it, expect } from "vitest";
import type { StatusMachine } from "../types.js";
import { statusMachineZuMermaid } from "./status-mermaid.js";

// Bewusst VERFAHRENSFREIE Beispiel-Maschine (eingegangen → prüfung → festgesetzt|abgelehnt) — die Ableitung ist
// domänen-agnostisch: sie liest nur Vertrag-Felder, keine Literale.
const machine: StatusMachine = {
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
      label: "Zur Prüfung",
      rollen: ["sachbearbeitung"],
    },
    {
      from: "pruefung",
      to: "festgesetzt",
      label: "Festsetzen",
      rollen: ["sachbearbeitung", "aufsicht"],
      vierAugen: true,
    },
    {
      from: "pruefung",
      to: "abgelehnt",
      label: "Ablehnen",
      rollen: ["sachbearbeitung"],
      detailPflicht: true,
    },
  ],
};

describe("statusMachineZuMermaid — reine Projektion StatusMachine → stateDiagram-v2", () => {
  it("beginnt mit dem stateDiagram-v2-Header und trägt die Richtung", () => {
    const out = statusMachineZuMermaid(machine);
    expect(out.startsWith("stateDiagram-v2")).toBe(true);
    expect(out).toContain("direction TB");
    expect(statusMachineZuMermaid(machine, { richtung: "LR" })).toContain(
      "direction LR",
    );
  });

  it("markiert den Initialzustand über [*] --> <initial>", () => {
    const out = statusMachineZuMermaid(machine);
    expect(out).toContain("[*] --> eingegangen");
  });

  it("markiert jeden Terminalzustand über <state> --> [*] (und nur diese)", () => {
    const out = statusMachineZuMermaid(machine);
    expect(out).toContain("festgesetzt --> [*]");
    expect(out).toContain("abgelehnt --> [*]");
    // Nicht-terminale Zustände dürfen keinen Terminal-Pfeil bekommen.
    expect(out).not.toContain("eingegangen --> [*]");
    expect(out).not.toContain("pruefung --> [*]");
  });

  it("deklariert jeden Zustand mit lesbarer Beschriftung (Label ≠ id)", () => {
    const out = statusMachineZuMermaid(machine);
    expect(out).toContain('state "Eingegangen" as eingegangen');
    expect(out).toContain('state "In Prüfung" as pruefung');
  });

  it("erzeugt je Übergang eine Kante mit Handlungs-Label und Rollen", () => {
    const out = statusMachineZuMermaid(machine);
    expect(out).toContain("eingegangen --> pruefung : Zur Prüfung · sachbearbeitung");
    expect(out).toContain(
      "pruefung --> festgesetzt : Festsetzen · sachbearbeitung/aufsicht [4-Augen]",
    );
    expect(out).toContain(
      "pruefung --> abgelehnt : Ablehnen · sachbearbeitung [Begründung]",
    );
  });

  it("kann Rollen und Marker abschalten", () => {
    const out = statusMachineZuMermaid(machine, {
      zeigeRollen: false,
      zeigeMarker: false,
    });
    expect(out).toContain("pruefung --> festgesetzt : Festsetzen");
    expect(out).not.toContain("4-Augen");
    expect(out).not.toContain("sachbearbeitung");
  });

  it("erzeugt Mermaid-sichere, eindeutige ids für Schlüssel mit Sonderzeichen/Ziffern", () => {
    const speziell: StatusMachine = {
      initial: "1-neu",
      states: [
        { key: "1-neu", label: "Neu", tone: "neu" },
        { key: "in prüfung", label: "In Prüfung", tone: "info" },
      ],
      transitions: [
        { from: "1-neu", to: "in prüfung", label: "Los", rollen: [] },
      ],
    };
    const out = statusMachineZuMermaid(speziell);
    // Führende Ziffer präfixiert, Leerzeichen/Sonderzeichen → "_"; keine rohen Sonderzeichen in ids.
    expect(out).toContain("s_1_neu");
    expect(out).toContain("in_pr_fung");
    expect(out).toContain("[*] --> s_1_neu");
  });

  it("ist deterministisch (gleiche Eingabe → gleiche Ausgabe)", () => {
    expect(statusMachineZuMermaid(machine)).toBe(statusMachineZuMermaid(machine));
  });
});
