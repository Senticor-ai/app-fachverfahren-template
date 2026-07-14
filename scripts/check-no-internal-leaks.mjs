#!/usr/bin/env node
// check-no-internal-leaks — OSS-Genericity-Gate: verhindert, dass MAINTAINER-INTERNE Referenzen in die
// KONSUMIERBAREN Teile des Templates lecken (Docs, Konfig, Scaffold-Tooling, ausgelieferte Skills).
//
// Hintergrund: dieses Repo wird als Open Source veröffentlicht. Interne Namen (privates Infra-Repo,
// contributor-lokale Pfade, interne Produktnamen/Ticket-IDs, private Deploy-Hosts) sind in der Vergangenheit in
// Docs/CI/Tooling geleckt. Dieses Gate scannt das gesamte getrackte Repo (ohne die als INTERN isolierten
// Maintainer-Skills) gegen eine Denylist und läuft im precommit:check.
//
// NICHT auf der Denylist (bewusst erlaubt): der npm-Scope `@senticor/*`, der eigene öffentliche Repo-Name
// `Senticor-ai/app-fachverfahren-template`, der generische Integrations-Beispielname `chos-code`, die öffentliche
// OSS-Plattform `gitlab.opencode.de` — das sind legitime Maintainer-/OSS-Identitäten, keine Lecks.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// ROOT-CAUSE für ein ÖFFENTLICHES Repo: ein Anti-Leak-Gate darf die internen Namen, die es sperrt, NICHT im
// Klartext tragen (sonst leakt der Guard selbst). Sensible interne Namen/Hosts/Repos + der zuvor geleakte
// Personen-Handle stehen deshalb NUR als SHA-256 ihrer kleingeschriebenen Form (irreversibel, aber weiterhin
// exakt matchbar). Der Abgleich ist ein case-insensitiver, whitespace-normalisierter EXAKT-Teilstring-Match:
// je Zeile werden alle `len`-langen Fenster gehasht und gegen die Liste geprüft. So bleibt die Regressions-
// Sperre erhalten, ohne einen einzigen internen Namen im Repo zu veröffentlichen.
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const normalize = (line) => line.toLowerCase().replace(/\s+/g, " ");

// Nur Hashes — kein Klartext. `len` = Länge der kleingeschriebenen, whitespace-normalisierten Vorlage.
const DENY_HASH = [
  {
    h: "c9ccaa2f261b15e1b6ed44106a755ff83f580081031f07108b94675d4df1532f",
    len: 26,
    was: "privates Infra-Repo",
  },
  {
    h: "ce13a097dcbc0862f71d6dffaa944105ed515edcea1382e5fbe6c521a1d7236c",
    len: 23,
    was: "privates Produkt-Repo",
  },
  {
    h: "f5484dead651b2bc7df959c24a9971bbca3848623439d5cbd3976fecb2635a97",
    len: 14,
    was: "interner Produktname",
  },
  {
    h: "60623539c0474d6900b6c750d584d7dcfb9a09423fcec45e463f16457023cc1f",
    len: 8,
    was: "interner Produktname",
  },
  {
    h: "8bd17ead619b7353758f20abcdb74bd6530ec4b04fe4b91624c0a9f305c48ba4",
    len: 15,
    was: "interner Prozessname",
  },
  {
    h: "44f41804c443cbe617826aa0b54d7f50043baec722acd4e30253d0ee9a4f6b5a",
    len: 24,
    was: "privater Deploy-Host",
  },
  {
    h: "fa00d9894870f3f8da8dbd972f1f4150094e6bf596154a2b507fd1479da9f412",
    len: 14,
    was: "interne Registry",
  },
  {
    h: "ad71e2b9ac88ee74b1edca1fc21fdf19ccd22782fee70efa67b7b8a50c3af939",
    len: 16,
    was: "interner Runner-Pod",
  },
  {
    h: "e4d3e57453a8f7ca824a2f07dc36941f3b8ff147224486b763086e6bb921c819",
    len: 8,
    was: "interner Produktname",
  },
  {
    h: "1a8626f146b1c7c8fe8c056ee11a0ab71ce923f25368f90c1a3b5d5cf7480a87",
    len: 15,
    was: "interner Produktname",
  },
  {
    h: "23ef567d26890c93899ba8668d64a8e310db6b96234a4199efea3b09b3e2e724",
    len: 10,
    was: "interner Deploy-Host",
  },
  {
    h: "6ff75ebbec747aa6087f8f71765e435e66a50c2d66a25c2fceaa760226924bb0",
    len: 14,
    was: "realer Einzelperson-Handle",
  },
];

// Generische FORMAT-Muster (keine Geheimnisse) bleiben als Klartext-Regex: contributor-lokale Pfade und
// Ticket-Id-Formen. `chos-code` selbst ist als öffentlicher Integrations-Beispielname bewusst erlaubt.
const DENY_RE = [
  { re: /\/home\/coder\b/i, was: "contributor-lokaler Absolutpfad" },
  { re: /\/\.codex\b/i, was: "contributor-lokaler Toolchain-Pfad" },
  { re: /CHOS-CODE(-Innovation)?#\d+/i, was: "interne Ticket-Id" },
  { re: /\binfra#\d+/i, was: "interne Ticket-Id" },
  { re: /OpenRouter/i, was: "interne CI-Kostenmechanik" },
];

// Diese Pfade sind als INTERN isoliert (nicht an Konsumenten ausgeliefert) — sie dürfen interne Namen tragen.
const ALLOW_PREFIXES = [
  ".agents/skills/deutschland-plattform-anforderungen/",
  ".claude/skills/deutschland-plattform-anforderungen/",
  "scripts/check-no-internal-leaks.mjs", // dieses Gate selbst (nur Hashes + generische Format-Muster)
  // Maintainer-interne Deploy-/Demo-Consumer-Infrastruktur (Codesphere-Pipeline, origin/main): sie
  // referenziert legitim das private Codesphere-Deploy-Ziel und wird NICHT an Konsumenten ausgeliefert
  // (repositoryOnlyPaths). Für den öffentlichen OSS-Push separat via oss-public scrubben/maskieren.
  ".github/workflows/deploy-demo-consumer.yml",
  ".github/workflows/mirror-gitlab.yml",
  "ci.yml",
  "scripts/codesphere-",
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
    const raw = lines[i];
    // Generische Format-Muster gegen die Rohzeile.
    for (const { re, was } of DENY_RE) {
      if (re.test(raw)) {
        violations.push({
          file,
          line: i + 1,
          was,
          snippet: raw.trim().slice(0, 100),
        });
      }
    }
    // Hash-Denylist: exakter, case-insensitiver Teilstring-Match über whitespace-normalisierte Zeile.
    const norm = normalize(raw);
    for (const { h, len, was } of DENY_HASH) {
      for (let j = 0; j + len <= norm.length; j++) {
        if (sha256(norm.slice(j, j + len)) === h) {
          violations.push({
            file,
            line: i + 1,
            was,
            snippet: "[interner Treffer maskiert]",
          });
          break;
        }
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
