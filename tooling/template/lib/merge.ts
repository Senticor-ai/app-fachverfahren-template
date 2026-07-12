import { copyFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { explainOwnership, matchesOwnershipPattern } from "./manifest.ts";
import { readJson, writeJson, type PackageJson } from "./structured-edit.ts";

const managedCandidateFiles = [
  ".gitlab-ci.yml",
  "ci.yml",
  "scripts/codesphere-toolchain.sh",
  "Dockerfile",
  "package.json",
  "pnpm-workspace.yaml",
  ".env.local.example",
  "agent.discovery.json",
  "docs/agents/bootstrap.md",
  "docs/agents/codex.md",
  "docs/agents/gemini.md",
  "docs/agents/opencode.md",
  "platform/capabilities.json",
  "schemas/agent-discovery.schema.json",
  "schemas/agent-run-report.schema.json",
  "schemas/app-spec.schema.json",
  "schemas/module-contract.schema.json",
  "schemas/platform-capabilities.schema.json",
  "schemas/source-registry.schema.json",
  "sources/registry.yaml",
  "sources/source-lock.json",
  ".agents/skills/fachverfahren-app/SKILL.md",
  ".agents/skills/ux-ui/SKILL.md",
  "tooling/template/cli.ts",
  "tooling/template/lib/agent-platform.ts",
  "tooling/template/lib/command.ts",
  "tooling/template/lib/git.ts",
  "tooling/template/lib/manifest.ts",
  "tooling/template/lib/merge.ts",
  "tooling/template/lib/render.ts",
  "tooling/template/lib/report.ts",
  "tooling/template/lib/structured-edit.ts",
];

export async function planOwnershipUpdate({
  root,
  incomingRoot,
  ownership,
  extraOwnershipPaths = [],
}) {
  const changes = [];
  const conflicts = [];

  // Ownership-Pfade, die erst die ZIEL-Quelle kennt (z.B. frisch gemergte Defaults), stehen
  // nicht in der hartkodierten Kandidatenliste dieser (ggf. älteren) CLI — ohne sie würde der
  // Eintrag zwar persistiert, die Datei aber nie kopiert (Codex-Review PR #26, Runde 2).
  // Glob-Muster werden gegen den gerenderten Incoming-Baum expandiert.
  const candidatePaths = [
    ...new Set([
      ...managedCandidateFiles,
      ...(await expandOwnershipPaths(incomingRoot, extraOwnershipPaths)),
    ]),
  ];

  for (const path of candidatePaths) {
    const ownershipMatch = explainOwnership(ownership, path);
    if (ownershipMatch.strategy === "consumer") {
      continue;
    }
    const actualPath = join(root, path);
    const incomingPath = join(incomingRoot, path);
    const actual = await readOptional(actualPath);
    const incoming = await readOptional(incomingPath);
    if (incoming === undefined || actual === incoming) {
      continue;
    }

    if (
      ownershipMatch.strategy === "structured-merge" &&
      path === "package.json"
    ) {
      changes.push({
        path,
        strategy: ownershipMatch.strategy,
        action: "structured-merge",
      });
      continue;
    }

    if (ownershipMatch.strategy === "replace") {
      changes.push({
        path,
        strategy: ownershipMatch.strategy,
        action: "replace",
      });
      continue;
    }

    conflicts.push({
      path,
      strategy: ownershipMatch.strategy,
      reason: "local file differs from rendered incoming template",
    });
  }

  return { changes, conflicts };
}

export async function applyOwnershipUpdate({ root, incomingRoot, changes }) {
  const backups = [];
  try {
    for (const change of changes) {
      const targetPath = join(root, change.path);
      const backupPath = `${targetPath}.template-backup-${process.pid}`;
      const existing = await readOptional(targetPath);
      if (existing !== undefined) {
        await copyFile(targetPath, backupPath);
        backups.push({ targetPath, backupPath });
      }

      if (
        change.action === "structured-merge" &&
        change.path === "package.json"
      ) {
        await mergePackageJson(targetPath, join(incomingRoot, change.path));
      } else {
        await mkdir(dirname(targetPath), { recursive: true });
        await copyFile(join(incomingRoot, change.path), targetPath);
      }
    }
  } catch (error) {
    for (const backup of backups.reverse()) {
      await copyFile(backup.backupPath, backup.targetPath).catch(() => {});
    }
    throw error;
  } finally {
    for (const backup of backups) {
      await rm(backup.backupPath, { force: true }).catch(() => {});
    }
  }
}

async function mergePackageJson(targetPath: string, incomingPath: string) {
  const actual = await readJson<PackageJson>(targetPath);
  const incoming = await readJson<PackageJson>(incomingPath);
  actual.packageManager = incoming.packageManager;
  actual.engines = incoming.engines;
  actual.scripts = {
    ...(actual.scripts ?? {}),
    ...(incoming.scripts ?? {}),
  };
  actual.devDependencies = {
    ...(actual.devDependencies ?? {}),
    ...(incoming.devDependencies ?? {}),
  };
  await writeJson(targetPath, actual);
}

async function expandOwnershipPaths(
  incomingRoot: string,
  ownershipPaths: string[],
): Promise<string[]> {
  const exact = ownershipPaths.filter((path) => !path.includes("*"));
  const patterns = ownershipPaths.filter((path) => path.includes("*"));
  if (patterns.length === 0) {
    return exact;
  }
  const incomingFiles = await listFilesRecursively(incomingRoot, incomingRoot);
  return [
    ...exact,
    ...incomingFiles.filter((file) =>
      patterns.some((pattern) => matchesOwnershipPattern(pattern, file)),
    ),
  ];
}

async function listFilesRecursively(
  root: string,
  directory: string,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(root, path)));
    } else {
      files.push(relative(root, path).split("\\").join("/"));
    }
  }
  return files;
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

export function displayChange(change, root = process.cwd()) {
  return `${relative(root, join(root, change.path))} (${change.action})`;
}
