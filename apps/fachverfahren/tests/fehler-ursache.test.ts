// fehler-ursache — der Zeuge. Er misst die eine Sache, die eine Fehlergrenze falsch machen kann, ohne
// dabei kaputt auszusehen: SIE ZEIGT AUF DIE FALSCHE DATEI.
//
// Der gemessene Fall (2026-09-13, drei ausgelieferte Verfahren): über «Rendered more hooks than during the
// previous render» stand «… häufig, weil die generierte leistung.config.ts nicht zum Kit-Vertrag passt».
// Beides war wahr für sich — der Wurf war echt, und der Satz beschrieb eine echte Fehlerklasse. Nur gehörten
// sie nicht zueinander. Wer dem Satz folgte, las eine unschuldige Datei.
import { describe, expect, it } from "vitest";
import { fehlerErklaerung, fehlerKlasse } from "../src/app/fehler-ursache.js";

describe("fehler-ursache — welcher Satz über welchem Wurf steht", () => {
  it("DER LEBENDE WURF: die React-Aufrufregel zeigt auf die VORLAGE, nicht auf leistung.config.ts", () => {
    const echt = "Rendered more hooks than during the previous render.";
    expect(fehlerKlasse(echt)).toBe("react-aufrufregel");
    const satz = fehlerErklaerung(echt);
    expect(satz).toContain("VORLAGE");
    expect(satz).toContain("Vorlagen-Abgleich");
    // ⛔ DER KERN: die unschuldige Datei darf hier NICHT stehen.
    expect(satz).not.toContain("leistung.config.ts");
  });

  it("GEGENPROBE: ein gewöhnlicher Wurf behält den bezahlten Vertrags-Satz", () => {
    const andere = "Cannot read properties of undefined (reading 'steps')";
    expect(fehlerKlasse(andere)).toBe("vertrag");
    const satz = fehlerErklaerung(andere);
    expect(satz).toContain("leistung.config.ts");
    expect(satz).not.toContain("Vorlagen-Abgleich");
  });

  it("die Erkennung hängt nicht an EINER Formulierung von React", () => {
    // React formuliert je nach Version anders. Ein Vergleich auf den genauen Satz fiele beim nächsten
    // Versionssprung still in den Vertrags-Satz zurück — und niemand würde es merken.
    for (const m of [
      "Rendered fewer hooks than expected. This may be caused by an accidental early return statement.",
      "Invalid hook call. Hooks can only be called inside of the body of a function component.",
      "React has detected a change in the order of Hooks called by LandingPage.",
    ])
      expect(fehlerKlasse(m)).toBe("react-aufrufregel");
  });

  it("ohne lesbare Meldung wird NICHTS geraten — der bisherige Satz gilt", () => {
    for (const m of [undefined, null, "", 0, {}])
      expect(fehlerKlasse(m)).toBe("vertrag");
  });

  it("TAUTOLOGIE-SPERRE: die zwei Sätze sind wirklich verschieden", () => {
    expect(fehlerErklaerung("Rendered more hooks")).not.toBe(
      fehlerErklaerung("irgendein anderer Fehler"),
    );
  });
});
