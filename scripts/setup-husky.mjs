import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (process.env["HUSKY"] === "0") {
  console.log("husky setup skipped because HUSKY=0");
  process.exit(0);
}

if (!existsSync(".git")) {
  console.log("husky setup skipped because .git is not present");
  process.exit(0);
}

const result = spawnSync("husky", [], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
