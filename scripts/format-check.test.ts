// Zeuge: DER IGNORANZ-ZWEIG DES FORMAT-TORES MUSS FEUERN KOENNEN.
//
// ⛔ Der Befund (gemessen 2026-09-15, prettier 3.9.5): `format-check.ts` fragte
// `prettier.getFileInfo(pfad, { resolveConfig: true })` und verzweigte auf `info.ignored`. Diese API
// konsultiert `.prettierignore` aber NUR, wenn man ihr `ignorePath` nennt — ohne ihn liefert sie fuer
// eine in `.prettierignore` gefuehrte Datei `{ ignored: false }`. Der Zweig war damit fuer KEINE Datei
// erreichbar, und das Tor meldete ein GENERIERTES Artefakt als «nicht formatiert».
//
// Das ist mehr als ein Fehlalarm: die genannte Abhilfe (`prettier --write <datei>`) tut fuer eine
// ignorierte Datei nachweislich nichts, und ein generiertes Artefakt aendert ohnehin nur sein Erzeuger.
// Ein Halt ohne ausfuehrbare Abhilfe ist eine Sackgasse.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import prettier from "prettier";

const WURZEL = path.resolve(import.meta.dirname, "..");
const TOR = path.join(WURZEL, "scripts/format-check.ts");

describe("format:check — der Ignoranz-Zweig ist erreichbar", () => {
  it("POSITIV-KONTROLLE: es gibt ueberhaupt eine ignorierte, mitgelieferte Datei", () => {
    const liste = fs.readFileSync(path.join(WURZEL, ".prettierignore"), "utf8");
    expect(liste).toContain("docs-manifest.generated.ts");
  });

  it("⭐ OHNE ignorePath sagt prettier «nicht ignoriert» — der Befund selbst", async () => {
    const p = "apps/fachverfahren/src/docs/docs-manifest.generated.ts";
    const ohne = await prettier.getFileInfo(p, { resolveConfig: true });
    expect(ohne.ignored).toBe(false); // ⇐ genau darum war der Zweig tot
  });

  it("⭐ MIT ignorePath sagt sie die Wahrheit", async () => {
    const p = "apps/fachverfahren/src/docs/docs-manifest.generated.ts";
    const mit = await prettier.getFileInfo(p, {
      resolveConfig: true,
      ignorePath: ".prettierignore",
    });
    expect(mit.ignored).toBe(true);
  });

  it("RATSCHE: das Tor reicht `ignorePath` durch — sonst kehrt der tote Zweig zurueck", () => {
    const quelle = fs.readFileSync(TOR, "utf8");
    // Gemessen wird der RUF, nicht die Prosa daneben: der Kommentar erklaert den Befund und nennt
    // `ignorePath` mehrfach; ein roher `includes` waere davon gruen geworden.
    const ohneKommentar = quelle
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    expect(ohneKommentar).toMatch(/getFileInfo\([^)]*ignorePath/s);
  });

  it("TAUTOLOGIE-SPERRE: der Kommentar-Streifer streift wirklich", () => {
    const quelle = fs.readFileSync(TOR, "utf8");
    const ohneKommentar = quelle
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    expect(ohneKommentar.length).toBeLessThan(quelle.length);
  });
});
