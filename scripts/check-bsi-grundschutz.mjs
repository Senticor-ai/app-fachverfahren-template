#!/usr/bin/env node
// check-bsi-grundschutz — haelt das BSI-IT-Grundschutz-Mapping (docs/security/bsi-grundschutz.md) EHRLICH und
// prueffaehig: (1) das Dokument existiert + traegt Version + Stand; (2) es deckt eine Mindestzahl Bausteine ab und
// nennt mind. eine als `erfuellt` markierte Kontrolle; (3) JEDER in der Beleg-Spalte zitierte Repo-Pfad existiert
// tatsaechlich (kein Overclaiming — ein Mapping darf keine Kontrolle mit einem nicht existierenden Beleg behaupten).
// Rein statisch (Textscan), kein Domaenen-Wissen. Neue Bausteine -> einfach im Dokument ergaenzen (mit echtem Beleg).
import { readFileSync, existsSync } from "node:fs";

const DOC = "docs/security/bsi-grundschutz.md";
const MIN_BAUSTEINE = 8;

const fehler = [];
if (!existsSync(DOC)) {
  console.error(`bsi-grundschutz: ${DOC} fehlt`);
  process.exit(1);
}
const text = readFileSync(DOC, "utf8");

if (!/^Version:\s*\d+\.\d+\.\d+/m.test(text))
  fehler.push("Kopf ohne `Version: x.y.z`");
if (!/Stand:\s*\d{4}-\d{2}-\d{2}/.test(text))
  fehler.push("Kopf ohne `Stand: YYYY-MM-DD`");

// Tabellen-Zeilen (| ... | ... |), ohne Kopf-/Trennzeile.
const zeilen = text
  .split("\n")
  .filter((l) => l.trimStart().startsWith("|"))
  .map((l) => l.trim())
  .filter(
    (l) =>
      !/^\|\s*Baustein\s*\|/.test(l) &&
      !/^\|\s*-{2,}/.test(l) &&
      !/^\|(\s*-+\s*\|)+$/.test(l),
  );

let bausteine = 0;
let erfuellt = 0;
const belegPfade = new Set();
for (const z of zeilen) {
  const spalten = z.split("|").map((s) => s.trim());
  // [leer, Baustein, Anforderung, Status, Beleg, Luecke, leer]
  if (spalten.length < 6) continue;
  const [, baustein, , status, beleg] = spalten;
  if (!baustein) continue;
  bausteine += 1;
  if (/erf(ü|ue)llt/i.test(status) && !/teilweise/i.test(status)) erfuellt += 1;
  // Backtick-zitierte Pfade aus der Beleg-Spalte einsammeln (durch · getrennt moeglich).
  for (const m of beleg.matchAll(/`([^`]+)`/g)) {
    const p = m[1].trim();
    if (
      p &&
      p !== "—" &&
      (p.includes("/") || p.endsWith(".ts") || p.endsWith(".mjs"))
    )
      belegPfade.add(p);
  }
}

if (bausteine < MIN_BAUSTEINE)
  fehler.push(`nur ${bausteine} Bausteine gemappt (min. ${MIN_BAUSTEINE})`);
if (erfuellt < 1)
  fehler.push("keine einzige als `erfuellt` markierte Kontrolle");

for (const p of belegPfade) {
  if (!existsSync(p))
    fehler.push(`Beleg-Pfad existiert nicht (Overclaiming?): ${p}`);
}

if (fehler.length > 0) {
  console.error("bsi-grundschutz verletzt:");
  for (const f of fehler) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `bsi-grundschutz ok — ${bausteine} Bausteine (${erfuellt} erfuellt), ${belegPfade.size} Beleg-Pfade alle vorhanden.`,
);
