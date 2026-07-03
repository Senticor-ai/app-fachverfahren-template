import { describe, it, expect } from "vitest";
import type { Nachweis } from "../types.js";
import {
  nachweisAcceptAttribut,
  nachweisEinschraenkungenText,
  pruefeNachweisDatei,
} from "./nachweis-pruefung.js";

// Bewusst VERFAHRENSFREIE Beispiel-Nachweise — die Regeln sind domänen-agnostisch (Werte kommen als DATEN).
const basis: Nachweis = { id: "beleg", label: "Nachweis", hochgeladen: false };

describe("nachweisAcceptAttribut — accept-Tokens aus DATEN", () => {
  it("baut das kommagetrennte accept aus akzeptierteTypen", () => {
    const n: Nachweis = {
      ...basis,
      akzeptierteTypen: ["application/pdf", "image/*", ".jpg"],
    };
    expect(nachweisAcceptAttribut(n)).toBe("application/pdf,image/*,.jpg");
  });

  it("ist undefined ohne Einschränkung (jeder Typ wählbar)", () => {
    expect(nachweisAcceptAttribut(basis)).toBeUndefined();
    expect(
      nachweisAcceptAttribut({ ...basis, akzeptierteTypen: [] }),
    ).toBeUndefined();
  });
});

describe("nachweisEinschraenkungenText — menschenlesbarer Hinweis", () => {
  it("nennt erlaubte Typen (Kurz-Labels) und die Maximalgröße", () => {
    const n: Nachweis = {
      ...basis,
      akzeptierteTypen: ["application/pdf", "image/*"],
      maxGroesseBytes: 10 * 1024 * 1024,
    };
    expect(nachweisEinschraenkungenText(n)).toBe(
      "Erlaubt: PDF, Bilder · max. 10 MB",
    );
  });

  it("nennt nur die Größe, wenn nur sie gesetzt ist", () => {
    expect(
      nachweisEinschraenkungenText({ ...basis, maxGroesseBytes: 512 * 1024 }),
    ).toBe("max. 512 KB");
  });

  it("ist undefined ohne jede Einschränkung", () => {
    expect(nachweisEinschraenkungenText(basis)).toBeUndefined();
  });
});

describe("pruefeNachweisDatei — reine Fail-Fast-Vorprüfung (nie autoritativ)", () => {
  it("gibt null ohne Einschränkungen zurück", () => {
    expect(
      pruefeNachweisDatei(basis, { name: "x.exe", groesse: 9_999_999 }),
    ).toBeNull();
  });

  it("akzeptiert eine passende Endung", () => {
    const n: Nachweis = { ...basis, akzeptierteTypen: [".pdf"] };
    expect(
      pruefeNachweisDatei(n, { name: "Beleg.PDF", groesse: 1000, typ: "" }),
    ).toBeNull();
  });

  it("akzeptiert einen Wildcard-MIME (image/*)", () => {
    const n: Nachweis = { ...basis, akzeptierteTypen: ["image/*"] };
    expect(
      pruefeNachweisDatei(n, {
        name: "foto.png",
        groesse: 1000,
        typ: "image/png",
      }),
    ).toBeNull();
  });

  it("akzeptiert einen exakten MIME", () => {
    const n: Nachweis = { ...basis, akzeptierteTypen: ["application/pdf"] };
    expect(
      pruefeNachweisDatei(n, {
        name: "beleg",
        groesse: 1000,
        typ: "application/pdf",
      }),
    ).toBeNull();
  });

  it("lehnt ein unzulässiges Format ab (grund=format)", () => {
    const n: Nachweis = { ...basis, akzeptierteTypen: ["application/pdf"] };
    const fehler = pruefeNachweisDatei(n, {
      name: "bild.png",
      groesse: 1000,
      typ: "image/png",
    });
    expect(fehler?.grund).toBe("format");
    expect(fehler?.meldung).toContain("PDF");
  });

  it("lehnt eine zu große Datei ab (grund=groesse) und nennt beide Größen", () => {
    const n: Nachweis = { ...basis, maxGroesseBytes: 1024 };
    const fehler = pruefeNachweisDatei(n, { name: "gross.pdf", groesse: 4096 });
    expect(fehler?.grund).toBe("groesse");
    expect(fehler?.meldung).toContain("4 KB");
    expect(fehler?.meldung).toContain("1 KB");
  });

  it("meldet das Format zuerst, wenn Typ UND Größe verletzt sind", () => {
    const n: Nachweis = {
      ...basis,
      akzeptierteTypen: [".pdf"],
      maxGroesseBytes: 1024,
    };
    expect(
      pruefeNachweisDatei(n, {
        name: "gross.png",
        groesse: 4096,
        typ: "image/png",
      })?.grund,
    ).toBe("format");
  });
});
