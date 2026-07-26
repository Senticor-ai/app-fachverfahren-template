// composable-lieferung — der Beweis, dass „Was lieferst du?" bis in die KIT-Projektion durchkommt.
//
// GEMESSEN (32 reale Mesh-Manifeste): ein Composable deklarierte Faehigkeiten, Befugnis und Wissensbindung —
// und nirgends, was bei ihm herauskommt. CHOS leitet das jetzt ab (Zustandsmaschine x rollen bzw.
// RACI x produces). Dieser Test haelt fest, dass der Adapter es DURCHREICHT statt es zu verlieren.
//
// Das ist keine theoretische Sorge: `befugnis` fiel genau hier schon einmal in die Index-Signatur und war dem
// KIT dadurch unbekannt — der Kommentar am Typ dokumentiert es. Ein durchgereichtes Feld ohne Test ist das
// naechste verwaiste Feld.
import { describe, expect, it } from "vitest";
import { mapManifestToComposable } from "./composable-manifest.js";
import type { MeshComposableManifest } from "./composable-cert-verify.js";

const basis = (): MeshComposableManifest => ({
  schemaVersion: 1,
  domain: "grundsteuer",
  id: "sachbearbeitung",
  titel: "Sachbearbeitung / Fachdienst",
  art: "flaeche",
  akteur: "beide",
  faehigkeiten: { ki: ["subsumtion", "bescheid-entwurf"] },
  wissen: ["recht:grstg"],
});

describe("Composable-Lieferung", () => {
  it("reicht die fachlichen LEISTUNGEN durch — inklusive der Rechtsfolge-Marker", () => {
    const c = mapManifestToComposable({
      ...basis(),
      leistungen: [
        { schritt: "Bescheid erlassen", ergebnis: "bescheid_erlassen", vierAugen: true, begruendungsPflicht: true, erlaesstBescheid: true },
        { schritt: "Identität prüfen", ergebnis: "identitaet_geprueft", vierAugen: false, begruendungsPflicht: false, erlaesstBescheid: false },
      ],
    });
    expect(c.leistungen).toHaveLength(2);
    // Die drei Marker sind Rechtsfolgen, keine Nuancen — ginge einer verloren, waere die Stelle falsch beschrieben.
    expect(c.leistungen?.[0]).toMatchObject({ vierAugen: true, begruendungsPflicht: true, erlaesstBescheid: true });
    expect(c.leistungen?.[1]?.erlaesstBescheid).toBe(false);
  });

  it("reicht die ARTEFAKTE durch und behaelt die Trennung Datei / Ergebnis-Ziel", () => {
    const c = mapManifestToComposable({
      ...basis(),
      artefakte: [
        { ziel: "EPIC.md", phase: "epic-prd", art: "datei" },
        { ziel: "korpus-bindung", phase: "kontext", art: "ergebnis" },
      ],
    });
    expect(c.artefakte?.map((a) => a.art)).toEqual(["datei", "ergebnis"]);
  });

  it("laesst die Felder WEG, wenn die Stelle nichts entscheidet — eine Aussage, keine leere Huelle", () => {
    const c = mapManifestToComposable(basis());
    expect(c.leistungen).toBeUndefined();
    expect(c.artefakte).toBeUndefined();
  });

  it("behandelt eine leere Liste wie keine — sonst behauptete die Huelle eine Lieferung", () => {
    const c = mapManifestToComposable({ ...basis(), leistungen: [], artefakte: [] });
    expect(c.leistungen).toBeUndefined();
    expect(c.artefakte).toBeUndefined();
  });

  it("aendert nichts am uebrigen Mount-Verhalten (Spine aus faehigkeiten.ki bleibt)", () => {
    const c = mapManifestToComposable({ ...basis(), leistungen: [{ schritt: "x", ergebnis: "y", vierAugen: false, begruendungsPflicht: false, erlaesstBescheid: false }] });
    expect(c.spine?.skills).toEqual(["subsumtion", "bescheid-entwurf"]);
    expect(c.spine?.knowledgeDomains).toContain("recht:grstg");
  });
});
