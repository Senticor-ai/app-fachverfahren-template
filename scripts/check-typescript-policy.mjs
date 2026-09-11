import { existsSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
// The exclusion set and the tree walk are SHARED (scripts/lib/source-exclusion.ts,
// scripts/lib/source-scan.ts): one truth about what is build output, derived from `.gitignore`,
// and a walk that FAILS instead of reporting an empty tree. Do not re-declare either here.
import {
  collectSourceFiles,
  loadSourceExclusions,
  readTextFile,
} from "./lib/source-scan.ts";

const root = process.cwd();
// ⛔ `scripts` UND `tooling` FEHLTEN HIER BIS 2026-09-06 — die Vollstrecker der Regel standen ausserhalb
// ihrer selbst. Gemessen: 18 Checker + 1 Runner in JavaScript, waehrend dieses Gate JavaScript in
// `apps/packages/jurisdictions/modules` verbietet. Eine Regel, die ihren eigenen Durchsetzer nicht deckt,
// ist keine Ratsche, sondern eine Absichtserklaerung mit Ausnahmebereich.
const implementationRoots = [
  "apps",
  "packages",
  "jurisdictions",
  "modules",
  "scripts",
  "tooling",
];
const generatedJavaScriptAssets = new Set([
  "apps/fachverfahren/public/preview-reporter.js",
  "apps/fachverfahren/public/service-worker.js",
  // legitimer CommonJS-Interop (kein TS): Tailwind-v3-Preset, oeffentlicher package.json-Export, von Consumer-Apps eingebunden
  "packages/fachverfahren-kit/tailwind-preset.cjs",
]);
// ── DIE UEBERGANGSLISTE — sie darf NUR SINKEN ──────────────────────────────────────────────────────────
// Als `scripts` und `tooling` am 2026-09-06 in die Reichweite dieser Regel kamen, standen dort 21 Dateien
// in JavaScript. Sie werden hier NAMENTLICH gefuehrt, nicht durch einen Ausnahme-Ordner verdeckt:
//
//   · Eine Liste von NAMEN kann eine Umbenennung nicht als Fortschritt melden — eine Zahl koennte es.
//   · Jeder Eintrag muss EXISTIEREN (s. Riegel unten). Wer eine Datei umstellt und ihren Eintrag stehen
//     laesst, hinterlaesst eine tote Adresse — und dieses Gate sagt es ihm.
//   · Wer eine NEUE JavaScript-Datei anlegt, faellt sofort: sie steht hier nicht.
//
// ⛔ NICHT ERWEITERN. Der einzige erlaubte Diff an dieser Liste ist eine geloeschte Zeile.
const uebergang = new Set([
  "scripts/check-css-token-aliases.mjs",
  "scripts/check-dev-dependencies.mjs",
  "scripts/check-dockerfile-paths.mjs",
  "scripts/check-domain-contracts.mjs",
  "scripts/check-esm-policy.mjs",
  "scripts/check-k8s-delivery.mjs",
  "scripts/check-motion-tokens.mjs",
  "scripts/check-openapi.mjs",
  "scripts/check-pwa-browser.mjs",
  "scripts/check-pwa-runtime.mjs",
  "scripts/check-storybook-coverage.mjs",
  "scripts/check-typescript-policy.mjs",
  "scripts/check-web-delivery.mjs",
  "scripts/dev-api.mjs",
  "scripts/dev-api.test.mjs",
  "scripts/evidence-build.mjs",
  "scripts/scaffold-standalone-app.mjs",
  "scripts/setup-husky.mjs",
  "scripts/smoke-runtime.mjs",
  "scripts/verify-husky.mjs",
  "tooling/check/run-checks.mjs",
]);

const forbiddenJavaScriptExtensions = new Set([".js", ".jsx", ".cjs", ".mjs"]);
const exclusions = await loadSourceExclusions(root);

function display(path) {
  return relative(root, path);
}

const violations = [];

// Ein Uebergangs-Eintrag, den es nicht mehr gibt, ist eine tote Adresse — und eine stille Luege ueber die
// Groesse der Restarbeit. Er faellt hier BEIM NAMEN, damit die Liste im selben Schnitt sinkt wie der Baum.
for (const eintrag of uebergang) {
  if (!existsSync(join(root, eintrag))) {
    violations.push(
      eintrag +
        " steht in der Uebergangsliste von check-typescript-policy, existiert aber nicht mehr — die Zeile gehoert im SELBEN Schnitt entfernt.",
    );
  }
}

for (const implementationRoot of implementationRoots) {
  const files = await collectSourceFiles(join(root, implementationRoot), {
    exclusions,
    optional: true,
  });

  for (const file of files) {
    const relativePath = display(file);
    const extension = extname(file);

    if (generatedJavaScriptAssets.has(relativePath)) {
      continue;
    }

    if (forbiddenJavaScriptExtensions.has(extension)) {
      // Die Uebergangsliste entschuldigt NAMENTLICH und nur abwaerts — s. ihren Kopf.
      if (!uebergang.has(relativePath)) {
        violations.push(`${relativePath} must be TypeScript (.ts or .tsx)`);
      }
      continue;
    }

    if (extension === ".json" && !basename(file).startsWith("tsconfig")) {
      continue;
    }

    if (![".ts", ".tsx", ".json"].includes(extension)) {
      continue;
    }

    const content = await readTextFile(file);
    const allowJsPatterns = [/\ballowJs\s*:\s*true\b/, /"allowJs"\s*:\s*true/];

    if (allowJsPatterns.some((pattern) => pattern.test(content))) {
      violations.push(`${relativePath} enables allowJs; keep it disabled`);
    }
  }
}

if (violations.length > 0) {
  console.error("TypeScript source policy violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("TypeScript source policy passed.");
}
