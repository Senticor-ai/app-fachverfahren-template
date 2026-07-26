// rechtsbehelf-text.test — RECHTSFOLGEN-Tests des EINEN Belehrungssatz-Bauers (Phase 5, W1).
//
// Getestet wird nicht „das Feld existiert", sondern die RECHTSFOLGE: nennt der Satz die richtige Behörde samt
// SITZ, FRIST und FORM? Ist er auf beiden Flächen derselbe? Und die GEGENPROBE zu jeder Zusicherung: ohne den
// Fix MUSS der Test fallen (die Alt-Fassungen sind als Fixtures nachgebaut und werden als unzureichend belegt).
import { describe, expect, it } from "vitest";

import {
  fehlendeBelehrungsSlots,
  formatRechtsbehelfsbelehrung,
  rechtsbehelfName,
  rechtsbehelfVerb,
} from "./rechtsbehelf-text.js";
import type { RechtsbehelfConfig } from "./domain-kernel.js";

/** AO-Schiene, vollständig — so, wie ein Steuerbescheid belehren MUSS. */
const einspruchAO: RechtsbehelfConfig = {
  art: "einspruch",
  fristWert: 1,
  fristEinheit: "monat",
  stelle: "der Stadt Musterstadt — Steueramt",
  sitz: "Rathausplatz 1, 12345 Musterstadt",
  form: "schriftlich, elektronisch oder zur Niederschrift",
  norm: "§ 355 Abs. 1 AO",
};
const fiktionAO = { fiktionTage: 4, fiktionNorm: "§ 122 Abs. 2 AO" };

describe("formatRechtsbehelfsbelehrung — die Belehrung nennt Behörde, Sitz, Frist und Form", () => {
  it("nennt ALLE gesetzlichen Pflichtangaben (§ 356 Abs. 1, § 357 Abs. 1 AO)", () => {
    const satz = formatRechtsbehelfsbelehrung(einspruchAO, fiktionAO);
    expect(satz).toContain("Einspruch"); // ART, groß geschrieben
    expect(satz).toContain("der Stadt Musterstadt — Steueramt"); // BEHÖRDE
    expect(satz).toContain("Rathausplatz 1, 12345 Musterstadt"); // SITZ — § 356 Abs. 1 AO
    expect(satz).toContain("einem Monat"); // FRIST
    expect(satz).toContain("schriftlich, elektronisch oder zur Niederschrift"); // FORM — § 357 Abs. 1 AO
    expect(satz).toContain("§ 355 Abs. 1 AO"); // NORM
    expect(satz).toContain("§ 122 Abs. 2 AO"); // FIKTIONSNORM der EIGENEN Schiene
  });

  it("GEGENPROBE — der ALTE Satzbau (ohne Sitz/Form) erfüllt die Pflichtangaben NICHT", () => {
    // Der Text, den Web und PDF vor Phase 5 erzeugten (nachgebaut, nicht importiert):
    const alt =
      `Gegen diesen Bescheid kann innerhalb von einem Monat nach Bekanntgabe ${einspruchAO.art} ` +
      `bei ${einspruchAO.stelle} erhoben werden (${einspruchAO.norm}).`;
    expect(alt).not.toContain(einspruchAO.sitz!); // kein Sitz ⇒ § 356 Abs. 2 AO: Frist EIN JAHR
    expect(alt).not.toContain(einspruchAO.form!); // keine Form ⇒ dieselbe Rechtsfolge
    expect(alt).toContain("einspruch"); // kleingeschriebenes Enum-Token — der PDF-Defekt
    expect(alt).toContain("erhoben"); // falsches Verb für den Einspruch
    // Der NEUE Satz behebt genau diese vier Mängel:
    const neu = formatRechtsbehelfsbelehrung(einspruchAO, fiktionAO);
    expect(neu).toContain(einspruchAO.sitz!);
    expect(neu).toContain(einspruchAO.form!);
    expect(neu).not.toMatch(/nach Bekanntgabe einspruch\b/); // nie das rohe Token
    expect(neu).toContain("Einspruch eingelegt"); // grammatisch korrektes Verb je Regime
  });

  it("regime-neutral: Widerspruch/Klage bekommen ihr eigenes Verb und ihre eigene Norm", () => {
    expect(rechtsbehelfName("widerspruch")).toBe("Widerspruch");
    expect(rechtsbehelfVerb("widerspruch")).toBe("erhoben");
    expect(rechtsbehelfVerb("einspruch")).toBe("eingelegt");
    const klage = formatRechtsbehelfsbelehrung(
      {
        art: "klage",
        fristWert: 1,
        fristEinheit: "monat",
        stelle: "dem Verwaltungsgericht Musterstadt",
        sitz: "Gerichtsstraße 1, 12345 Musterstadt",
        form: "schriftlich oder zur Niederschrift",
        norm: "§ 74 Abs. 1 VwGO",
      },
      { fiktionTage: 4, fiktionNorm: "§ 41 Abs. 2 VwVfG" },
    );
    expect(klage).toContain("Klage erhoben");
    expect(klage).toContain("§ 41 Abs. 2 VwVfG");
  });

  it("FAIL-CLOSED: ein unvollständiges Regime erzeugt KEINEN Text, sondern wirft", () => {
    const { sitz: _sitz, ...ohneSitz } = einspruchAO;
    expect(fehlendeBelehrungsSlots(ohneSitz)).toContain("sitz");
    expect(() => formatRechtsbehelfsbelehrung(ohneSitz, fiktionAO)).toThrow(
      /unvollständig/,
    );
    // Kein Regime überhaupt → alle Slots fehlen (der Server verweigert dann den Erlass).
    expect(fehlendeBelehrungsSlots(undefined)).toEqual([
      "art",
      "stelle",
      "sitz",
      "frist",
      "form",
      "norm",
    ]);
  });

  it("ÜBERBLOCKUNG: ein vollständiges Regime meldet KEINEN fehlenden Slot (legitimer Fall bleibt grün)", () => {
    expect(fehlendeBelehrungsSlots(einspruchAO)).toEqual([]);
  });

  it("EINE WAHRHEIT: derselbe Eingang liefert byte-identischen Text (Web = PDF = Vorschau)", () => {
    const a = formatRechtsbehelfsbelehrung(einspruchAO, fiktionAO);
    const b = formatRechtsbehelfsbelehrung(
      { ...einspruchAO },
      { ...fiktionAO },
    );
    expect(a).toBe(b);
  });
});
