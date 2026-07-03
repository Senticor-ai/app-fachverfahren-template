import { describe, it, expect } from "vitest";
import type { KiAngebot, KiSteuerung } from "./ki-steuerung.js";
import {
  defaultKiSteuerung,
  effektiveSchwelle,
  featureAngeboten,
  istFeatureAktiv,
} from "./ki-steuerung.js";

// Verfahrensfreies Beispiel-ANGEBOT: assist mit Obergrenze 0,9 + chat + voice. Werte sind generisch (keine Domäne).
const angebotVoll: KiAngebot = {
  schwelleAutonom: 0.8,
  assist: { zweck: "Vollständigkeitsprüfung", maxSchwelleAutonom: 0.9 },
  chat: { zweck: "Auskunft" },
  voice: {},
};

describe("defaultKiSteuerung", () => {
  it("hält humanOversight als LITERAL true (im Typ unabschaltbar)", () => {
    const s = defaultKiSteuerung();
    expect(s.humanOversight).toBe(true);
    // @ts-expect-error — humanOversight ist das Literal `true`; `false` ist typwidrig und muss zur Compile-Zeit brechen.
    const _typwidrig: KiSteuerung = { ...s, humanOversight: false };
    void _typwidrig;
  });

  it("startet mit aktivem Hauptschalter, Standard-Transparenz und OHNE eigene Schwelle", () => {
    const s = defaultKiSteuerung();
    expect(s.aktiv).toBe(true);
    expect(s.transparenzLevel).toBe("standard");
    expect(s.schwelleAutonom).toBeUndefined();
  });

  it("hat Spracheingabe (Mikrofon) als bewusste Opt-in-Ausnahme aus", () => {
    expect(defaultKiSteuerung().features.voice).toBe(false);
  });
});

describe("featureAngeboten — reine Angebots-Frage", () => {
  it("liest assist/chat/voice aus der Config", () => {
    expect(featureAngeboten("assist", angebotVoll)).toBe(true);
    expect(featureAngeboten("chat", angebotVoll)).toBe(true);
    expect(featureAngeboten("voice", angebotVoll)).toBe(true);
    expect(featureAngeboten("assist", { schwelleAutonom: 0.8 })).toBe(false);
    expect(featureAngeboten("chat", undefined)).toBe(false);
  });

  it("bezieht extraktion NICHT aus der Config, sondern aus dem boolean-Flag", () => {
    expect(featureAngeboten("extraktion", angebotVoll, true)).toBe(true);
    expect(featureAngeboten("extraktion", angebotVoll, false)).toBe(false);
    expect(featureAngeboten("extraktion", angebotVoll)).toBe(false);
  });
});

describe("istFeatureAktiv — Angebot ∧ Hauptschalter ∧ Feature", () => {
  it("ist true nur, wenn alle drei Bedingungen erfüllt sind", () => {
    expect(istFeatureAktiv(defaultKiSteuerung(), "assist", angebotVoll)).toBe(
      true,
    );
  });

  it("ist false, wenn die Config das Feature NICHT anbietet", () => {
    const s = defaultKiSteuerung();
    expect(istFeatureAktiv(s, "assist", { schwelleAutonom: 0.8 })).toBe(false);
    expect(istFeatureAktiv(s, "assist", undefined)).toBe(false);
  });

  it("ist false, wenn der Hauptschalter aus ist (auch wenn angeboten + Feature an)", () => {
    const s: KiSteuerung = { ...defaultKiSteuerung(), aktiv: false };
    expect(istFeatureAktiv(s, "assist", angebotVoll)).toBe(false);
  });

  it("ist false, wenn das einzelne Feature aus ist", () => {
    const basis = defaultKiSteuerung();
    const s: KiSteuerung = {
      ...basis,
      features: { ...basis.features, assist: false },
    };
    expect(istFeatureAktiv(s, "assist", angebotVoll)).toBe(false);
  });

  it("gated extraktion über das boolean-Flag (statt über die Config)", () => {
    const s = defaultKiSteuerung();
    expect(istFeatureAktiv(s, "extraktion", angebotVoll, true)).toBe(true);
    expect(istFeatureAktiv(s, "extraktion", angebotVoll, false)).toBe(false);
  });
});

describe("effektiveSchwelle — der Mensch stellt nur STRENGER", () => {
  it("ist das Maximum aus Config-Obergrenze und menschlicher Schwelle", () => {
    const strenger: KiSteuerung = {
      ...defaultKiSteuerung(),
      schwelleAutonom: 0.95,
    };
    expect(effektiveSchwelle(strenger, angebotVoll)).toBe(0.95);
  });

  it("hält die Config-Obergrenze, wenn der Mensch lockerer stellen will", () => {
    const lockerer: KiSteuerung = {
      ...defaultKiSteuerung(),
      schwelleAutonom: 0.5,
    };
    // Menschlich 0,5 < Config 0,9 ⇒ das Maximum hält 0,9 (kein Lockern möglich).
    expect(effektiveSchwelle(lockerer, angebotVoll)).toBe(0.9);
  });

  it("nutzt allein die Config-Obergrenze, wenn der Mensch keine eigene Schwelle setzt", () => {
    expect(effektiveSchwelle(defaultKiSteuerung(), angebotVoll)).toBe(0.9);
  });

  it("liest die Obergrenze aus assist.maxSchwelleAutonom (nicht aus config.schwelleAutonom)", () => {
    // Config trägt schwelleAutonom 0,8, aber KEIN assist ⇒ Obergrenze 0 ⇒ effektiv 0.
    expect(
      effektiveSchwelle(defaultKiSteuerung(), { schwelleAutonom: 0.8 }),
    ).toBe(0);
  });

  it("fällt auf 0 zurück, wenn weder Config noch Mensch etwas setzen", () => {
    expect(effektiveSchwelle(defaultKiSteuerung(), undefined)).toBe(0);
  });
});
