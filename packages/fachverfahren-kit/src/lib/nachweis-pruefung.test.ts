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

// ── DER BLOSSE ENDUNGS-TOKEN (2026-09-14, an der Buergerstrecke live gemessen) ─────────────────────────
//
// ⛔ Ein erzeugtes Verfahren deklarierte `akzeptierteTypen: ['pdf']` — ohne Punkt. Der Vergleich fiel
// damit auf `mime === "pdf"`, und kein Browser meldet diesen MIME-Typ: eine gueltige PDF wurde
// abgewiesen, beide ERFORDERLICHEN Nachweise liessen sich nicht anhaengen, der Antrag war strukturell
// nicht absendbar. Die Meldung lautete dabei «Erlaubt: PDF» — denn `typLabel` versteht den Token sehr
// wohl. Zwei Wahrheiten ueber denselben Token, in derselben Datei.
describe("blosser Endungs-Token — er traf die LEERE MENGE", () => {
  const pdf = {
    name: "schulbescheinigung.pdf",
    groesse: 601,
    typ: "application/pdf",
  };

  it("DER FALL: `pdf` ohne Punkt nimmt eine PDF an (vorher: abgewiesen)", () => {
    expect(
      pruefeNachweisDatei({ ...basis, akzeptierteTypen: ["pdf"] }, pdf),
    ).toBeNull();
  });

  it("… und zwar auch ohne MIME vom Browser — die ENDUNG traegt", () => {
    expect(
      pruefeNachweisDatei(
        { ...basis, akzeptierteTypen: ["pdf"] },
        { name: "a.pdf", groesse: 601, typ: "" },
      ),
    ).toBeNull();
  });

  it("NEGATIV-KONTROLLE: er weist weiterhin ab, was nicht passt", () => {
    expect(
      pruefeNachweisDatei(
        { ...basis, akzeptierteTypen: ["pdf"] },
        { name: "foto.png", groesse: 601, typ: "image/png" },
      )?.grund,
    ).toBe("format");
  });

  it('das accept-Attribut traegt dieselbe Normalform — ein `accept="pdf"` ignorieren Browser', () => {
    expect(
      nachweisAcceptAttribut({ ...basis, akzeptierteTypen: ["pdf", "jpg"] }),
    ).toBe(".pdf,.jpg");
  });

  it("POSITIV-KONTROLLE: die drei GUELTIGEN Formen bleiben unveraendert", () => {
    expect(
      nachweisAcceptAttribut({
        ...basis,
        akzeptierteTypen: ["application/pdf", "image/*", ".jpg"],
      }),
    ).toBe("application/pdf,image/*,.jpg");
    expect(
      pruefeNachweisDatei(
        { ...basis, akzeptierteTypen: ["application/pdf"] },
        pdf,
      ),
    ).toBeNull();
    expect(
      pruefeNachweisDatei({ ...basis, akzeptierteTypen: [".pdf"] }, pdf),
    ).toBeNull();
    expect(
      pruefeNachweisDatei({ ...basis, akzeptierteTypen: ["image/*"] }, pdf)
        ?.grund,
    ).toBe("format");
  });

  it("KEINE STILLE WEITUNG: was kein reiner Endungs-Token ist, bleibt wie es war", () => {
    // `application/pdf` traegt ein `/`, `.pdf` einen Punkt — beide gehen unveraendert durch.
    expect(
      nachweisAcceptAttribut({
        ...basis,
        akzeptierteTypen: ["application/vnd.ms-excel"],
      }),
    ).toBe("application/vnd.ms-excel");
  });
});
