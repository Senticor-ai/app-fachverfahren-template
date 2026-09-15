// check:motion — Motion-Gate (Spec §4.7): dezent, tokenisiert, kein Bounce.
//
// Zwei Regeln:
//  1) HART (immer 0): `animate-bounce` ist verboten — verspielt, widerspricht dem seriösen Grundton.
//  2) RATCHET: literale `duration-<n>`-Klassen (magische Millisekunden) sollen zugunsten der
//     Motion-Tokens verschwinden — global via Theme-Default `transition` (150 ms/ease-out) oder
//     `duration-(--fv-duration-*)`/`fv-transition`. Eine per-Datei-Baseline (motion-baseline.json)
//     friert den Ist-Stand ein: jede Welle DARF die Zahl je Datei nur SENKEN, nie erhöhen, und
//     KEINE neue Datei darf literale Dauer-Klassen einführen.
//
// Baseline aktualisieren (nur beim Absenken): `node scripts/check-motion-tokens.mjs --update-baseline`.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { ohneDokumentationsNutzlast } from "./lib/doku-nutzlast.ts";
// The exclusion set and the tree walk are SHARED (scripts/lib/source-exclusion.ts,
// scripts/lib/source-scan.ts): one truth about what is build output, derived from `.gitignore`,
// and a walk that FAILS instead of reporting an empty tree. Do not re-declare either here.
import {
  collectSourceFiles,
  loadSourceExclusions,
  readTextFile,
} from "./lib/source-scan.ts";

const root = process.cwd();
const sourceRoots = ["apps", "packages", "modules"];
const baselinePath = join(root, "scripts", "motion-baseline.json");
const scannedExtensions = [".css", ".ts", ".tsx"];
const exclusions = await loadSourceExclusions(root);

// Literale Tailwind-Dauer-Klasse: `duration-150` u. ä. — NICHT `duration-(--fv-…)`, nicht
// `transition-duration`, nicht `--fv-duration-*` (kein Ziffern-Suffix nach `duration-`).
const LITERAL_DURATION = /\bduration-\d+\b/g;
const BOUNCE = /\banimate-bounce\b/;

const display = (path) => relative(root, path).split("\\").join("/");

// Aktuelle Verstöße einsammeln.
const durationCounts = {}; // relPath -> count literaler Dauer-Klassen
const bounceHits = []; // "relPath:line"
for (const sourceRoot of sourceRoots) {
  const files = await collectSourceFiles(join(root, sourceRoot), {
    extensions: scannedExtensions,
    exclusions,
    optional: true,
  });
  for (const file of files) {
    const rel = display(file);
    // Dokumentations-Nutzlast ausblenden, BEVOR gezaehlt wird: der Doku-Korpus zitiert `animate-bounce` und
    // Dauer-Klassen, weil er die Motion-Regel ERKLAERT. Zeilennummern bleiben erhalten (Nutzlast wird leer).
    const text = ohneDokumentationsNutzlast(await readTextFile(file));
    const durMatches = text.match(LITERAL_DURATION);
    if (durMatches && durMatches.length > 0)
      durationCounts[rel] = durMatches.length;
    text.split(/\r?\n/).forEach((line, i) => {
      if (BOUNCE.test(line)) bounceHits.push(`${rel}:${i + 1}`);
    });
  }
}

if (process.argv.includes("--update-baseline")) {
  const sorted = Object.fromEntries(
    Object.entries(durationCounts).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(baselinePath, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  const total = Object.values(sorted).reduce((s, n) => s + n, 0);
  console.log(
    `Motion-Baseline aktualisiert: ${total} literale Dauer-Klassen in ${Object.keys(sorted).length} Dateien → scripts/motion-baseline.json`,
  );
  process.exit(0);
}

const baseline = existsSync(baselinePath)
  ? JSON.parse(await readTextFile(baselinePath))
  : {};

const violations = [];

// Regel 1: animate-bounce ist immer verboten.
for (const hit of bounceHits) {
  violations.push(
    `${hit}: animate-bounce ist verboten (verspielt) — dezente Motion-Tokens nutzen`,
  );
}

// Regel 2: Ratchet gegen die Baseline.
for (const [rel, count] of Object.entries(durationCounts)) {
  const allowed = baseline[rel] ?? 0;
  if (count > allowed) {
    violations.push(
      `${rel}: ${count} literale duration-<n>-Klassen (erlaubt laut Baseline: ${allowed}) — ` +
        `nutze das Theme-Default \`transition\` oder \`duration-(--fv-duration-*)\`/\`fv-transition\``,
    );
  }
}

const total = Object.values(durationCounts).reduce((s, n) => s + n, 0);
const baseTotal = Object.values(baseline).reduce((s, n) => s + n, 0);

if (violations.length > 0) {
  console.error("Motion-Gate-Verstöße:");
  for (const v of violations) console.error(`- ${v}`);
  console.error(
    `\nHinweis: Baseline nur zum ABSENKEN aktualisieren via \`node scripts/check-motion-tokens.mjs --update-baseline\`.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Motion-Gate ok — ${total}/${baseTotal} literale Dauer-Klassen (Ratchet, schrumpft pro Welle), 0 animate-bounce.`,
  );
}
