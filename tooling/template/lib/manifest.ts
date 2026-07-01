import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readJson, writeFileAtomic, writeJson } from "./structured-edit.ts";

export const templateDirectory = ".template";
export const templateSchemaVersion = 1;
export const defaultTemplateSource = "senticor-app-fachverfahren-template";
export const defaultTemplateVersion = "0.1.0-rc.1";

export interface TemplateAnswers {
  domain: string;
  displayName: string;
  features: {
    postgres: boolean;
    mockAuth: boolean;
  };
}

export interface TemplateLock {
  schemaVersion: number;
  templateSource: string;
  templateVersion: string;
  templateCommit: string;
  templateDirty?: boolean;
  templateDiffHash?: string;
  generatorVersion: string;
  appliedMigrations: string[];
}

export interface TemplateOwnership {
  paths: Record<string, "replace" | "merge" | "structured-merge" | "consumer">;
}

export const defaultOwnership: TemplateOwnership = {
  paths: {
    "README.md": "merge",
    "SECURITY.md": "merge",
    "CHANGELOG.md": "merge",
    "CODE_OF_CONDUCT.md": "replace",
    "ADOPTERS.md": "consumer",
    ".gitlab-ci.yml": "replace",
    ".gitlab/CODEOWNERS": "consumer",
    ".gitlab/issue_templates/**": "replace",
    ".gitlab/merge_request_templates/**": "replace",
    Dockerfile: "merge",
    "package.json": "structured-merge",
    "pnpm-workspace.yaml": "structured-merge",
    "agent.discovery.json": "replace",
    ".agents/skills/**": "replace",
    "docs/agents/**": "replace",
    "docs/assets/**": "replace",
    "schemas/**": "replace",
    "platform/capabilities.json": "replace",
    "docs/capabilities/**": "replace",
    "sources/registry.yaml": "replace",
    "sources/source-lock.json": "structured-merge",
    "tooling/template/**": "replace",
    "scripts/check-template-*.mjs": "replace",
    "scripts/scaffold-*.mjs": "replace",
    "apps/*/src/domain/**": "consumer",
    "docs/domain/**": "consumer",
    "modules/*/**": "consumer",
  },
};

export function createAnswers({
  domain,
  displayName,
  features = { postgres: true, mockAuth: true },
}: {
  domain: string;
  displayName: string;
  features?: Partial<TemplateAnswers["features"]>;
}): TemplateAnswers {
  return {
    domain,
    displayName,
    features: {
      postgres: features.postgres !== false,
      mockAuth: features.mockAuth !== false,
    },
  };
}

export function createLock({
  templateSource = defaultTemplateSource,
  templateVersion = defaultTemplateVersion,
  templateCommit = "working-tree",
  templateDirty,
  templateDiffHash,
  generatorVersion = defaultTemplateVersion,
  appliedMigrations = [],
}: Partial<TemplateLock> = {}): TemplateLock {
  const lock: TemplateLock = {
    schemaVersion: templateSchemaVersion,
    templateSource,
    templateVersion,
    templateCommit,
    generatorVersion,
    appliedMigrations,
  };
  if (templateDirty !== undefined) {
    lock.templateDirty = templateDirty;
  }
  if (templateDiffHash) {
    lock.templateDiffHash = templateDiffHash;
  }
  return lock;
}

export async function readTemplateAnswers(
  root = process.cwd(),
): Promise<TemplateAnswers> {
  return readJson(join(root, templateDirectory, "answers.json"));
}

export async function readTemplateLock(
  root = process.cwd(),
): Promise<TemplateLock> {
  return readJson(join(root, templateDirectory, "lock.json"));
}

export async function readOwnership(
  root = process.cwd(),
): Promise<TemplateOwnership> {
  const path = join(root, templateDirectory, "ownership.yaml");
  const text = await readFile(path, "utf8");
  return parseOwnershipYaml(text);
}

export async function hasTemplateMetadata(root = process.cwd()) {
  try {
    await access(join(root, templateDirectory, "lock.json"));
    return true;
  } catch {
    return false;
  }
}

export async function writeTemplateMetadata(
  root: string,
  {
    answers,
    lock,
    ownership,
  }: {
    answers: TemplateAnswers;
    lock: TemplateLock;
    ownership: TemplateOwnership;
  },
) {
  const directory = join(root, templateDirectory);
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, "answers.json"), answers);
  await writeJson(join(directory, "lock.json"), lock);
  await writeFileAtomic(
    join(directory, "ownership.yaml"),
    formatOwnershipYaml(ownership ?? defaultOwnership),
  );
  await writeFileAtomic(
    join(directory, "README.md"),
    [
      "# Template Provenance",
      "",
      "Diese Dateien verbinden das Repository mit dem Fachverfahren-Template.",
      "",
      "- `answers.json` enthält stabile Scaffold-Eingaben.",
      "- `lock.json` enthält Template-Version, Commit und angewandte Migrationen.",
      "- `ownership.yaml` steuert, welche Pfade vom Template aktualisiert werden.",
      "",
      "Diese Dateien enthalten keine Zeitstempel oder lokalen Maschinenpfade.",
      "",
    ].join("\n"),
  );
}

export function parseOwnershipYaml(text: string): TemplateOwnership {
  const paths: TemplateOwnership["paths"] = {};
  let inPaths = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths || line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const match = line.match(/^\s{2}"?([^":]+)"?:\s*([a-z-]+)\s*$/);
    if (match) {
      const strategy = match[2] as TemplateOwnership["paths"][string];
      paths[match[1]] = strategy;
    }
  }
  return { paths };
}

export function formatOwnershipYaml(ownership: TemplateOwnership): string {
  const entries = Object.entries(ownership.paths ?? {});
  return [
    "paths:",
    ...entries.map(([path, strategy]) => `  "${path}": ${strategy}`),
    "",
  ].join("\n");
}

export function validateOwnership(ownership: TemplateOwnership): string[] {
  const allowed = new Set(["replace", "merge", "structured-merge", "consumer"]);
  const failures = [];
  for (const [path, strategy] of Object.entries(ownership.paths ?? {})) {
    if (!allowed.has(strategy)) {
      failures.push(`${path} uses unsupported ownership strategy ${strategy}`);
    }
  }
  return failures;
}

export function explainOwnership(
  ownership: TemplateOwnership,
  path: string,
): { pattern: string; strategy: TemplateOwnership["paths"][string] } {
  let bestMatch = undefined;
  for (const [pattern, strategy] of Object.entries(ownership.paths ?? {})) {
    if (matchesOwnershipPattern(pattern, path)) {
      if (!bestMatch || pattern.length > bestMatch.pattern.length) {
        bestMatch = { pattern, strategy };
      }
    }
  }
  return (
    bestMatch ?? {
      pattern: "(default)",
      strategy: "merge" as const,
    }
  );
}

export function matchesOwnershipPattern(
  pattern: string,
  path: string,
): boolean {
  if (pattern === path) {
    return true;
  }
  const segments = pattern.split(/(\*\*|\*)/g).map((segment) => {
    if (segment === "**") {
      return ".*";
    }
    if (segment === "*") {
      return "[^/]+";
    }
    return segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${segments.join("")}$`).test(path);
}
