// tenor-nachrechnung — der Beweis, dass die Behörde ihren eigenen Betrag rechnet, ohne heutige Verfahren zu brechen.
//
// Die Gegenprobe wiegt hier schwer: eine zu scharfe Nachrechnung sperrt jeden Bescheid in jedem Verfahren, das
// gar keinen Tarif deklariert — und das sind alle bestehenden. Muster A gilt streng: ohne Konfiguration und
// ohne Tarif ist das Verhalten unverändert.
import { describe, expect, it } from "vitest";
import {
  pruefeTenor,
  tarifDesVerfahrens,
  type TenorNachrechnungConfig,
} from "./tenor-nachrechnung.js";
import type { TarifTabelle } from "./tarif.js";

const TARIF: TarifTabelle = {
  positionen: [
    { kategorie: "standard", betragCent: 5000 },
    { kategorie: "express", betragCent: 9000 },
  ],
  defaultCent: 0,
};

const CFG: TenorNachrechnungConfig = {
  diskriminator: "anliegen.kategorie",
  betragPfad: "berechnung.betrag",
};

const verfahren = (...tarife: (TarifTabelle | undefined)[]) => ({
  allowedTransitions: tarife.map((t) =>
    t ? { stelltForderung: { tarif: t } } : {},
  ),
});

describe("tarifDesVerfahrens — der eine Tarif, aus dem Verfahren gelesen", () => {
  it("kein Übergang mit Tarif ⇒ keine Quelle (und damit keine Nachrechnung)", () => {
    expect(tarifDesVerfahrens(verfahren(undefined, undefined)).art).toBe(
      "keine",
    );
  });

  it("genau ein Tarif ⇒ eindeutig", () => {
    const q = tarifDesVerfahrens(verfahren(undefined, TARIF));
    expect(q.art).toBe("eindeutig");
    expect(q.art === "eindeutig" && q.tarif).toBe(TARIF);
  });

  it("mehrfach DERSELBE Tarif ist nicht mehrdeutig — nur unschön geschrieben", () => {
    const kopie: TarifTabelle = {
      positionen: [...TARIF.positionen].reverse(),
      defaultCent: 0,
    };
    expect(tarifDesVerfahrens(verfahren(TARIF, kopie)).art).toBe("eindeutig");
  });

  it("inhaltlich VERSCHIEDENE Tarife ⇒ mehrdeutig (es wird nicht geraten)", () => {
    const anders: TarifTabelle = {
      positionen: [{ kategorie: "standard", betragCent: 7000 }],
    };
    const q = tarifDesVerfahrens(verfahren(TARIF, anders));
    expect(q.art).toBe("mehrdeutig");
  });
});

describe("pruefeTenor — Muster A: ohne Deklaration bleibt alles wie heute", () => {
  it("keine Konfiguration ⇒ nicht nachgerechnet, Erlass unverändert erlaubt", () => {
    const u = pruefeTenor(undefined, tarifDesVerfahrens(verfahren(TARIF)), {
      kategorie: "standard",
      clientBetrag: 50,
    });
    expect(u.nachgerechnet).toBe(false);
    expect(u.ok).toBe(true);
  });

  it("konfiguriert, aber kein Tarif im Verfahren ⇒ nicht nachgerechnet, Erlass erlaubt", () => {
    const u = pruefeTenor(CFG, tarifDesVerfahrens(verfahren()), {
      kategorie: "standard",
      clientBetrag: 50,
    });
    expect(u.nachgerechnet).toBe(false);
    expect(u.ok).toBe(true);
    expect(u.grund).toMatch(/kein Tarif/);
  });
});

describe("pruefeTenor — wo nachgerechnet wird, gilt fail-closed", () => {
  const quelle = tarifDesVerfahrens(verfahren(TARIF));

  it("Übereinstimmung ⇒ erlaubt, mit server-autoritativem Betrag", () => {
    const u = pruefeTenor(CFG, quelle, {
      kategorie: "standard",
      clientBetrag: 50,
    });
    expect(u.nachgerechnet).toBe(true);
    expect(u.ok).toBe(true);
    expect(u.betragCent).toBe(5000);
    expect(u.divergenz).toBe(0);
  });

  it("Divergenz ⇒ KEIN Erlass, und der Grund nennt beide Zahlen", () => {
    const u = pruefeTenor(CFG, quelle, {
      kategorie: "standard",
      clientBetrag: 55,
    });
    expect(u.ok).toBe(false);
    expect(u.divergenz).toBe(500);
    expect(u.grund).toMatch(/5500/);
    expect(u.grund).toMatch(/5000/);
  });

  it("Divergenz wird NICHT still überschrieben — der Befund gehört einem Menschen", () => {
    const u = pruefeTenor(CFG, quelle, {
      kategorie: "standard",
      clientBetrag: 55,
    });
    expect(u.grund).toMatch(/nicht still zu überschreiben/);
  });

  it("unbekannte Kategorie ⇒ KEIN Erlass (der Auffangwert ist keine Rechtsgrundlage)", () => {
    const u = pruefeTenor(CFG, quelle, {
      kategorie: "gibt-es-nicht",
      clientBetrag: 0,
    });
    expect(u.ok).toBe(false);
    expect(u.kategorieBekannt).toBe(false);
    expect(u.grund).toMatch(/keine Festsetzung/);
  });

  it("DIE ZWEI NULLEN: fehlender client-Betrag ist keine Übereinstimmung", () => {
    for (const fehlt of [undefined, null, "50", Number.NaN]) {
      const u = pruefeTenor(CFG, quelle, {
        kategorie: "standard",
        clientBetrag: fehlt,
      });
      expect(u.ok, `clientBetrag=${String(fehlt)}`).toBe(false);
      expect(u.divergenz).toBeNull();
      expect(u.grund).toMatch(/keine Übereinstimmung/);
    }
  });

  it("mehrdeutige Tarife ⇒ KEIN Erlass, statt einen Satz zu raten", () => {
    const anders: TarifTabelle = {
      positionen: [{ kategorie: "standard", betragCent: 7000 }],
    };
    const u = pruefeTenor(CFG, tarifDesVerfahrens(verfahren(TARIF, anders)), {
      kategorie: "standard",
      clientBetrag: 50,
    });
    expect(u.ok).toBe(false);
    expect(u.grund).toMatch(/erfundene Rechtsgrundlage/);
  });

  it("Rundung: 50,5 EUR ⇒ 5050 Cent, nicht 5050,000000000001", () => {
    const halb: TarifTabelle = {
      positionen: [{ kategorie: "standard", betragCent: 5050 }],
    };
    const u = pruefeTenor(CFG, tarifDesVerfahrens(verfahren(halb)), {
      kategorie: "standard",
      clientBetrag: 50.5,
    });
    expect(u.ok).toBe(true);
    expect(u.clientCent).toBe(5050);
  });

  it("der Faktor ist DATEN — ein Verfahren, das schon in Cent rechnet, setzt ihn auf 1", () => {
    const u = pruefeTenor({ ...CFG, centJeEinheit: 1 }, quelle, {
      kategorie: "standard",
      clientBetrag: 5000,
    });
    expect(u.ok).toBe(true);
    expect(u.clientCent).toBe(5000);
  });

  it("DETERMINISMUS", () => {
    const a = pruefeTenor(CFG, quelle, {
      kategorie: "express",
      clientBetrag: 90,
    });
    const b = pruefeTenor(CFG, quelle, {
      kategorie: "express",
      clientBetrag: 90,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
