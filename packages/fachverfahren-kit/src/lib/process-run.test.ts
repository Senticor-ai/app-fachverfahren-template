import { describe, it, expect } from "vitest";
import type { ProzessDefinition } from "./process-ir.js";
import { planTokenSchritt } from "./process-run.js";

// Start -> u -> XOR-Gateway g -> [Guard betrag>=100: a | Guard status=="eilt": b | Default: c] .
const def: ProzessDefinition = {
  id: "p",
  version: 1,
  knoten: [
    { id: "s", typ: "start" },
    { id: "u", typ: "userTask", rollen: ["sb"], catalogAction: "vorgelegt" },
    { id: "g", typ: "exclusiveGateway" },
    { id: "a", typ: "ende" },
    { id: "b", typ: "ende" },
    { id: "c", typ: "ende" },
  ],
  kanten: [
    { id: "k1", von: "s", nach: "u" },
    { id: "k2", von: "u", nach: "g" },
    {
      id: "ka",
      von: "g",
      nach: "a",
      guard: { feld: "betrag", op: ">=", wert: 100 },
    },
    {
      id: "kb",
      von: "g",
      nach: "b",
      guard: { feld: "status", op: "==", wert: "eilt" },
    },
    { id: "kc", von: "g", nach: "c", default: true },
  ],
};

describe("planTokenSchritt — reiner deterministischer Planer", () => {
  it("sequentieller Knoten: genau der eine Nachfolger", () => {
    expect(planTokenSchritt(def, "s")).toEqual(["u"]);
    expect(planTokenSchritt(def, "u")).toEqual(["g"]);
  });

  it("Ende-Knoten: kein weiterer Schritt", () => {
    expect(planTokenSchritt(def, "a")).toEqual([]);
  });

  it("unbekannter Knoten: defensiv leer", () => {
    expect(planTokenSchritt(def, "gibtsnicht")).toEqual([]);
  });

  it("Exclusive-Gateway: erster erfuellter Guard gewinnt (deterministisch, Kanten-Reihenfolge)", () => {
    // betrag>=100 erfuellt -> a (auch wenn status==eilt ebenfalls passen wuerde)
    expect(planTokenSchritt(def, "g", { betrag: 250, status: "eilt" })).toEqual(
      ["a"],
    );
    // nur der zweite Guard passt -> b
    expect(planTokenSchritt(def, "g", { betrag: 10, status: "eilt" })).toEqual([
      "b",
    ]);
  });

  it("Exclusive-Gateway: kein Guard erfuellt -> Default-Flow", () => {
    expect(
      planTokenSchritt(def, "g", { betrag: 10, status: "normal" }),
    ).toEqual(["c"]);
    // ganz ohne Variablen greift ebenfalls der Default (Guards nicht erfuellt).
    expect(planTokenSchritt(def, "g")).toEqual(["c"]);
  });
});
