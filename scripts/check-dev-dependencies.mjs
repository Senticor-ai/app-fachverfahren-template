import { accessSync, constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(repoRoot, "apps/fachverfahren-template");
const requiredBinaries = process.argv.slice(2);

if (requiredBinaries.length === 0) {
  console.error(
    "No development binaries were provided for the dependency check.",
  );
  process.exit(1);
}

const missingBinaries = requiredBinaries.filter((binary) => !hasBinary(binary));

if (missingBinaries.length > 0) {
  console.error(
    [
      `Missing development binary: ${missingBinaries.join(", ")}`,
      "Run `pnpm install` from the repository root before starting the dev server.",
      "If dependencies were installed with production-only settings, reinstall without `--prod`.",
    ].join("\n"),
  );
  process.exit(1);
}

function hasBinary(binary) {
  return [
    join(repoRoot, "node_modules/.bin", binary),
    join(appRoot, "node_modules/.bin", binary),
  ].some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}
