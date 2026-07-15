import { describe, it, expect } from "vitest";
import type { StatusMachine } from "../types.js";
import type { ProzessDefinition } from "./process-ir.js";
import { validateProzessGraph } from "./process-graph.js";

// Der Validator liest NUR statusMachine.transitions (nicht states) — states bleiben leer.
const sm: StatusMachine = {
  initial: "eingegangen",
  states: [],
  transitions: [
    {
      from: "eingegangen",
      to: "vorgelegt",
      label: "Vorlegen",
      rollen: ["sachbearbeitung"],
    },
    {
      from: "vorgelegt",
      to: "festgesetzt",
      label: "Festsetzen",
      rollen: ["sachbearbeitung"],
      vierAugen: true,
    },
  ],
};

// Kanonischer, VALIDER Prozess: Start -> UserTask(vorgelegt) -> XOR-Gateway -> [Guard: UserTask(festgesetzt, 4-Augen) | Default: Ende] .
function gueltig(): ProzessDefinition {
  return {
    id: "p1",
    version: 1,
    knoten: [
      { id: "s", typ: "start" },
      {
        id: "u",
        typ: "userTask",
        rollen: ["sachbearbeitung"],
        catalogAction: "vorgelegt",
      },
      { id: "g", typ: "exclusiveGateway" },
      {
        id: "uf",
        typ: "userTask",
        rollen: ["sachbearbeitung"],
        catalogAction: "festgesetzt",
        vierAugen: true,
      },
      { id: "e1", typ: "ende" },
      { id: "e2", typ: "ende" },
    ],
    kanten: [
      { id: "k1", von: "s", nach: "u" },
      { id: "k2", von: "u", nach: "g" },
      {
        id: "k3",
        von: "g",
        nach: "uf",
        guard: { feld: "betrag", op: ">=", wert: 100 },
      },
      { id: "k4", von: "g", nach: "e2", default: true },
      { id: "k5", von: "uf", nach: "e1" },
    ],
  };
}
const codes = (def: ProzessDefinition) =>
  validateProzessGraph(def, sm).map((f) => f.code);

describe("validateProzessGraph — fail-closed Deploy-Gate", () => {
  it("akzeptiert einen wohlgeformten Prozess (keine Fehler)", () => {
    expect(validateProzessGraph(gueltig(), sm)).toEqual([]);
  });

  it("[G5] lehnt einen (noch) nicht unterstuetzten Knotentyp ab", () => {
    const d = gueltig();
    d.knoten.push({ id: "t", typ: "timerEvent" });
    d.kanten.push({ id: "kt", von: "t", nach: "e1" });
    expect(codes(d)).toContain("knoten-typ-nicht-unterstuetzt");
  });

  it("erkennt eine Sackgasse (Nicht-Ende ohne Ausgang)", () => {
    const d = gueltig();
    d.knoten.push({
      id: "u2",
      typ: "userTask",
      rollen: ["sachbearbeitung"],
      catalogAction: "vorgelegt",
    });
    d.kanten.push({ id: "kx", von: "u", nach: "u2" }); // u2 erreichbar, aber ohne Ausgang
    expect(codes(d)).toContain("sackgasse");
  });

  it("erkennt einen unerreichbaren Knoten", () => {
    const d = gueltig();
    d.knoten.push({
      id: "iso",
      typ: "userTask",
      rollen: ["sachbearbeitung"],
      catalogAction: "vorgelegt",
    });
    d.kanten.push({ id: "kiso", von: "iso", nach: "e1" }); // hat Ausgang, aber kein Eingang -> unerreichbar
    expect(codes(d)).toContain("knoten-unerreichbar");
  });

  it("[G2] verlangt einen nicht-leeren Guard auf jedem Nicht-Default-Gateway-Zweig", () => {
    const d = gueltig();
    delete d.kanten.find((e) => e.id === "k3")!.guard; // Guard entfernen
    expect(codes(d)).toContain("gateway-guard-leer");
  });

  it("[G2] lehnt einen unbekannten Guard-Operator ab", () => {
    const d = gueltig();
    // Operator ausserhalb der BedingungOperator-Enum -> harter Reject (nicht still false).
    d.kanten.find((e) => e.id === "k3")!.guard = {
      feld: "betrag",
      op: "ungefaehr" as unknown as "==",
      wert: 100,
    };
    expect(codes(d)).toContain("gateway-guard-operator");
  });

  it("[G2] verlangt genau EINEN Default-Flow je Exclusive-Gateway", () => {
    const d = gueltig();
    d.kanten.find((e) => e.id === "k3")!.default = true; // jetzt zwei Defaults
    expect(codes(d)).toContain("gateway-default");
  });

  it("[H4] erzwingt die Vier-Augen-Bijektion Knoten <-> Transition", () => {
    const d = gueltig();
    // uf mappt auf die 4-Augen-Transition, behauptet aber KEINE 4-Augen -> Widerspruch.
    delete (d.knoten.find((k) => k.id === "uf") as { vierAugen?: boolean })
      .vierAugen;
    expect(codes(d)).toContain("vier-augen-bijektion");
  });

  it("lehnt eine catalogAction ohne passende Transition ab", () => {
    const d = gueltig();
    (
      d.knoten.find((k) => k.id === "u") as { catalogAction: string }
    ).catalogAction = "gibtsnicht";
    expect(codes(d)).toContain("catalog-action-unbekannt");
  });

  it("lehnt eine User-Task-Rolle ab, die die gemappte Transition nicht erlaubt", () => {
    const d = gueltig();
    (d.knoten.find((k) => k.id === "u") as { rollen: string[] }).rollen = [
      "fremde-rolle",
    ];
    expect(codes(d)).toContain("usertask-rolle-nicht-im-katalog");
  });

  it("verlangt genau einen Start und mindestens ein Ende", () => {
    const d = gueltig();
    d.knoten = d.knoten.filter((k) => k.typ !== "start" && k.typ !== "ende");
    const c = codes(d);
    expect(c).toContain("start-anzahl");
    expect(c).toContain("ende-fehlt");
  });
});
