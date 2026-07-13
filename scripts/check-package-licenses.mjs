#!/usr/bin/env node
// check-package-licenses — OSS-Lizenz-Invariante (EUPL-1.2). Jedes getrackte Workspace-package.json MUSS
// ein `license: "EUPL-1.2"` tragen; jedes PUBLIZIERBARE Paket (private !== true) muss zusätzlich
// `publishConfig.access: "public"` setzen (scoped @senticor ist sonst restricted) UND eine paket-eigene
// LICENSE-Datei mitliefern (npm packt die Repo-Root-LICENSE NICHT in Sub-Tarballs → EUPL Art. 5). So kann
// weder ein lizenzloses noch ein versehentlich-restricted/-öffentliches Paket zurückrollen.
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

const files = execFileSync(
  "git",
  ["ls-files", "*/package.json", "package.json"],
  {
    encoding: "utf8",
  },
)
  .split("\n")
  .filter(Boolean);

const problems = [];
for (const f of files) {
  const pkg = JSON.parse(readFileSync(f, "utf8"));
  if (pkg.license !== "EUPL-1.2") {
    problems.push(
      `${f}: license fehlt oder ≠ "EUPL-1.2" (ist: ${JSON.stringify(pkg.license ?? null)})`,
    );
  }
  const publishable = pkg.private !== true;
  if (publishable) {
    if (pkg.publishConfig?.access !== "public") {
      problems.push(
        `${f}: publizierbar (private ≠ true), aber publishConfig.access ≠ "public" — würde restricted/ohne Absicht publizieren`,
      );
    }
    if (!existsSync(join(dirname(f), "LICENSE"))) {
      problems.push(
        `${f}: publizierbar, aber keine paket-eigene LICENSE-Datei neben package.json`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("Lizenz-Invariante verletzt:");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\nEntweder license/publishConfig ergänzen ODER das Paket mit "private": true als nicht-publizierbar markieren.',
  );
  process.exit(1);
}
console.log(
  `package-licenses ok — ${files.length} package.json geprüft (EUPL-1.2, Publish-Metadaten).`,
);
