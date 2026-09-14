// Ein Tor, das NICHTS geprueft hat, darf nicht wie eine Zusicherung klingen.
//
// ⛔ DER GEMESSENE FALL (2026-09-14): `check:domain-contracts` meldete an der unberuehrten Vorlage
// „Domain contract check passed." — ueber NULL Modulen. Unter `modules/` liegt dort nur AGENTS.md und
// README.md, also KEIN Verzeichnis; `listDomainModuleNames()` liefert die leere Liste, die Schleife laeuft
// nie, `failures` bleibt leer. **Eine leere Menge besteht jede Pruefung ueber ihre Elemente.**
// Sobald CHOS-CODE ein Verfahren erzeugt, traegt `modules/` genau EIN Modul — und dasselbe Tor meldet dann
// 145 Befunde, in zwei unabhaengig gemessenen Verfahren Zeichen fuer Zeichen gleich.
//
// Dieser Zeuge misst die Unterscheidbarkeit: der Bericht muss seine GRUNDMENGE nennen, damit
// „gruen, weil geprueft" von „gruen, weil nichts da war" zu trennen ist.
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const TOR = fileURLToPath(
  new URL("./check-domain-contracts.mjs", import.meta.url),
);
const baeume: string[] = [];

function baumMit(module: readonly string[]): string {
  const wurzel = mkdtempSync(join(tmpdir(), "domain-tor-"));
  baeume.push(wurzel);
  mkdirSync(join(wurzel, "modules"), { recursive: true });
  // Die Vorlage traegt hier NUR Dateien — genau die Lage, die das Tor blind gemacht hat.
  writeFileSync(join(wurzel, "modules", "README.md"), "# modules\n");
  writeFileSync(join(wurzel, "modules", "AGENTS.md"), "# agents\n");
  for (const m of module)
    mkdirSync(join(wurzel, "modules", m), { recursive: true });
  return wurzel;
}

function fahre(wurzel: string): { code: number; aus: string } {
  try {
    const aus = execFileSync(process.execPath, [TOR], {
      cwd: wurzel,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, aus };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      aus: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

afterAll(() => {
  for (const b of baeume) rmSync(b, { recursive: true, force: true });
});

describe("das Domain-Tor nennt seine Grundmenge", () => {
  it("(1) NULL Module: gruen — aber der Bericht sagt, dass er NICHTS geprueft hat", () => {
    const r = fahre(baumMit([]));
    expect(r.code).toBe(0); // kein Wurf: die Vorlage SOLL kein Modul tragen
    expect(r.aus).toMatch(/0 Module/);
    expect(r.aus).toMatch(/keine Aussage ueber ein Fachverfahren/);
  });

  it("(2) EIN Modul: das Tor prueft wirklich und faellt ueber die fehlende Struktur", () => {
    // Ohne diese Kontrolle waere (1) auch dann gruen, wenn das Tor gar nichts mehr kann.
    const r = fahre(baumMit(["hundesteuer"]));
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/missing required directory contracts\//);
    expect(r.aus).toMatch(/missing domain\.module\.yaml/);
  });

  it("(3) der GRUEN-Satz nennt die geprueften Module beim Namen, sobald es welche gibt", () => {
    // Ein Modul, das (absichtlich) unvollstaendig ist, faellt — der Satz ist also nur am leeren Baum
    // erreichbar. Gemessen wird hier deshalb die FORM des Satzes an der Quelle, nicht an einem Lauf.
    const quelle = readFileSync(TOR, "utf8");
    expect(quelle).toMatch(
      /Modul\(e\) geprueft: \$\{moduleNames\.join\(", "\)\}/,
    );
    expect(quelle).toMatch(
      /const moduleNames = await listDomainModuleNames\(\)/,
    );
  });

  it("(4) POSITIV-KONTROLLE: der Fahrer misst wirklich — ein kaputter Baum wird auch als kaputt gemeldet", () => {
    const r = fahre(baumMit(["a", "b"]));
    expect(r.code).toBe(1);
    expect(r.aus).toMatch(/^- a missing required directory/m);
    expect(r.aus).toMatch(/^- b missing required directory/m);
  });
});
