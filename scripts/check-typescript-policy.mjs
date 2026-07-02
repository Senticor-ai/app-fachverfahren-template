import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";

const root = process.cwd();
const implementationRoots = ["apps", "packages", "jurisdictions", "modules"];
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
const generatedJavaScriptAssets = new Set([
  "apps/fachverfahren/public/preview-reporter.js",
  "apps/fachverfahren/public/service-worker.js",
  // legitimer CommonJS-Interop (kein TS): Tailwind-v3-Preset, oeffentlicher package.json-Export, von Consumer-Apps eingebunden
  "packages/fachverfahren-kit/tailwind-preset.cjs",
]);
const forbiddenJavaScriptExtensions = new Set([".js", ".jsx", ".cjs", ".mjs"]);

async function directoryExists(path) {
  try {
    await readdir(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(startDirectory) {
  if (!(await directoryExists(startDirectory))) {
    return [];
  }

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

    files.push(path);
  }

  return files;
}

function display(path) {
  return relative(root, path);
}

const violations = [];

for (const implementationRoot of implementationRoots) {
  const files = await collectFiles(join(root, implementationRoot));

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

    const content = await readFile(file, "utf8");
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
