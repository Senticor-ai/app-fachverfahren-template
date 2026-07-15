#!/usr/bin/env node
// Prüft ausschließlich die mechanische Ehrlichkeit der vorläufigen Mapping-Arbeitsliste.
// Das Gate ist weder ein Grundschutz-Check noch ein Konformitäts- oder Wirksamkeitsnachweis.
import { existsSync, readFileSync } from "node:fs";

const DOC = "docs/security/bsi-grundschutz.md";
const MIN_BAUSTEINE = 8;
const fehler = [];

if (!existsSync(DOC)) {
  console.error(`bsi-grundschutz: ${DOC} fehlt`);
  process.exit(1);
}

const text = readFileSync(DOC, "utf8");
if (!/^Version:\s*\d+\.\d+\.\d+/m.test(text)) {
  fehler.push("Kopf ohne `Version: x.y.z`");
}
if (!/Stand:\s*\d{4}-\d{2}-\d{2}/.test(text)) {
  fehler.push("Kopf ohne `Stand: YYYY-MM-DD`");
}
if (!/keine Konformitätsaussage/i.test(text)) {
  fehler.push("Aussagegrenze `keine Konformitätsaussage` fehlt");
}
if (!/prüft keine BSI-Anforderung/i.test(text)) {
  fehler.push("Gate-Grenze `prüft keine BSI-Anforderung` fehlt");
}

const zeilen = text
  .split("\n")
  .filter((line) => line.trimStart().startsWith("|"))
  .map((line) => line.trim())
  .filter(
    (line) =>
      !/^\|\s*Baustein-Kandidat\s*\|/.test(line) && !/^\|\s*-{2,}/.test(line),
  );

let bausteine = 0;
let offen = 0;
let zuBestaetigen = 0;
const belegPfade = new Set();

for (const zeile of zeilen) {
  const spalten = zeile.split("|").map((spalte) => spalte.trim());
  const [, baustein, , bewertung, beleg] = spalten;
  if (!baustein || !bewertung || !beleg) continue;
  bausteine += 1;

  if (bewertung === "offen") offen += 1;
  else if (bewertung === "zu bestätigen") zuBestaetigen += 1;
  else {
    fehler.push(
      `unzulässige Bewertung bei ${baustein}: ${bewertung} (nur \`offen\` oder \`zu bestätigen\`)`,
    );
  }

  for (const match of beleg.matchAll(/`([^`]+)`/g)) {
    const pfad = match[1].trim();
    if (pfad && pfad !== "—") belegPfade.add(pfad);
  }
}

if (bausteine < MIN_BAUSTEINE) {
  fehler.push(
    `nur ${bausteine} Kandidaten dokumentiert (min. ${MIN_BAUSTEINE})`,
  );
}
if (offen < 1 || zuBestaetigen < 1) {
  fehler.push(
    "Arbeitsliste muss offene und zu bestätigende Kandidaten enthalten",
  );
}

for (const pfad of belegPfade) {
  if (!existsSync(pfad)) {
    fehler.push(`Repo-Anknüpfung existiert nicht: ${pfad}`);
  }
}

if (fehler.length > 0) {
  console.error("bsi-grundschutz verletzt:");
  for (const eintrag of fehler) console.error(`  ${eintrag}`);
  process.exit(1);
}

console.log(
  `bsi-grundschutz ok — ${bausteine} Kandidaten, ${belegPfade.size} vorhandene Repo-Pfade; keine Konformitätsprüfung.`,
);
