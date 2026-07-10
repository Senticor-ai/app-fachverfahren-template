#!/usr/bin/env node
// check-no-internal-leaks — OSS-Genericity-Gate: verhindert, dass MAINTAINER-INTERNE Referenzen in die
// KONSUMIERBAREN Teile des Templates lecken (Docs, Konfig, Scaffold-Tooling, ausgelieferte Skills).
//
// Hintergrund: der govtech-SDK-Bundle hat einen eigenen scrub-check, der aber NUR den SDK-Ordner scannt. Interne
// Namen (privates Infra-Repo, contributor-lokale Pfade, interne Produktnamen/Ticket-IDs, private Deploy-Hosts) sind
// dennoch in Docs/CI/Tooling geleckt. Dieses Gate scannt das KONSUMIERBARE Repo (ohne die als INTERN isolierten
// Maintainer-Skills + deren Publish-Workflow) gegen eine Denylist.
//
// NICHT auf der Denylist (bewusst erlaubt): der npm-Scope `@senticor/*`, der eigene öffentliche Repo-Name
// `Senticor-ai/app-fachverfahren-template`, der generische Integrations-Beispielname `chos-code`, die öffentliche
// OSS-Plattform `gitlab.opencode.de` — das sind legitime Maintainer-/OSS-Identitäten, keine Lecks.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Interne/private Muster, die NIE im konsumierbaren Teil stehen dürfen (Regex, case-insensitive).
const DENY = [
  { re: /Senticor-ai\/infrastructure/i, was: "privates Infra-Repo" },
  { re: /Senticor-ai\/gtc-builder/i, was: "privates Produkt-Repo" },
  { re: /\/home\/coder\b/i, was: "contributor-lokaler Absolutpfad" },
  { re: /\/\.codex\b/i, was: "contributor-lokaler Toolchain-Pfad" },
  { re: /cognitive-hive/i, was: "interner Produktname" },
  { re: /CHOS-BMS/i, was: "interner Produktname" },
  { re: /CHOS-Durchstich/i, was: "interner Prozessname" },
  { re: /CHOS-CODE(-Innovation)?#\d+/i, was: "interne Ticket-Id" },
  { re: /\binfra#\d+/i, was: "interne Ticket-Id" },
  { re: /vendorportal\.gtplatforms/i, was: "privater Deploy-Host" },
  { re: /STACKIT\s+Harbor/i, was: "interne Registry" },
  { re: /OpenRouter/i, was: "interne CI-Kostenmechanik" },
  { re: /chos-code-runner/i, was: "interner Runner-Pod" },
  // Regressions-Sperre für einen zuvor geleakten realen Einzelperson-Handle (Reflection-Loop-Fund in
  // .gitlab/CODEOWNERS). Personennamen lassen sich nicht generisch matchen — dieser bekannte Handle wird
  // gezielt gesperrt, damit der Fix nicht zurückrollt. Neue Namens-Lecks fängt der Review, nicht dieses Muster.
  { re: /\bwolfgangihloff\b/i, was: "realer Einzelperson-Handle" },
];

// Diese Pfade sind als INTERN isoliert (nicht an Konsumenten ausgeliefert) — sie dürfen interne Namen tragen.
const ALLOW_PREFIXES = [
  ".agents/skills/govtech-deutschland-sdk/",
  ".claude/skills/govtech-deutschland-sdk/",
  ".agents/skills/deutschland-plattform-anforderungen/",
  ".claude/skills/deutschland-plattform-anforderungen/",
  "govtech-deutschland-sdk/",
  ".github/workflows/publish-govtech-sdk.yml",
  "scripts/check-no-internal-leaks.mjs", // dieses Gate selbst (enthält die Muster)
];

// Bekannte konfigrelevante Dateien OHNE Endung, die dennoch gescannt werden müssen (sonst schlüpft ein Leck
// durch den Endungs-Filter — genau so blieb der CODEOWNERS-Handle zunächst unentdeckt).
const SCANNED_EXTENSIONLESS = new Set([
  "CODEOWNERS",
  "Dockerfile",
  "Makefile",
  "Procfile",
]);
const basename = (f) => f.slice(f.lastIndexOf("/") + 1);

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter(
    (f) =>
      /\.(ts|tsx|md|json|mjs|cjs|js|sh|ya?ml|txt|toml)$/i.test(f) ||
      SCANNED_EXTENSIONLESS.has(basename(f)),
  )
  .filter((f) => !ALLOW_PREFIXES.some((p) => f === p || f.startsWith(p)));

const violations = [];
for (const file of trackedFiles) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    continue;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const { re, was } of DENY) {
      if (re.test(lines[i])) {
        violations.push({
          file,
          line: i + 1,
          was,
          snippet: lines[i].trim().slice(0, 100),
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    "OSS-Genericity-Leck: interne Referenzen in konsumierbaren Teilen gefunden:",
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} — ${v.was}: ${v.snippet}`);
  }
  console.error(
    "\nEntferne die interne Referenz oder verschiebe den Inhalt in einen isolierten internen Maintainer-Skill.",
  );
  process.exit(1);
}
console.log(
  `no-internal-leaks ok — ${trackedFiles.length} konsumierbare Dateien geprüft, keine internen Lecks.`,
);
