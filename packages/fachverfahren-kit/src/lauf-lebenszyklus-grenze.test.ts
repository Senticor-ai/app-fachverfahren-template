import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// DIE GRENZE ZWISCHEN VORGANG UND LAUF — als Ratsche, nicht als Absicht.
//
// NUTZER-DIREKTIVE (2026-07-28): „auch in den repos gibt es für alle stati und informationen immer nur eine wahrheit."
//
// GEMESSEN über die drei Repos: der LAUF-Lebenszyklus (`awaiting-prompt · queued · running · repairing · stopping ·
// waiting · blocked · error · aborted · done · anchored` plus die Handlungs-Aussage `humanNeed`) lebt in der Fabrik —
// Quelle `CHOS-CODE/packages/fachverfahren/run-status.ts`, ein abgeleiteter Spiegel im GTC Builder MIT Kongruenz-Test.
// Dieses KIT spiegelt davon NICHTS, und das ist richtig: der Lauf-Lebenszyklus beschreibt, wie ein BAU verläuft. Eine
// erzeugte Fachanwendung weiß von Bauläufen nichts — sie führt VORGÄNGE.
//
// Das KIT führt darum sein EIGENES Vokabular, mit einer Definition (`types.ts`) und vielen Konsumenten. Zwei
// verschiedene Dinge, zwei Vokabulare, jedes mit einer Wahrheit — das ist keine Doppelung, sondern die richtige
// Trennung.
//
// ── WARUM DIESE DATEI TROTZDEM EXISTIERT ────────────────────────────────────────────────────────────────────────
// Weil eine bewusste Trennung, die nur als Einsicht existiert, beim nächsten Umbau verschwindet. Genau diese Klasse
// hat heute mehrfach Geld gekostet: ein Spiegel, der per Kommentar („bei Server-Änderung hier nachziehen") gepflegt
// wurde, war nachweislich gedriftet — elf Felder in der Webview und ein zweites, gröberes `needsHuman` im Builder.
// Eine Anweisung im Kommentar ist kein Wächter.
//
// Diese Datei ist der Wächter für die andere Richtung: sie schlägt an, sobald jemand das FABRIK-Vokabular ins KIT
// kopiert. Der Reflex ist verständlich — „der Builder hat so eine Tabelle, die brauchen wir auch" —, und er wäre hier
// falsch: eine dritte Kopie, ohne Quelle, ohne Kongruenz-Test, in einem Repo, das den Begriff fachlich nicht kennt.
//
// SIE IST EINE RATSCHE, KEINE OBERGRENZE: sie fordert NULL Treffer. Damit kann sie nur besser werden — sie wird nicht
// rot, weil das KIT wächst, sondern nur, wenn wirklich jemand die Grenze überschreitet.

/**
 * Die reservierten Namen der FABRIK. Absichtlich als Zeichenketten und nicht als Import: dieses Repo darf die Quelle
 * nicht einmal kennen — ein Import wäre selbst schon die Kopplung, die hier verhindert wird.
 *
 * JEDER NAME MUSS EINDEUTIG SEIN. Ein erster Entwurf dieser Liste führte auch `allowedActions` — und schlug sofort an,
 * an `apps/fachverfahren/src/pages/amt-akte.tsx`. Dort steht `CaseAllowedActions`: was man mit einem VORGANG tun darf,
 * geliefert von `casePort.getAllowedActions(id)`. Ein fachlich völlig anderes, völlig richtiges Konzept, das nur
 * denselben naheliegenden Namen trägt.
 *
 * Das war ein FALSCH-BLOCKER, und zwar der eigenen Machart: ein Wächter, der korrekte Arbeit anschlägt, wird nach dem
 * zweiten Mal umgangen — und ist danach schlimmer als keiner. `allowedActions` und ähnlich generische Wörter gehören
 * darum NICHT auf diese Liste. Aufgenommen wird nur, was ohne Kontext eindeutig der Fabrik gehört: ihre
 * Status-KONSTANTEN, ihre Lebenszyklus-TABELLE, ihre HITL-Semantik und ihre Ableitungs-FUNKTION.
 */
const FABRIK_NAMEN = [
  "RUN_STATUSES",         // die Wire-Statusliste des Bau-Laufs
  "RUN_STATUS_LIFECYCLE", // die Lebenszyklus-Tabelle (phase/abortable/active/humanNeed)
  "humanNeedAus",         // die Ableitung Status ⊕ Ursache ⇒ Handlungs-Wort
  "humanNeed",            // die HITL-Aussage der Fabrik (entscheidung · reparatur · fortsetzen)
  "needsHuman",           // ihre grobe Vorfassung — sie soll auch nicht als Kopie wiederkehren
] as const;

/** Wo gesucht wird: der gesamte Quellbaum des KIT, ohne Fremdcode und ohne Bau-Ergebnisse. */
const AUSGENOMMEN = new Set(["node_modules", ".git", "dist", "build", "storybook-static", "coverage", ".turbo", ".next"]);
const ENDUNGEN = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

function quellDateien(wurzel: string): string[] {
  const out: string[] = [];
  const stapel = [wurzel];
  while (stapel.length) {
    const cur = stapel.pop()!;
    let einträge: fs.Dirent[];
    try { einträge = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of einträge) {
      if (AUSGENOMMEN.has(e.name)) continue;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { stapel.push(p); continue; }
      if (!ENDUNGEN.some((x) => e.name.endsWith(x))) continue;
      // Diese Datei selbst nennt die Namen naturgemäß — sonst könnte sie nicht nach ihnen suchen.
      if (p.endsWith("lauf-lebenszyklus-grenze.test.ts")) continue;
      out.push(p);
    }
  }
  return out;
}

describe("Grenze: das KIT führt VORGÄNGE, nicht Bauläufe", () => {
  const repoWurzel = path.resolve(__dirname, "..", "..", "..");

  it("der Quellbaum ist auffindbar (ein leerer Wächter wäre ein Falsch-Grün)", () => {
    const dateien = quellDateien(repoWurzel);
    // Ohne diese Zusicherung wäre die Prüfung unten bei einem falschen Pfad still grün — die teuerste Sorte Test.
    expect(dateien.length, `Quellbaum unter ${repoWurzel} ist leer — der Pfad stimmt nicht`).toBeGreaterThan(50);
  });

  it.each(FABRIK_NAMEN)("kein KIT-Quellcode spiegelt das Fabrik-Vokabular „%s“", (name) => {
    const treffer: string[] = [];
    for (const p of quellDateien(repoWurzel)) {
      let inhalt: string;
      try { inhalt = fs.readFileSync(p, "utf8"); } catch { continue; } // OHNE Limit — Truncation verfälscht die Evidenz
      if (inhalt.includes(name)) treffer.push(path.relative(repoWurzel, p));
    }
    expect(
      treffer,
      `„${name}“ gehört dem LAUF-Lebenszyklus der Fabrik (CHOS-CODE packages/fachverfahren/run-status.ts). Eine ` +
      `Kopie hier wäre eine dritte Wahrheit ohne Quelle und ohne Kongruenz-Test — in einem Repo, das Bauläufe ` +
      `fachlich nicht kennt. Braucht die Anwendung wirklich einen Lauf-Zustand, kommt er über den Draht (die ` +
      `Fabrik projiziert ihn), nie über eine Tabelle hier. Gefunden in:\n  ${treffer.join("\n  ")}`,
    ).toEqual([]);
  });

  it("das EIGENE Vorgangs-Vokabular hat weiterhin genau EINE Definition", () => {
    // Die Gegenrichtung: die Trennung ist nur dann sauber, wenn das KIT seine eigene Wahrheit auch an EINER Stelle
    // führt. `types.ts` ist diese Stelle; alle übrigen Vorkommen sind Konsumenten (Store, Komponenten, Stories).
    const typen = path.join(__dirname, "types.ts");
    expect(fs.existsSync(typen), "packages/fachverfahren-kit/src/types.ts ist die Heimat des Vorgangs-Vokabulars").toBe(true);
    const inhalt = fs.readFileSync(typen, "utf8");
    // Die Datei muss den Vorgang WIRKLICH typisieren — sonst wäre die Aussage oben eine Behauptung.
    expect(/\bVorgang\b/.test(inhalt), "types.ts typisiert den Vorgang").toBe(true);
  });
});
