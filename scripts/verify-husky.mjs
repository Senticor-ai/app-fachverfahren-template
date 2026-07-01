#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

if (process.env.CI === "true") {
  console.log("Skipping Husky hook verification in CI.");
  process.exit(0);
}

function fail(message) {
  console.error(`husky verify failed: ${message}`);
  process.exit(1);
}

function gitConfig(name) {
  const result = spawnSync("git", ["config", "--get", name], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout.trim().replaceAll("\\", "/");
}

if (!existsSync(".git")) {
  fail("not running inside a git checkout");
}

const hooksPath = gitConfig("core.hooksPath");
if (hooksPath !== ".husky/_") {
  fail(
    `core.hooksPath is '${hooksPath || "<unset>"}', expected '.husky/_'. Run pnpm install.`,
  );
}

const hooks = [
  {
    path: ".husky/pre-commit",
    expected: "pnpm run check:precommit",
  },
  {
    path: ".husky/commit-msg",
    expected: "validate-commit-msg.sh",
  },
  {
    path: ".husky/pre-push",
    expected: "pnpm run check:push",
  },
];

for (const { path: hookPath, expected } of hooks) {
  if (!existsSync(hookPath)) {
    fail(`${hookPath} is missing`);
  }

  if (process.platform !== "win32" && (statSync(hookPath).mode & 0o111) === 0) {
    fail(`${hookPath} is not executable`);
  }

  const hook = readFileSync(hookPath, "utf8");
  if (!hook.includes(expected)) {
    fail(`${hookPath} must include ${expected}`);
  }
}

console.log(
  "Husky hooks are installed and wired: pre-commit, commit-msg, pre-push.",
);
