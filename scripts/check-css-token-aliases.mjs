import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = ["apps", "packages", "modules"];
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
const componentTokens = new Set([
  "background",
  "foreground",
  "surface",
  "muted",
  "muted-foreground",
  "border",
  "input",
  "primary",
  "primary-foreground",
  "ring",
  "destructive",
  "status-ok",
  "status-ok-soft",
  "status-warn",
  "status-warn-soft",
  "status-block",
  "status-block-soft",
  "status-err",
  "status-info",
  "status-info-soft",
  "status-muted",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
]);

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

    if (scannedExtensions.has(extname(path))) {
      files.push(path);
    }
  }

  return files;
}

function display(path) {
  return relative(root, path);
}

function isCustomPropertyDefinition(line) {
  return /^\s*--[-a-z0-9]+:\s*/i.test(line);
}

function isWrappedHslUse(line, token) {
  return line.includes(`hsl(var(--${token})`);
}

const violations = [];

for (const sourceRoot of sourceRoots) {
  const files = await collectFiles(join(root, sourceRoot));

  for (const file of files) {
    const relativePath = display(file);
    const lines = (await readFile(file, "utf8")).split(/\r?\n/);

    lines.forEach((line, index) => {
      if (isCustomPropertyDefinition(line)) {
        return;
      }

      for (const match of line.matchAll(/var\(--([a-z0-9-]+)\)/gi)) {
        const token = match[1];
        if (componentTokens.has(token) && !isWrappedHslUse(line, token)) {
          violations.push(
            `${relativePath}:${index + 1} uses var(--${token}) directly; use a --color-* alias or hsl(var(--${token}))`,
          );
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error("CSS token alias violations:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
} else {
  console.log("CSS token alias check passed.");
}
