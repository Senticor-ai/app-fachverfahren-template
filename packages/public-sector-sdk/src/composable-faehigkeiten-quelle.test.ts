// S6 — DIE STRUKTURIERTE FAEHIGKEITS-SEITE KOMMT AUS DER VERSIEGELTEN QUELLE, ODER SIE KOMMT NICHT.
//
// Ein Composable besteht immer aus strukturierten UND unstrukturierten Faehigkeiten. Die Wissensseite lag hier
// schon (`spine.skills`); die strukturierte fehlte — ein rechnendes Composable konnte nicht sagen, WOMIT es
// rechnet, und ein rein deterministisches galt als „ohne Faehigkeiten".
//
// DIE EIGENTLICHE FRAGE IST NICHT, OB SIE ANKOMMT, SONDERN WOHER.
// Der Manifest-Block `faehigkeiten` ist hand-editierbar, ohne dass irgendein Siegel bricht — genau das Loch,
// das die versiegelte Governance-Projektion geschlossen hat (CHOS S2, „Falscher Traeger"). Also gilt:
//   * Projektion vorhanden UND Siegel nachgerechnet intakt ⇒ SIE ist die Quelle.
//   * Projektion vorhanden, Siegel gebrochen oder ungeprueft ⇒ die Seite bleibt LEER. Ungeprueft ist keine
//     Quelle; ein Rueckfall auf den unversiegelten Manifest-Block waere der Green-Wash-Umweg um das Siegel.
//   * GAR KEINE Projektion (Alt-Bestand) ⇒ der Manifest-Block traegt — dieselbe Quelle, aus der derselbe
//     Mapper auch `ki`, `befugnis` und `leistungen` liest. Nicht mehr Vertrauen, aber auch nicht weniger.
import { describe, expect, it } from "vitest";
import { mapManifestToComposable } from "./composable-manifest.js";
import type { MeshComposableManifest } from "./composable-cert-verify.js";

const TARIF = {
  id: "steuer-tarif",
  ergebnis: "der festgesetzte Betrag",
  klasse: "tarif",
  programm: "tarif:staffel",
  grundlagen: ["§ 3 Satzung"],
};

/** Ein mountbares Manifest — minimal, generisch, ohne Domaenen-Annahme. */
function manifest(over: Partial<MeshComposableManifest> = {}): MeshComposableManifest {
  return {
    schemaVersion: 1,
    domain: "musterverfahren",
    id: "sachbearbeitung",
    titel: "Sachbearbeitung",
    art: "flaeche",
    faehigkeiten: { ki: ["unterlagen-lesen"], autonomie: "AAL-2" },
    ...over,
  } as MeshComposableManifest;
}

/** Ein nachgerechnetes Projektions-Verdikt, wie es der Mount-Pfad bildet. */
const verdikt = (intakt: boolean, strukturiert: unknown[] = [TARIF], benutzt: unknown[] = []) => ({
  vorhanden: true,
  intakt,
  projektion: { faehigkeiten: { strukturiert, benutzt } } as never,
});

describe("S6 · die Quelle der strukturierten Faehigkeits-Seite", () => {
  it("PARITAET: ein Manifest ohne beide Felder traegt sie auch nicht — Absenz bleibt Absenz", () => {
    const c = mapManifestToComposable(manifest());
    expect(c.strukturiert).toBeUndefined();
    expect(c.benutzt).toBeUndefined();
  });

  it("Projektion vorhanden UND intakt → die Seite kommt aus der VERSIEGELTEN Quelle", () => {
    const m = manifest({ governanceProjektion: { composableId: "sachbearbeitung" } as never });
    const c = mapManifestToComposable(m, {
      governance: verdikt(true, [TARIF], [{ wissen: "unterlagen-lesen", werkzeug: "steuer-tarif" }]),
    });
    expect(c.strukturiert).toHaveLength(1);
    expect(c.strukturiert?.[0]).toMatchObject({ id: "steuer-tarif", klasse: "tarif", programm: "tarif:staffel" });
    expect(c.benutzt).toEqual([{ wissen: "unterlagen-lesen", werkzeug: "steuer-tarif" }]);
  });

  it("FAIL-CLOSED: Siegel gebrochen → die Seite bleibt leer, auch wenn der Manifest-Block etwas behauptet", () => {
    // Genau der Angriff, gegen den die Projektion eingefuehrt wurde: die Governance im Manifest umschreiben.
    // Ein Rueckfall auf den unversiegelten Block waere der Umweg, der das Siegel wertlos machte.
    const m = manifest({
      governanceProjektion: { composableId: "sachbearbeitung" } as never,
      faehigkeiten: { ki: ["unterlagen-lesen"], strukturiert: [{ ...TARIF, id: "untergeschoben" }] } as never,
    });
    const c = mapManifestToComposable(m, { governance: verdikt(false) });
    expect(c.strukturiert).toBeUndefined();
  });

  it("FAIL-CLOSED: Projektion vorhanden, aber KEIN Verdikt uebergeben → ungeprueft ist keine Quelle", () => {
    const m = manifest({
      governanceProjektion: { composableId: "sachbearbeitung" } as never,
      faehigkeiten: { ki: ["unterlagen-lesen"], strukturiert: [TARIF] } as never,
    });
    expect(mapManifestToComposable(m).strukturiert).toBeUndefined();
  });

  it("ALT-BESTAND: gar keine Projektion → der Manifest-Block traegt (wie ki/befugnis/leistungen auch)", () => {
    const m = manifest({
      faehigkeiten: {
        ki: ["unterlagen-lesen"],
        strukturiert: [TARIF],
        benutzt: [{ wissen: "unterlagen-lesen", werkzeug: "steuer-tarif" }],
      } as never,
    });
    const c = mapManifestToComposable(m);
    expect(c.strukturiert).toHaveLength(1);
    expect(c.benutzt).toHaveLength(1);
  });

  it("DIE ERZEUGUNGS-PROVENIENZ reist mit — sonst betriebe jemand eine ungelesene Regel, ohne es zu sehen", () => {
    const m = manifest({
      faehigkeiten: {
        ki: ["unterlagen-lesen"],
        strukturiert: [{ ...TARIF, erzeugtVon: "unterlagen-lesen" }],
      } as never,
    });
    const c = mapManifestToComposable(m);
    expect(c.strukturiert?.[0]?.erzeugtVon).toBe("unterlagen-lesen");
    expect(c.strukturiert?.[0]?.freigegebenVon).toBeUndefined();
  });

  it("malformte Eintraege fallen EINZELN weg — nie das ganze Buendel", () => {
    const m = manifest({
      faehigkeiten: {
        ki: ["unterlagen-lesen"],
        strukturiert: [{ ergebnis: "ohne id" }, TARIF, null],
        benutzt: [{ wissen: "unterlagen-lesen" }, { wissen: "unterlagen-lesen", werkzeug: "steuer-tarif" }],
      } as never,
    });
    const c = mapManifestToComposable(m);
    expect(c.strukturiert).toHaveLength(1);
    expect(c.benutzt).toHaveLength(1);
  });

  it("ein rein deterministisches Composable (keine ki) traegt trotzdem seine strukturierte Seite", () => {
    // Die Falle, die stromaufwaerts schon einmal zuschlug: eine Bedingung auf `ki.length` haette eine Stelle
    // mit NUR strukturierter Bindung stillschweigend faehigkeitslos gemacht. Beide Seiten sind gleichrangig.
    const m = manifest({ faehigkeiten: { strukturiert: [TARIF] } as never });
    const c = mapManifestToComposable(m);
    expect(c.spine).toBeUndefined();
    expect(c.strukturiert).toHaveLength(1);
  });
});
