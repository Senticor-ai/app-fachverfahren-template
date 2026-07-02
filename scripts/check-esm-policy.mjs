import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "dist-server",
  "node_modules",
]);

const packageRoots = ["apps", "packages", "jurisdictions"];
const sourceRoots = ["apps", "packages", "jurisdictions", "modules", "scripts"];
// Generierte JS-Assets (z. B. ein MSW-Worker) hier allowlisten, sobald sie real existieren.
const generatedJavaScriptAssets = new Set([]);
// Legitime CommonJS-Interop-Punkte, die das Kit BEWUSST als .cjs veroeffentlicht (oeffentlicher package.json-Export):
// das Tailwind-v3-Preset wird von Consumer-Apps in ihre CommonJS-tailwind.config.cjs eingebunden — CommonJS ist hier
// der KORREKTE, notwendige Interop-Punkt (ein ESM-Preset liesse sich dort nicht einbinden). Scoped Ausnahme.
const allowedCommonJsAssets = new Set([
  "packages/fachverfahren-kit/tailwind-preset.cjs",
]);

async function directoryExists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(startDirectory, predicate) {
  if (!(await directoryExists(startDirectory))) {
    return [];
  }

  const entries = await readdir(startDirectory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(
          ...(await collectFiles(join(startDirectory, entry.name), predicate)),
        );
      }
      continue;
    }

    const path = join(startDirectory, entry.name);
    if (predicate(path)) {
      files.push(path);
    }
  }

  return files;
}

async function collectPackageJsonFiles() {
  const files = [join(root, "package.json")];
  for (const workspaceRoot of packageRoots) {
    files.push(
      ...(await collectFiles(join(root, workspaceRoot), (path) =>
        path.endsWith("package.json"),
      )),
    );
  }
  return files;
}

async function collectSourceFiles() {
  const files = [];
  for (const sourceRoot of sourceRoots) {
    files.push(
      ...(await collectFiles(join(root, sourceRoot), (path) =>
        [".ts", ".tsx", ".js", ".mjs", ".cjs", ".cts", ".mts"].includes(
          extname(path),
        ),
      )),
    );
  }
  return files;
}

function display(path) {
  return relative(root, path);
}

const violations = [];

for (const packageJsonPath of await collectPackageJsonFiles()) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  if (packageJson.type !== "module") {
    violations.push(
      `${display(packageJsonPath)} must declare "type": "module"`,
    );
  }
}

for (const sourceFile of await collectSourceFiles()) {
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

  const content = await readFile(sourceFile, "utf8");
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
