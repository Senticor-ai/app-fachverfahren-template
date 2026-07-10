import { describe, expect, it } from "vitest";
import { leiteWorkspaceBenachrichtigungen } from "./benachrichtigungen.js";
import type { Aufgabe } from "../types.js";

function a(over: Partial<Aufgabe> = {}): Aufgabe {
  return {
    id: "t1",
    procedureId: "p",
    tenantId: "t",
    authorityId: "a",
    jurisdictionId: "de",
    titel: "Aufgabe",
    labels: [],
    sortRank: "V",
    version: 1,
    ...over,
  };
}

const NOW = "2026-07-10T12:00:00.000Z";

describe("leiteWorkspaceBenachrichtigungen", () => {
  it("überschrittene Frist ⇒ block", () => {
    const b = leiteWorkspaceBenachrichtigungen({
      aufgaben: [a({ id: "x", faelligIso: "2026-07-09T12:00:00.000Z" })],
      aktuellerAkteur: "sb.eins",
      nowIso: NOW,
    });
    expect(b).toHaveLength(1);
    expect(b[0]?.typ).toBe("block");
    expect(b[0]?.id).toBe("frist-ueber:x");
  });

  it("Frist innerhalb der Vorwarnzeit ⇒ warn; außerhalb ⇒ keine", () => {
    const bald = leiteWorkspaceBenachrichtigungen({
      aufgaben: [a({ id: "x", faelligIso: "2026-07-11T00:00:00.000Z" })],
      aktuellerAkteur: "sb.eins",
      nowIso: NOW,
      fristWarnStunden: 48,
    });
    expect(bald[0]?.typ).toBe("warn");

    const fern = leiteWorkspaceBenachrichtigungen({
      aufgaben: [a({ id: "y", faelligIso: "2026-07-20T00:00:00.000Z" })],
      aktuellerAkteur: "sb.eins",
      nowIso: NOW,
      fristWarnStunden: 48,
    });
    expect(fern).toHaveLength(0);
  });

  it("mir zugewiesen ⇒ info", () => {
    const b = leiteWorkspaceBenachrichtigungen({
      aufgaben: [a({ id: "z", zugewiesenAn: "sb.eins" })],
      aktuellerAkteur: "sb.eins",
      nowIso: NOW,
    });
    expect(b.map((n) => n.typ)).toContain("info");
    expect(b.find((n) => n.typ === "info")?.id).toBe("zuweisung:z");
  });

  it("fremde Zuweisung erzeugt keine info", () => {
    const b = leiteWorkspaceBenachrichtigungen({
      aufgaben: [a({ id: "z", zugewiesenAn: "sb.zwei" })],
      aktuellerAkteur: "sb.eins",
      nowIso: NOW,
    });
    expect(b).toHaveLength(0);
  });

  it("sortiert nach Schweregrad (block vor warn vor info)", () => {
    const b = leiteWorkspaceBenachrichtigungen({
      aufgaben: [
        a({ id: "mine", zugewiesenAn: "sb.eins" }),
        a({ id: "warn", faelligIso: "2026-07-11T00:00:00.000Z" }),
        a({ id: "over", faelligIso: "2026-07-01T00:00:00.000Z" }),
      ],
      aktuellerAkteur: "sb.eins",
      nowIso: NOW,
    });
    expect(b.map((n) => n.typ)).toEqual(["block", "warn", "info"]);
  });
});
