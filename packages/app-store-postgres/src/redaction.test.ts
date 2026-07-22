// redaction.test — die referenzielle Redaction (#55, ADR-0005 Option B): Tombstone je PII-Pfad, idempotent,
// nicht-destruktiv an der Struktur, fehlende Pfade ignoriert, Original unangetastet (reine Funktion).
import { describe, expect, it } from "vitest";
import { isTombstone, redactData } from "./redaction.js";

const NOW = "2026-07-22T00:00:00.000Z";

describe("redactData", () => {
  it("ersetzt vorhandene PII-Pfade durch Tombstones + meldet die redigierten Pfade", () => {
    const data = {
      antragsteller: { vorname: "Alex", nachname: "Muster", plz: "12345" },
      anliegen: { kategorie: "standard" },
    };
    const { data: red, redacted } = redactData(
      data,
      ["antragsteller.vorname", "antragsteller.nachname"],
      NOW,
    );
    expect(redacted).toEqual([
      "antragsteller.vorname",
      "antragsteller.nachname",
    ]);
    const ast = red["antragsteller"] as Record<string, unknown>;
    expect(isTombstone(ast["vorname"])).toBe(true);
    // Nicht-PII bleibt, Struktur bleibt.
    expect(ast["plz"]).toBe("12345");
    expect((red["anliegen"] as Record<string, unknown>)["kategorie"]).toBe(
      "standard",
    );
  });

  it("lässt das Original unangetastet (reine Funktion, tiefe Kopie)", () => {
    const data = { antragsteller: { vorname: "Alex" } };
    redactData(data, ["antragsteller.vorname"], NOW);
    expect(data.antragsteller.vorname).toBe("Alex");
  });

  it("fehlende Pfade zählen nicht + idempotent (zweites Löschen ändert nichts)", () => {
    const data = { antragsteller: { vorname: "Alex" } };
    const eins = redactData(
      data,
      ["antragsteller.vorname", "gibt.es.nicht"],
      NOW,
    );
    expect(eins.redacted).toEqual(["antragsteller.vorname"]);
    const zwei = redactData(eins.data, ["antragsteller.vorname"], NOW);
    expect(zwei.redacted).toEqual([]); // schon getombstonet
  });
});
