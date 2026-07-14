import { describe, expect, it } from "vitest";
import { erledigteStationen } from "./StatusVerfolgung.js";

// Verzweigende Status-Maschine wie ein reales Fachverfahren: nach der Prüfung teilt sich der Weg in einen
// bewilligenden Endzustand („festgesetzt") und einen ablehnenden („abgelehnt"). Genau hier verriet der frühere
// Positionsindex den falschen Fortschritt — der gegenteilige Endzweig wurde als erledigt markiert.
const transitions = [
  { from: "eingegangen", to: "in_pruefung" },
  { from: "in_pruefung", to: "festgesetzt" },
  { from: "in_pruefung", to: "abgelehnt" },
];

describe("erledigteStationen", () => {
  it("markiert nur die tatsächlich durchlaufenen Vorgänger des aktuellen Status", () => {
    const erledigt = erledigteStationen(transitions, "in_pruefung");
    expect([...erledigt].sort()).toEqual(["eingegangen"]);
  });

  it("markiert bei ABLEHNUNG den gegenteiligen Endzustand NICHT als erledigt", () => {
    const erledigt = erledigteStationen(transitions, "abgelehnt");
    // Vorgänger von „abgelehnt": eingegangen → in_pruefung → abgelehnt.
    expect(erledigt.has("eingegangen")).toBe(true);
    expect(erledigt.has("in_pruefung")).toBe(true);
    // Der bewilligende Endzustand liegt NICHT auf dem Pfad — darf kein grünes Häkchen bekommen.
    expect(erledigt.has("festgesetzt")).toBe(false);
    // Der aktuelle Status selbst ist nie „erledigt".
    expect(erledigt.has("abgelehnt")).toBe(false);
  });

  it("markiert bei BEWILLIGUNG den ablehnenden Zweig NICHT als erledigt (symmetrisch)", () => {
    const erledigt = erledigteStationen(transitions, "festgesetzt");
    expect(erledigt.has("eingegangen")).toBe(true);
    expect(erledigt.has("in_pruefung")).toBe(true);
    expect(erledigt.has("abgelehnt")).toBe(false);
    expect(erledigt.has("festgesetzt")).toBe(false);
  });

  it("liefert leere Menge für den Initialzustand (nichts vorher durchlaufen)", () => {
    expect(erledigteStationen(transitions, "eingegangen").size).toBe(0);
  });

  it("liefert leere Menge für einen unbekannten Status (kein Vorgänger im Graph)", () => {
    expect(erledigteStationen(transitions, "gibtsnicht").size).toBe(0);
  });

  it("terminiert bei einem Zyklus und schließt den aktuellen Status aus", () => {
    // Rücksprung (z. B. „abgelehnt" → „in_pruefung" bei Wiederaufnahme) darf keine Endlosschleife erzeugen.
    const mitZyklus = [
      { from: "eingegangen", to: "in_pruefung" },
      { from: "in_pruefung", to: "abgelehnt" },
      { from: "abgelehnt", to: "in_pruefung" },
    ];
    const erledigt = erledigteStationen(mitZyklus, "abgelehnt");
    expect(erledigt.has("eingegangen")).toBe(true);
    expect(erledigt.has("in_pruefung")).toBe(true);
    expect(erledigt.has("abgelehnt")).toBe(false);
  });
});
