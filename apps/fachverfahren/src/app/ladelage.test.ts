// ladelage.test — THE CLASS, NOT THE EIGHT SITES.
//
// An adversarial review of two independently built procedures confirmed the same construction in five pages of
// this template: a rejected promise was swallowed with `.catch(() => undefined)`, after which the view rendered
// the branch meant for an EMPTY result. What the citizen then read was not a missing error message but a false
// statement of fact — "no notice", "no evidence", "application not found" — and on the notice page that costs an
// appeal deadline.
//
// Patching the five sites would leave the sixth to be written tomorrow. This file holds the CLASS: the swallow
// is counted, and the count may only go down.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dokumentTitel } from "./dokument-titel.js";
import { grundVon, statusVon } from "./ladelage.js";

const HIER = dirname(fileURLToPath(import.meta.url));
const QUELLE = join(HIER, "..");

/** The construction that turns a failure into an empty result. `.catch(() => undefined)` and its silent
 *  siblings discard the reason before anyone can render it. */
const VERSCHLUCKT = /\.catch\(\s*\(\s*\)\s*=>\s*(undefined|\{\s*\})\s*\)/g;

/** Kommentarzeilen fallen weg, bevor gezaehlt wird — sonst zaehlt der BEFUND sich selbst mit: die geheilten
 *  Stellen ZITIEREN die alte Bauform in ihrer Begruendung, und die Begruendungen bleiben (Hausregel).
 *  Bewusst ZEILENWEISE und ohne Block-Parser: ein Kommentar-Entferner, der mehr kann, hat in diesem Haus schon
 *  einmal 87 % einer Datei gefressen, und der Zeuge daneben blieb gruen. */
function ohneKommentarzeilen(text: string): string {
  return text
    .split("\n")
    .filter((z) => {
      const t = z.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

function dateien(dir: string): string[] {
  const raus: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      raus.push(...dateien(p));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      raus.push(p);
    }
  }
  return raus;
}

describe("Ladelage — ein Fehlschlag ist kein leeres Ergebnis", () => {
  it("kein Modul verschluckt eine Rejection (Ratsche, nur sinkend)", () => {
    const alle = dateien(QUELLE);
    // POSITIVE CONTROL: without it, "no hits" would be indistinguishable from "my scan found no files" —
    // exactly the way a green witness measures nothing.
    expect(alle.length).toBeGreaterThan(20);

    const treffer = alle
      .map((p) => ({
        p,
        n: (
          ohneKommentarzeilen(readFileSync(p, "utf8")).match(VERSCHLUCKT) ?? []
        ).length,
      }))
      .filter((t) => t.n > 0);

    expect(
      treffer.map((t) => `${t.p.slice(QUELLE.length + 1)} (${t.n}×)`),
      "Eine verschluckte Rejection wird zur Aussage «es gibt nichts». Statt sie zu fangen und wegzuwerfen: " +
        "`useLadelage` (app/ladelage.ts) trennt die drei Antworten, `FehlerFlaeche` benennt die Lage und " +
        "bietet den Weg an, den sie nennt.",
    ).toEqual([]);
  });

  it("GEGENPROBE: das Muster wird ueberhaupt erkannt", () => {
    // Ohne diese Zeile waere die Ratsche oben auch mit einem toten Regex gruen — die Leitklasse dieses Hauses.
    const proben = [
      "foo().catch(() => undefined);",
      "foo().catch(() => {});",
      "foo().catch( ()=>undefined )",
    ];
    for (const probe of proben) {
      expect(probe.match(VERSCHLUCKT), probe).not.toBeNull();
    }
    // Und ein ECHTER Fang darf nicht als Verschlucken zaehlen, sonst zwingt die Ratsche zum Gegenteil.
    expect("foo().catch((e) => setFehler(e));".match(VERSCHLUCKT)).toBeNull();

    // Der Kommentar-Filter muss die BEGRUENDUNG ausblenden und den CODE stehen lassen — beides, sonst misst
    // die Ratsche entweder sich selbst oder gar nichts.
    const probe =
      "// frueher: .catch(() => undefined)\nfoo().catch(() => undefined);";
    expect(ohneKommentarzeilen(probe).match(VERSCHLUCKT)).toHaveLength(1);
    expect(
      ohneKommentarzeilen("// nur ein Zitat: .catch(() => undefined)"),
    ).toBe("");
  });
});

describe("grundVon / statusVon — nie geraten", () => {
  it("ein Fehler ohne Nachricht bekommt einen benannten Ersatz, nie eine leere Zeile", () => {
    expect(grundVon(new Error(""))).toBe("Unbekannte Ursache.");
    expect(grundVon(null)).toBe("Unbekannte Ursache.");
    expect(grundVon(new Error("kaputt"))).toBe("kaputt");
  });

  it("ohne Status bleibt es `null` — eine erfundene Zahl waere schlimmer als keine", () => {
    expect(statusVon(new Error("x"))).toBeNull();
    expect(statusVon({ status: "403" })).toBeNull();
    expect(statusVon({ status: 403 })).toBe(403);
  });
});

describe("dokumentTitel — der Reiter nennt die Leistung", () => {
  it("setzt Seite, Leistung und Behoerde in Lesereihenfolge", () => {
    expect(
      dokumentTitel({ label: "Musterleistung", kommune: "Stadt X" }, "Antrag"),
    ).toBe("Antrag — Musterleistung · Stadt X");
  });

  it("laesst weg, was die Konfiguration nicht traegt — erfindet nichts", () => {
    expect(dokumentTitel({ label: "Musterleistung", kommune: "" })).toBe(
      "Musterleistung",
    );
    expect(dokumentTitel({ label: "", kommune: "" })).toBe("Fachverfahren");
  });

  it("GEGENPROBE: zwei verschiedene Leistungen tragen zwei verschiedene Titel", () => {
    // Ohne sie waere die Zusicherung auch von einer Konstante erfuellt — genau der Zustand, den der Befund
    // beschreibt: JEDE Route trug denselben Titel aus der unveraenderten Vorlage.
    expect(dokumentTitel({ label: "A", kommune: "X" })).not.toBe(
      dokumentTitel({ label: "B", kommune: "X" }),
    );
  });
});

describe("Dokument-Titel — jede Einstiegsflaeche setzt ihn", () => {
  // ── DIE KLASSE, NICHT DIE ZWEI STELLEN ─────────────────────────────────────────────────────────────────
  // `Shell` setzt den Titel fuer alle Fach-Sichten. Die LANDING rendert keine Shell — und ist die erste Seite,
  // die jemand sieht. Ohne diese Zusicherung truege ausgerechnet der Einstieg weiter den Titel der
  // unveraenderten Vorlage, und der naechste Container ohne Shell faende niemand.
  it("jeder Seiten-Container ohne `Shell` setzt den Titel selbst", () => {
    const container = dateien(QUELLE).filter((p) => {
      const t = readFileSync(p, "utf8");
      // Ein Seiten-Container ist, was eine ganze Seite rendert: `<main` auf oberster Ebene ODER die Shell.
      return /<main[\s>]/.test(t) || /<Shell[\s>]/.test(t);
    });
    // POSITIV-KONTROLLE: ohne sie waere «keiner verletzt es» von «ich finde keine Container» nicht zu trennen.
    expect(container.length).toBeGreaterThan(3);

    const ohneTitel = container.filter((p) => {
      const t = readFileSync(p, "utf8");
      // Wer `Shell` rendert, erbt den Titel von dort — das ist der EINE erlaubte Weg neben dem Hook.
      return !/<Shell[\s>]/.test(t) && !/useDokumentTitel\s*\(/.test(t);
    });
    expect(
      ohneTitel.map((p) => p.slice(QUELLE.length + 1)),
      "Ein Seiten-Container ohne Titel traegt den der unveraenderten Vorlage — WCAG 2.4.2 (Stufe A, BITV 2.0). " +
        "Entweder `Shell` rendern (die setzt ihn) oder `useDokumentTitel(store.config, <seite>)` rufen.",
    ).toEqual([]);
  });
});
