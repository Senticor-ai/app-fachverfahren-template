import { extname, join, relative } from "node:path";
// The exclusion set and the tree walk are SHARED (scripts/lib/source-exclusion.mjs,
// scripts/lib/source-scan.mjs): one truth about what is build output, derived from `.gitignore`,
// and a walk that FAILS instead of reporting an empty tree. Do not re-declare either here.
import {
  collectSourceFiles,
  loadSourceExclusions,
  readTextFile,
} from "./lib/source-scan.mjs";

const root = process.cwd();
const packageRoots = ["apps", "packages", "jurisdictions"];
const sourceRoots = ["apps", "packages", "jurisdictions", "modules", "scripts"];
const exclusions = await loadSourceExclusions(root);
// Generierte oder statische Browser-JS-Assets hier allowlisten; Implementierungscode bleibt TypeScript-only.
const generatedJavaScriptAssets = new Set([
  "apps/fachverfahren/public/preview-reporter.js",
  "apps/fachverfahren/public/service-worker.js",
]);
// Legitime CommonJS-Interop-Punkte, die das Kit BEWUSST als .cjs veroeffentlicht (oeffentlicher package.json-Export):
// das Tailwind-v3-Preset wird von Consumer-Apps in ihre CommonJS-tailwind.config.cjs eingebunden — CommonJS ist hier
// der KORREKTE, notwendige Interop-Punkt (ein ESM-Preset liesse sich dort nicht einbinden). Scoped Ausnahme.
const allowedCommonJsAssets = new Set([
  "packages/fachverfahren-kit/tailwind-preset.cjs",
]);

async function collectPackageJsonFiles() {
  const files = [join(root, "package.json")];
  for (const workspaceRoot of packageRoots) {
    files.push(
      ...(await collectSourceFiles(join(root, workspaceRoot), {
        exclusions,
        optional: true,
        extensions: ["package.json"],
      })),
    );
  }
  return files;
}

async function collectPolicySourceFiles() {
  const files = [];
  for (const sourceRoot of sourceRoots) {
    files.push(
      ...(await collectSourceFiles(join(root, sourceRoot), {
        exclusions,
        optional: true,
        extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".cts", ".mts"],
      })),
    );
  }
  return files;
}

function display(path) {
  return relative(root, path);
}

const violations = [];

for (const packageJsonPath of await collectPackageJsonFiles()) {
  const packageJson = JSON.parse(await readTextFile(packageJsonPath));
  if (packageJson.type !== "module") {
    violations.push(
      `${display(packageJsonPath)} must declare "type": "module"`,
    );
  }
}

for (const sourceFile of await collectPolicySourceFiles()) {
  const relativePath = display(sourceFile);
  const extension = extname(sourceFile);

  if ([".cjs", ".cts"].includes(extension)) {
    if (!allowedCommonJsAssets.has(relativePath)) {
      violations.push(`${relativePath} uses a CommonJS-only extension`);
    }
    continue;
  }

  if (
    extension === ".js" &&
    !generatedJavaScriptAssets.has(relativePath) &&
    (relativePath.startsWith("apps/") ||
      relativePath.startsWith("packages/") ||
      relativePath.startsWith("jurisdictions/"))
  ) {
    violations.push(`${relativePath} is JavaScript source; use TypeScript`);
  }

  const content = await readTextFile(sourceFile);
  const commonJsPatterns = [
    /\brequire\s*\(/,
    /\bmodule\s*\.\s*exports\b/,
    /\bexports\s*\./,
  ];
  if (commonJsPatterns.some((pattern) => pattern.test(content))) {
    violations.push(`${relativePath} contains CommonJS syntax`);
  }
}

if (violations.length > 0) {
  console.error("Strict ESM policy violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("Strict ESM policy passed.");
}
