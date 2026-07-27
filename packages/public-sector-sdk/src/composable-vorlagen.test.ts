// composable-vorlagen — der Beweis, dass eine Vorlage NIEMALS Platzhalter ausliefert.
//
// Am 2026-07-27 galten drei von fünf Verfahren als „grün“, weil sie die Demo-Vorlage mit Platzhalter-Werten
// trugen — die Gates maßen die Gesundheit der VORLAGE. Eine Vorlage, die halb gefüllte Manifeste ausliefert,
// erzeugt genau diese Klasse. Deshalb ist das die erste und wichtigste Zusicherung hier.
import { describe, expect, it } from "vitest";
import { ARCHETYPEN, ausVorlage, archetypBruch } from "./composable-vorlagen.js";
import { mapManifestToComposable } from "./composable-manifest.js";

const voll = {
  titel: "Sachbearbeitung / Fachdienst",
  domain: "grundsteuer",
  aufgabenbereich: "Prüft den Sachverhalt rechtlich und verantwortet die Festsetzung samt Begründung.",
  faehigkeiten: ["subsumtion", "bescheid-entwurf"],
  wissen: ["recht:grstg"],
};

describe("Composable-Vorlagen", () => {
  it("liefert ENTWEDER ein vollständiges Manifest ODER die Fehl-Liste — nie Platzhalter", () => {
    const leer = ausVorlage("bearbeitung", { titel: "", domain: "", aufgabenbereich: "" });
    expect(leer.manifest).toBeUndefined();
    expect(leer.fehlend).toHaveLength(3);
    expect(leer.meldung).toMatch(/KEIN Manifest mit Platzhaltern/);
  });

  it("leitet aus dem Archetyp die RECHTSFOLGEN ab, nicht die Fachlichkeit", () => {
    const r = ausVorlage("bearbeitung", voll);
    expect(r.fehlend).toHaveLength(0);
    // Aus dem Archetyp — nicht verhandelbar:
    expect(r.manifest?.befugnis).toMatchObject({ entscheidung: "erlaesst-va", hitlPflicht: true });
    expect(r.manifest?.faehigkeiten?.autonomie).toBe("AAL-2");
    // Aus dem Verfahren:
    expect(r.manifest?.titel).toBe("Sachbearbeitung / Fachdienst");
    expect(r.manifest?.faehigkeiten?.ki).toEqual(["subsumtion", "bescheid-entwurf"]);
  });

  it("der INITIATOR entscheidet nichts — eine leere Entscheidungs-Befugnis ist die richtige Antwort", () => {
    const r = ausVorlage("initiator", { ...voll, titel: "Bürger:in" });
    expect(r.manifest?.befugnis).toMatchObject({ entscheidung: "keine", hitlPflicht: false });
  });

  it("ohne KI-Fähigkeiten wird KEINE Autonomie behauptet (rein deterministische Stelle)", () => {
    const r = ausVorlage("aufsicht", { ...voll, titel: "Aufsicht", faehigkeiten: [] });
    expect(r.manifest?.faehigkeiten).toBeUndefined();
  });

  it("das abgeleitete Manifest ist im KIT montierbar — die Vorlage erzeugt nichts Unbrauchbares", () => {
    const r = ausVorlage("bearbeitung", voll);
    const c = mapManifestToComposable(r.manifest!);
    expect(c.id).toBe("sachbearbeitung");
    expect(c.spine?.skills).toEqual(["subsumtion", "bescheid-entwurf"]);
    // Rechtsnah ⇒ die Autonomie bleibt bei „Advise“, auch wenn jemand mehr deklarierte.
    expect(c.spine?.autonomy).toBe("AAL-2");
  });

  it("findet den häufigsten Schnitt-Fehler: eine Stelle entscheidet, obwohl ihr Archetyp das ausschließt", () => {
    const r = ausVorlage("initiator", { ...voll, titel: "Bürger:in" });
    const manipuliert = { ...r.manifest!, befugnis: { entscheidung: "erlaesst-va", hitlPflicht: false } } as never;
    const brueche = archetypBruch(manipuliert, "initiator");
    expect(brueche).toHaveLength(1);
    expect(brueche[0]).toMatch(/ist kein initiator mehr/);
  });

  it("meldet die fehlende HITL-Pflicht bei einer rechtsnahen Stelle", () => {
    const r = ausVorlage("bearbeitung", voll);
    const ohne = { ...r.manifest!, befugnis: { entscheidung: "erlaesst-va", hitlPflicht: false } } as never;
    expect(archetypBruch(ohne, "bearbeitung").join(" ")).toMatch(/HITL-Pflicht fehlt/);
  });

  it("ein sauber abgeleitetes Manifest hat KEINEN Archetyp-Bruch", () => {
    for (const a of ["initiator", "bearbeitung", "aufsicht"] as const) {
      const r = ausVorlage(a, { ...voll, titel: `Stelle ${a}` });
      expect(archetypBruch(r.manifest!, a)).toEqual([]);
    }
  });

  it("jeder Archetyp begründet SICH SELBST — wer ihn wählt, liest warum", () => {
    for (const p of Object.values(ARCHETYPEN)) expect(p.warum.length).toBeGreaterThan(60);
  });
});
