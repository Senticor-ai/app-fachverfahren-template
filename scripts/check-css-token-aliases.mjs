import { join, relative } from "node:path";
import { istDokumentationsNutzlast } from "./lib/doku-nutzlast.ts";
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
const scannedExtensions = [".css", ".ts", ".tsx"];
const exclusions = await loadSourceExclusions(root);
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
  const files = await collectSourceFiles(join(root, sourceRoot), {
    extensions: scannedExtensions,
    exclusions,
    optional: true,
  });

  for (const file of files) {
    const relativePath = display(file);
    const lines = (await readTextFile(file)).split(/\r?\n/);

    lines.forEach((line, index) => {
      if (isCustomPropertyDefinition(line) || istDokumentationsNutzlast(line)) {
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
