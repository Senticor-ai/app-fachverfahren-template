import { describe, it, expect } from "vitest";
import type { EingabeRegel } from "./eingabe.js";
import {
  istDatum,
  istIban,
  parseBetrag,
  parseDatum,
  parseDezimal,
  parseGanzzahl,
  validiereAlle,
  validiereFeld,
} from "./eingabe.js";

describe("parseBetrag — deutsche Geld-Eingaben in Euro (nicht Cent)", () => {
  it("parst Tausender-Punkt + Dezimalkomma, Leerzeichen-Gruppierung und Währungszeichen/-codes", () => {
    expect(parseBetrag("1.234,56")).toBe(1234.56);
    expect(parseBetrag("1234,5")).toBe(1234.5);
    expect(parseBetrag("26 €")).toBe(26);
    expect(parseBetrag("1 200,00 EUR")).toBe(1200);
    expect(parseBetrag("26")).toBe(26);
    expect(parseBetrag("0,99")).toBe(0.99);
    expect(parseBetrag("-5,50")).toBe(-5.5);
    expect(parseBetrag("1200EUR")).toBe(1200); // Code ohne Leerzeichen
  });

  it("liefert null für ungültige Eingaben", () => {
    expect(parseBetrag("")).toBeNull();
    expect(parseBetrag("abc")).toBeNull();
    expect(parseBetrag("€")).toBeNull();
    expect(parseBetrag("12,34,56")).toBeNull(); // zwei Dezimalkommata
    expect(parseBetrag("1,2,3")).toBeNull();
    expect(parseBetrag(undefined as unknown as string)).toBeNull();
  });
});

describe("parseDezimal / parseGanzzahl — de-DE Zahl-Parsing", () => {
  it("parseDezimal liest Komma-Dezimalzahlen", () => {
    expect(parseDezimal("1.234,56")).toBe(1234.56);
    expect(parseDezimal("3,5")).toBe(3.5);
    expect(parseDezimal(",5")).toBe(0.5);
    expect(parseDezimal("abc")).toBeNull();
  });

  it("parseGanzzahl akzeptiert nur ganze Zahlen (Nachkommastelle ⇒ null)", () => {
    expect(parseGanzzahl("1.000")).toBe(1000);
    expect(parseGanzzahl("42")).toBe(42);
    expect(parseGanzzahl("-7")).toBe(-7);
    expect(parseGanzzahl("3,5")).toBeNull();
    expect(parseGanzzahl("abc")).toBeNull();
  });
});

describe("istIban — Format + Mod-97-Prüfsumme (rein, ohne Netz)", () => {
  it("akzeptiert gültige IBANs (mit/ohne Leerzeichen, klein-/großgeschrieben)", () => {
    expect(istIban("DE89370400440532013000")).toBe(true);
    expect(istIban("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(istIban("de89370400440532013000")).toBe(true);
    expect(istIban("GB82WEST12345698765432")).toBe(true);
  });

  it("lehnt falsche Prüfsumme und falsches Format ab", () => {
    expect(istIban("DE89370400440532013001")).toBe(false); // Prüfsumme kaputt
    expect(istIban("DE00370400440532013000")).toBe(false); // Prüfziffer kaputt
    expect(istIban("DE1")).toBe(false); // zu kurz
    expect(istIban("1234567890")).toBe(false); // kein Ländercode
    expect(istIban("")).toBe(false);
  });
});

describe("parseDatum / istDatum — de-DE TT.MM.JJJJ → ISO", () => {
  it("parst gültige Daten inkl. Schaltjahr", () => {
    expect(parseDatum("24.12.2024")).toBe("2024-12-24");
    expect(parseDatum("1.1.2020")).toBe("2020-01-01");
    expect(parseDatum("29.02.2024")).toBe("2024-02-29"); // Schaltjahr
    expect(istDatum("31.01.2024")).toBe(true);
  });

  it("lehnt kalendarisch unmögliche und falsch formatierte Daten ab", () => {
    expect(parseDatum("29.02.2023")).toBeNull(); // kein Schaltjahr
    expect(parseDatum("31.04.2024")).toBeNull(); // April hat 30 Tage
    expect(parseDatum("32.01.2024")).toBeNull();
    expect(parseDatum("00.01.2024")).toBeNull();
    expect(parseDatum("12.13.2024")).toBeNull(); // Monat 13
    expect(parseDatum("2024-01-01")).toBeNull(); // ISO ist kein de-DE-Format
    expect(istDatum("Quatsch")).toBe(false);
  });
});

describe("validiereFeld — DATEN-getriebene Feldvalidierung pro Regeltyp", () => {
  it("pflicht: leere Eingabe blockiert, optionale leere Eingabe ist gültig", () => {
    expect(validiereFeld({ pflicht: true }, "")).toEqual({
      ok: false,
      fehler: "Pflichtfeld.",
    });
    expect(validiereFeld({ pflicht: true }, "   ")).toEqual({
      ok: false,
      fehler: "Pflichtfeld.",
    });
    expect(validiereFeld({}, "")).toEqual({ ok: true });
    expect(validiereFeld({ pflicht: true }, "vorhanden")).toEqual({ ok: true });
  });

  it("betrag: ungültiger Betrag + Bereichsgrenzen", () => {
    const regel: EingabeRegel = { typ: "betrag", min: 1, max: 100 };
    expect(validiereFeld(regel, "abc")).toEqual({
      ok: false,
      fehler: "Bitte einen gültigen Betrag eingeben.",
    });
    expect(validiereFeld(regel, "0,50")).toEqual({
      ok: false,
      fehler: "Mindestens 1.",
    });
    expect(validiereFeld(regel, "101")).toEqual({
      ok: false,
      fehler: "Höchstens 100.",
    });
    expect(validiereFeld(regel, "26 €")).toEqual({ ok: true });
  });

  it("zahl: nur Zahlen zulässig", () => {
    expect(validiereFeld({ typ: "zahl" }, "12,5")).toEqual({ ok: true });
    expect(validiereFeld({ typ: "zahl" }, "xy")).toEqual({
      ok: false,
      fehler: "Bitte eine gültige Zahl eingeben.",
    });
  });

  it("iban: prüft Format + Prüfsumme", () => {
    expect(validiereFeld({ typ: "iban" }, "DE89370400440532013000")).toEqual({
      ok: true,
    });
    expect(validiereFeld({ typ: "iban" }, "DE89370400440532013001")).toEqual({
      ok: false,
      fehler: "Bitte eine gültige IBAN eingeben.",
    });
  });

  it("datum: prüft de-DE-Datum", () => {
    expect(validiereFeld({ typ: "datum" }, "24.12.2024")).toEqual({ ok: true });
    expect(validiereFeld({ typ: "datum" }, "31.02.2024")).toEqual({
      ok: false,
      fehler: "Bitte ein gültiges Datum im Format TT.MM.JJJJ eingeben.",
    });
  });

  it("text: Zeichenlänge + Format-Muster", () => {
    expect(validiereFeld({ minLaenge: 3 }, "ab")).toEqual({
      ok: false,
      fehler: "Bitte mindestens 3 Zeichen eingeben.",
    });
    expect(validiereFeld({ maxLaenge: 2 }, "abc")).toEqual({
      ok: false,
      fehler: "Bitte höchstens 2 Zeichen eingeben.",
    });
    expect(validiereFeld({ muster: "^\\d{5}$" }, "12A45")).toEqual({
      ok: false,
      fehler: "Eingabe entspricht nicht dem erwarteten Format.",
    });
    expect(validiereFeld({ muster: "^\\d{5}$" }, "12345")).toEqual({ ok: true });
  });

  it("defektes Muster blockiert nicht (fail-open)", () => {
    expect(validiereFeld({ muster: "(" }, "irgendwas")).toEqual({ ok: true });
  });

  it("eigeneMeldung überschreibt die generische Meldung", () => {
    expect(
      validiereFeld(
        { typ: "iban", eigeneMeldung: "Bitte Ihre Bankverbindung angeben." },
        "ungültig",
      ),
    ).toEqual({ ok: false, fehler: "Bitte Ihre Bankverbindung angeben." });
  });
});

describe("validiereAlle — Fehler-Abbildung für eine Fehlerzusammenfassung", () => {
  it("liefert nur die fehlerhaften Felder (leer, wenn alles gültig)", () => {
    const regeln: Record<string, EingabeRegel> = {
      betrag: { typ: "betrag", pflicht: true },
      iban: { typ: "iban" },
      name: { pflicht: true, minLaenge: 2 },
    };
    expect(
      validiereAlle(regeln, { betrag: "26", iban: "DE89370400440532013000", name: "Ab" }),
    ).toEqual({});
    expect(validiereAlle(regeln, { betrag: "", iban: "falsch", name: "A" })).toEqual({
      betrag: "Pflichtfeld.",
      iban: "Bitte eine gültige IBAN eingeben.",
      name: "Bitte mindestens 2 Zeichen eingeben.",
    });
  });
});
