import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { explainOwnership } from "./manifest.ts";
import { readJson, writeJson, type PackageJson } from "./structured-edit.ts";

const managedCandidateFiles = [
  ".gitlab-ci.yml",
  "Dockerfile",
  "package.json",
  "pnpm-workspace.yaml",
  ".env.local.example",
  "agent.discovery.json",
  "docs/README.md",
  "docs/agents/bootstrap.md",
  "docs/compliance/evidence.md",
  "docs/reference/backend-fastify.md",
  "docs/reference/db-migrations.md",
  "docs/reference/runtime-configuration.md",
  "docs/reference/storybook.md",
  "docs/reference/test-driven-development.md",
  "docs/ux-ui/fachverfahren-ux-contract.md",
  "docs/ux-ui/template-conformance.md",
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

export async function planOwnershipUpdate({ root, incomingRoot, ownership }) {
  const changes = [];
  const conflicts = [];

  for (const path of managedCandidateFiles) {
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
