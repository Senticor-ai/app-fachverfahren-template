#!/usr/bin/env node
// sync-claude-skill-shims — hält die Claude-Kompatibilitäts-Shims (`.claude/skills/<skill>/SKILL.md`) mit den
// KANONISCHEN Agenten-Skills (`.agents/skills/<skill>/SKILL.md`) in Deckung, damit `.claude` 0-Wartung bleibt.
//
// Hintergrund: die kanonische Wahrheit sind `.agents/skills/*`; `.claude/skills/*` sind nur dünne Zeiger für
// Claude-orientierte Werkzeuge. `validateSkillShims` (im Template-CLI) ERZWINGT für jeden kanonischen Skill einen
// Shim, der auf `.agents/skills/<skill>/SKILL.md` zeigt — prüft aber nur, generiert nicht. Dieses standalone Skript
// ist die Schreib-Seite: legt fehlende Shims an und meldet verwaiste. Es ist BEWUSST nicht im Push-Gate verdrahtet
// (kein Zwang, risikofrei) — der Maintainer ruft es nach Anlegen/Umbenennen eines Skills auf.
//
// Design-Vertrag:
//   • Bestehende Shims werden NIE überschrieben (hand-kuratierte Titel wie „Backend mit Fastify" bleiben erhalten) —
//     außer ihnen fehlt die kanonische Zeiger-Zeile (dann werden sie minimal repariert).
//   • Verwaiste Shims (kein kanonischer Skill mehr) werden nur GEMELDET, nicht gelöscht (Mensch entscheidet) —
//     außer mit `--prune`.
//   • `--check` schreibt nichts und endet mit Exit 1, wenn ein Shim fehlt/kaputt ist (spiegelt validateSkillShims,
//     nutzbar in CI ohne das volle Template-CLI).
//
// Aufruf:  node scripts/sync-claude-skill-shims.mjs [--check] [--prune]
import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const canonicalDir = join(root, ".agents/skills");
const shimDir = join(root, ".claude/skills");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const prune = args.has("--prune");

async function listSkillNames(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

// Titel für einen NEU anzulegenden Shim aus dem kanonischen Skill ableiten. Bestehende Shims werden nie angefasst,
// daher greift dies nur für frisch hinzugekommene Skills.
const ACRONYMS = new Map([
  ["ui", "UI"],
  ["ux", "UX"],
  ["sdk", "SDK"],
  ["bitv", "BITV"],
  ["ts", "TS"],
  ["ci", "CI"],
  ["pwa", "PWA"],
]);
function titelAus(skill, canonicalFrontmatterName) {
  const slug = canonicalFrontmatterName || skill;
  return slug
    .split("-")
    .map((w) => ACRONYMS.get(w) ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

async function canonicalName(skill) {
  try {
    const text = await readFile(join(canonicalDir, skill, "SKILL.md"), "utf8");
    const m = text.match(/^name:\s*(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

const pointer = (skill) => `.agents/skills/${skill}/SKILL.md`;
const shimBody = (skill, titel) =>
  `# ${titel}\n\nCanonical skill: \`${pointer(skill)}\`.\n`;

const canonical = await listSkillNames(canonicalDir);
const shims = await listSkillNames(shimDir);
const shimSet = new Set(shims);
const canonicalSet = new Set(canonical);

const created = [];
const repaired = [];
const orphans = shims.filter((s) => !canonicalSet.has(s));
const problems = []; // für --check

for (const skill of canonical) {
  const shimPath = join(shimDir, skill, "SKILL.md");
  if (!shimSet.has(skill)) {
    if (checkOnly) {
      problems.push(`missing .claude shim for skill ${skill}`);
      continue;
    }
    const titel = titelAus(skill, await canonicalName(skill));
    await mkdir(join(shimDir, skill), { recursive: true });
    await writeFile(shimPath, shimBody(skill, titel), "utf8");
    created.push(skill);
    continue;
  }
  // Shim existiert — nur reparieren, wenn die kanonische Zeiger-Zeile fehlt (Titel bleibt unangetastet).
  let text;
  try {
    text = await readFile(shimPath, "utf8");
  } catch {
    text = "";
  }
  if (!text.includes(pointer(skill))) {
    if (checkOnly) {
      problems.push(
        `.claude/skills/${skill}/SKILL.md does not point to canonical skill`,
      );
      continue;
    }
    const titel =
      text.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      titelAus(skill, await canonicalName(skill));
    await writeFile(shimPath, shimBody(skill, titel), "utf8");
    repaired.push(skill);
  }
}

if (checkOnly) {
  if (problems.length > 0) {
    console.error(
      "claude-skill-shims: Shims fehlen oder zeigen nicht auf den kanonischen Skill:",
    );
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `claude-skill-shims ok — ${canonical.length} kanonische Skills, alle Shims vorhanden und korrekt.`,
  );
  process.exit(0);
}

for (const skill of orphans) {
  if (prune) {
    await rm(join(shimDir, skill), { recursive: true, force: true });
  }
}

const parts = [];
if (created.length)
  parts.push(`${created.length} angelegt (${created.join(", ")})`);
if (repaired.length)
  parts.push(`${repaired.length} repariert (${repaired.join(", ")})`);
if (orphans.length)
  parts.push(
    prune
      ? `${orphans.length} verwaiste entfernt (${orphans.join(", ")})`
      : `${orphans.length} verwaist — kein kanonischer Skill (${orphans.join(", ")}); mit --prune entfernen`,
  );
if (parts.length === 0) {
  console.log(
    `claude-skill-shims: nichts zu tun — ${canonical.length} Skills, alle Shims aktuell.`,
  );
} else {
  console.log(`claude-skill-shims: ${parts.join("; ")}.`);
}
