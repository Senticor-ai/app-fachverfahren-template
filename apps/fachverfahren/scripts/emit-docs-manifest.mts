// emit-docs-manifest — sammelt die KOMPLETTE Repo-Doku (README · AGENTS · CONTRIBUTING · docs/**/*.md ·
// .agents/skills/*/SKILL.md) in EINE generierte Manifest-Datei, die das In-App Doc-Wiki (/hilfe) rendert.
// Robust statt Vite-`?raw`-outside-root: der Emit schreibt eine .generated.ts IN src/ (dev == build identisch).
// Muster wie emit-contract.mts. Regenerieren nach Doku-Aenderung: `pnpm --filter @senticor/fachverfahren emit:docs`.
// Determinismus: stabile Sortierung nach Pfad; kein Date/Random.
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..", "..", ".."); // apps/fachverfahren/scripts -> Repo-Wurzel
const outFile = join(
  scriptDir,
  "..",
  "src",
  "docs",
  "docs-manifest.generated.ts",
);

interface DocEntry {
  id: string;
  title: string;
  category: string;
  path: string;
  content: string;
}

/** Alle *.md unter dir (rekursiv), Pfade relativ zur Repo-Wurzel, stabil sortiert. */
async function markdownUnter(dir: string): Promise<string[]> {
  const treffer: string[] = [];
  async function walk(current: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return; // Verzeichnis fehlt (z.B. optionales docs/) -> ueberspringen
    }
    for (const entry of entries) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        await walk(abs);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        treffer.push(relative(repoRoot, abs));
      }
    }
  }
  await walk(dir);
  return treffer.sort((a, b) => a.localeCompare(b));
}

/** Erste `# `-Ueberschrift als Titel, sonst der Dateiname. */
function titelVon(content: string, relPath: string): string {
  for (const line of content.split("\n")) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m?.[1]) return m[1];
  }
  const base = relPath.split("/").pop() ?? relPath;
  return base.replace(/\.md$/, "");
}

/** Kategorie aus dem Pfad: Wurzel-Dateien -> „Ueberblick"; docs/<sub>/… -> <Sub>; Skills -> „Skills". */
function kategorieVon(relPath: string): string {
  if (relPath.startsWith(".agents/skills/")) return "Skills";
  const teile = relPath.split("/");
  if (teile[0] === "docs" && teile.length > 2) {
    const sub = teile[1] ?? "docs";
    return `Docs · ${sub.charAt(0).toUpperCase()}${sub.slice(1)}`;
  }
  if (teile[0] === "docs") return "Docs";
  return "Ueberblick";
}

function idVon(relPath: string): string {
  return relPath
    .replace(/\.md$/, "")
    .replace(/^\.agents\/skills\//, "skills/")
    .replace(/\/SKILL$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
}

async function main(): Promise<void> {
  const wurzelDateien = ["README.md", "AGENTS.md", "CONTRIBUTING.md"];
  const relPaths: string[] = [];
  for (const f of wurzelDateien) {
    try {
      await readFile(join(repoRoot, f), "utf8");
      relPaths.push(f);
    } catch {
      // fehlt -> ueberspringen
    }
  }
  // KOMPLETTE Doku inkl. docs/examples/** (Beispiel-Verfahren als Referenz). Die Beispiele tragen
  // modul-spezifisches Vokabular (z.B. Hundesteuer) — das ist DOKUMENTATION, kein Runtime-Domaenencode;
  // der Domaenen-Leckage-Gate (validateSourceRegistry) nimmt dieses generierte Doku-Aggregat bewusst aus.
  relPaths.push(...(await markdownUnter(join(repoRoot, "docs"))));
  relPaths.push(...(await markdownUnter(join(repoRoot, ".agents", "skills"))));

  const entries: DocEntry[] = [];
  for (const relPath of relPaths) {
    const content = await readFile(join(repoRoot, relPath), "utf8");
    entries.push({
      id: idVon(relPath),
      title: titelVon(content, relPath),
      category: kategorieVon(relPath),
      path: relPath,
      content,
    });
  }

  const body =
    "// GENERIERT von scripts/emit-docs-manifest.mts — NICHT von Hand editieren.\n" +
    "// Regenerieren: pnpm --filter @senticor/fachverfahren emit:docs\n" +
    "// Das In-App Doc-Wiki (/hilfe) rendert dieses Manifest. Quelle: README/AGENTS/CONTRIBUTING + docs/ + Skills.\n\n" +
    "export interface DocEntry {\n" +
    "  id: string;\n" +
    "  title: string;\n" +
    "  category: string;\n" +
    "  path: string;\n" +
    "  content: string;\n" +
    "}\n\n" +
    `export const DOCS: DocEntry[] = ${JSON.stringify(entries, null, 2)};\n`;

  await writeFile(outFile, body, "utf8");
  process.stdout.write(
    `docs-manifest: ${entries.length} Dokumente -> ${relative(repoRoot, outFile)}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`emit-docs-manifest fehlgeschlagen: ${String(error)}\n`);
  process.exitCode = 1;
});
