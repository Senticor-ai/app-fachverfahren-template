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
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["apps", "packages", "modules"];
const baselinePath = join(root, "scripts", "motion-baseline.json");
const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "dist-server",
  "dist-types",
  "node_modules",
  "storybook-static",
]);
const scannedExtensions = new Set([".css", ".ts", ".tsx"]);

// Literale Tailwind-Dauer-Klasse: `duration-150` u. ä. — NICHT `duration-(--fv-…)`, nicht
// `transition-duration`, nicht `--fv-duration-*` (kein Ziffern-Suffix nach `duration-`).
const LITERAL_DURATION = /\bduration-\d+\b/g;
const BOUNCE = /\banimate-bounce\b/;

async function directoryExists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(startDirectory) {
  if (!(await directoryExists(startDirectory))) return [];
  const entries = await readdir(startDirectory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(startDirectory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await collectFiles(path)));
      }
      continue;
    }
    if (scannedExtensions.has(extname(path))) files.push(path);
  }
  return files;
}

const display = (path) => relative(root, path).split("\\").join("/");

// Aktuelle Verstöße einsammeln.
const durationCounts = {}; // relPath -> count literaler Dauer-Klassen
const bounceHits = []; // "relPath:line"
for (const sourceRoot of sourceRoots) {
  const files = await collectFiles(join(root, sourceRoot));
  for (const file of files) {
    const rel = display(file);
    const text = await readFile(file, "utf8");
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
  ? JSON.parse(await readFile(baselinePath, "utf8"))
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
