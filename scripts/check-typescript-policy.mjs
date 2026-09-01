import { basename, extname, join, relative } from "node:path";
// The exclusion set and the tree walk are SHARED (scripts/lib/source-exclusion.mjs,
// scripts/lib/source-scan.mjs): one truth about what is build output, derived from `.gitignore`,
// and a walk that FAILS instead of reporting an empty tree. Do not re-declare either here.
import {
  collectSourceFiles,
  loadSourceExclusions,
  readTextFile,
} from "./lib/source-scan.mjs";

const root = process.cwd();
const implementationRoots = ["apps", "packages", "jurisdictions", "modules"];
const generatedJavaScriptAssets = new Set([
  "apps/fachverfahren/public/preview-reporter.js",
  "apps/fachverfahren/public/service-worker.js",
  // legitimer CommonJS-Interop (kein TS): Tailwind-v3-Preset, oeffentlicher package.json-Export, von Consumer-Apps eingebunden
  "packages/fachverfahren-kit/tailwind-preset.cjs",
]);
const forbiddenJavaScriptExtensions = new Set([".js", ".jsx", ".cjs", ".mjs"]);
const exclusions = await loadSourceExclusions(root);

function display(path) {
  return relative(root, path);
}

const violations = [];

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
      violations.push(`${relativePath} must be TypeScript (.ts or .tsx)`);
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
