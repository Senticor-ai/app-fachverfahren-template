import { accessSync, constants } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = join(repoRoot, "apps/fachverfahren-template");
const viteEntrypoints = [
  join(appRoot, "node_modules/vite/bin/vite.js"),
  join(repoRoot, "node_modules/vite/bin/vite.js"),
];

const viteEntrypoint = viteEntrypoints.find((candidate) => {
  try {
    accessSync(candidate, constants.R_OK);
    return true;
  } catch {
    return false;
  }
});

if (!viteEntrypoint) {
  console.error(
    [
      "Missing Vite dependency.",
      "Run `pnpm install` from the repository root before starting the dev server.",
      "If dependencies were installed with production-only settings, reinstall without `--prod`.",
    ].join("\n"),
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [viteEntrypoint, ...process.argv.slice(2)],
  {
    cwd: appRoot,
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
