import { describe, it, expect } from "vitest";
import type { Datenanbindung } from "../types.js";
import {
  datenanbindungen,
  datenanbindungenByArt,
  verifyDatenanbindung,
} from "./datenanbindung.js";

// Verfahrensfreie Beispiel-Anbindungen — die Regeln sind domänen-agnostisch (Werte kommen als DATEN).
const register: Datenanbindung = {
  quelle: "Melderegister",
  art: "register",
  richtung: "abruf",
  zweck: "Wohnsitznachweis für die Antragsprüfung",
  verbindungsklasse: 3,
};
const intern: Datenanbindung = {
  quelle: "E-Akte",
  art: "intern",
  richtung: "meldung",
  zweck: "Vorgangsablage",
};
const extern: Datenanbindung = {
  quelle: "ePayBL",
  art: "extern",
  richtung: "meldung",
  zweck: "Gebühreneinzug",
  verbindungsklasse: 2,
};

describe("datenanbindungen — effektive Liste (defensiv)", () => {
  it("fehlt → leer (kein Falsch-Block über bestehende Configs)", () => {
    expect(datenanbindungen({})).toEqual([]);
    // Defensiv gegen explizites `undefined` (fremd-/partiell-erzeugte Config): der Typ verbietet es
    // (exactOptionalPropertyTypes), zur Laufzeit muss der Guard es wie „fehlt" behandeln → Cast.
    expect(
      datenanbindungen({
        datenanbindung: undefined,
      } as unknown as Parameters<typeof datenanbindungen>[0]),
    ).toEqual([]);
  });
  it("verwirft Einträge ohne quelle, behält gültige", () => {
    const list = datenanbindungen({
      datenanbindung: [register, { ...intern, quelle: "  " }, extern],
    });
    expect(list.map((d) => d.quelle)).toEqual(["Melderegister", "ePayBL"]);
  });
});

describe("datenanbindungenByArt — die drei Flavors", () => {
  it("gruppiert nach art, immer alle drei Schlüssel", () => {
    const g = datenanbindungenByArt({
      datenanbindung: [register, intern, extern],
    });
    expect(g.register.map((d) => d.quelle)).toEqual(["Melderegister"]);
    expect(g.intern.map((d) => d.quelle)).toEqual(["E-Akte"]);
    expect(g.extern.map((d) => d.quelle)).toEqual(["ePayBL"]);
  });
  it("leere Config → alle drei leer", () => {
    const g = datenanbindungenByArt({});
    expect(g).toEqual({ register: [], intern: [], extern: [] });
  });
});

describe("verifyDatenanbindung — DSGVO-Zweckbindung + BSI-Verbindungsklasse", () => {
  it("keine Anbindung → ok (kein Falsch-Block)", () => {
    expect(verifyDatenanbindung({})).toEqual({ ok: true, mangel: [] });
  });
  it("vollständige Anbindungen → ok", () => {
    expect(
      verifyDatenanbindung({ datenanbindung: [register, intern, extern] }).ok,
    ).toBe(true);
  });
  it("fehlender zweck → Mangel (Art. 5 DSGVO)", () => {
    const v = verifyDatenanbindung({
      datenanbindung: [{ ...intern, zweck: "  " }],
    });
    expect(v.ok).toBe(false);
    expect(v.mangel[0]).toMatchObject({ quelle: "E-Akte", feld: "zweck" });
  });
  it("register/extern ohne verbindungsklasse → Mangel (BSI TR-03190)", () => {
    // Das reale Szenario ist eine Anbindung, der das Feld FEHLT (nicht explizit undefined) → weglassen.
    const { verbindungsklasse: _rk, ...registerOhneKlasse } = register;
    const { verbindungsklasse: _ek, ...externOhneKlasse } = extern;
    const vReg = verifyDatenanbindung({
      datenanbindung: [registerOhneKlasse],
    });
    const vExt = verifyDatenanbindung({
      datenanbindung: [externOhneKlasse],
    });
    expect(vReg.mangel.some((m) => m.feld === "verbindungsklasse")).toBe(true);
    expect(vExt.mangel.some((m) => m.feld === "verbindungsklasse")).toBe(true);
  });
  it("intern OHNE verbindungsklasse → ok (überschreitet keine Vertrauensgrenze)", () => {
    expect(verifyDatenanbindung({ datenanbindung: [intern] }).ok).toBe(true);
  });
  it("mehrere Mängel werden je Quelle + Feld gesammelt", () => {
    const kaputt: Datenanbindung = {
      quelle: "X",
      art: "extern",
      richtung: "abruf",
      zweck: "",
    };
    const v = verifyDatenanbindung({ datenanbindung: [kaputt] });
    expect(v.mangel.map((m) => m.feld).sort()).toEqual([
      "verbindungsklasse",
      "zweck",
    ]);
  });
});
