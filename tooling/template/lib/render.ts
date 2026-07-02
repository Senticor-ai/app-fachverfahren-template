import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { getGitCommit, getGitDiffHash, getGitShortStatus } from "./git.ts";
import {
  createAnswers,
  createLock,
  defaultOwnership,
  writeTemplateMetadata,
} from "./manifest.ts";
import { readJson, type PackageJson } from "./structured-edit.ts";

interface RenderDomainAppOptions {
  domain: string;
  displayName: string;
  force?: boolean;
  allowDirty?: boolean;
  allowExistingEmpty?: boolean;
  features?: {
    postgres?: boolean;
    mockAuth?: boolean;
  };
}

const ignoredNames = new Set([
  ".git",
  ".agent",
  ".pnpm",
  ".pnpm-store",
  ".tmp",
  "coverage",
  "dist",
  "dist-server",
  "dist-types",
  "node_modules",
  "playwright-report",
  "storybook-static",
  "temp",
  "test-results",
  "tmp",
]);

const repositoryOnlyPaths = new Set([".gitlab/CODEOWNERS"]);

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

const textFileNames = new Set([
  ".editorconfig",
  ".env.local.example",
  ".gitignore",
  ".gitlab-ci.yml",
  ".npmrc",
  "Dockerfile",
]);

export async function renderDomainApp(
  sourceRoot: string,
  targetDir: string,
  options: RenderDomainAppOptions,
) {
  const source = resolve(sourceRoot);
  const target = resolve(targetDir);
  const answers = createAnswers(options);

  if (target === source || source.startsWith(`${target}/`)) {
    throw new Error(
      "refusing to scaffold into the template root or its parent",
    );
  }

  const targetExists = await exists(target);
  if (targetExists && options.force) {
    await rm(target, { recursive: true, force: true });
  } else if (targetExists && options.allowExistingEmpty) {
    if (!(await isEmptyDirectory(target))) {
      throw new Error(`target already exists and is not empty: ${target}`);
    }
  } else if (targetExists) {
    throw new Error(`target already exists: ${target}`);
  }

  const dirtyStatus = await getGitShortStatus(source);
  if (dirtyStatus && !options.allowDirty) {
    throw new Error(
      "refusing to scaffold from a dirty template source; commit or stash changes, or pass --allow-dirty",
    );
  }

  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: (path) => shouldCopy(path, source),
  });

  const appSource = join(target, "apps", "fachverfahren");
  const appTarget = join(target, "apps", answers.domain);
  if ((await exists(appSource)) && appSource !== appTarget) {
    await rm(appTarget, { recursive: true, force: true });
    await rename(appSource, appTarget);
  }

  const replacements = createReplacements(answers);
  await rewriteTextFiles(target, replacements);
  await writeEnvExample(target);

  const rootPackage = await readJson<PackageJson>(join(source, "package.json"));
  const commit = await getGitCommit(source);
  const dirty = dirtyStatus !== "";
  const appliedMigrations = await listMigrationIds(source);
  await writeTemplateMetadata(target, {
    answers,
    ownership: defaultOwnership,
    lock: createLock({
      templateSource: rootPackage.name,
      templateVersion: rootPackage.version,
      generatorVersion: rootPackage.version,
      templateCommit: dirty ? "working-tree" : commit,
      templateDirty: dirty ? true : undefined,
      templateDiffHash: dirty ? await getGitDiffHash(source) : undefined,
      appliedMigrations,
    }),
  });

  return {
    target,
    answers,
    appliedMigrations,
  };
}

export async function listMigrationIds(root: string): Promise<string[]> {
  const migrationsDir = join(root, "tooling", "template", "migrations");
  const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function rewriteTextFiles(
  root: string,
  replacements: Array<[string, string]>,
) {
  const files = await collectFiles(root);
  for (const file of files) {
    if (!isTextFile(file)) {
      continue;
    }
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\u0000")) {
      continue;
    }
    let next = content;
    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }
    if (next !== content) {
      await writeFile(file, next);
    }
  }
}

function createReplacements(answers: {
  domain: string;
  displayName: string;
}): Array<[string, string]> {
  const domain = answers.domain;
  const displayName = answers.displayName;
  return [
    // Reihenfolge: längste/spezifischste Muster zuerst — sonst zerlegt ein kürzeres Muster die längeren Treffer.
    ["senticor-app-fachverfahren-template", `senticor-app-${domain}`],
    ["@senticor/fachverfahren-app", `@senticor/${domain}`],
    ["apps/fachverfahren", `apps/${domain}`],
    ["fachverfahren-template", domain],
    ["Fachverfahren Template", displayName],
    ["Fachverfahren Vorlage", displayName],
    // Die neutrale Demo-Leistung der Vorlage wird beim Scaffold zum konkreten Verfahren.
    ["Musterantrag", displayName],
  ];
}

async function writeEnvExample(root: string) {
  await writeFile(
    join(root, ".env.local.example"),
    [
      "# Lokale Entwicklungswerte für Fastify und Vite.",
      "# Kopiere diese Datei nach .env.local und passe Werte bei Bedarf an.",
      "",
      "APP_PG_URL=postgres://app:app@127.0.0.1:5432/app",
      "APP_PG_DIRECT_URL=postgres://app:app@127.0.0.1:5432/app",
      "APP_ENABLE_MOCK_AUTH=true",
      "VITE_API_MOCKING=disabled",
      "VITE_API_PROXY_TARGET=http://127.0.0.1:8080",
      "",
    ].join("\n"),
  );
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredNames.has(entry.name)) {
        files.push(...(await collectFiles(path)));
      }
    } else {
      files.push(path);
    }
  }
  return files;
}

function shouldCopy(path: string, sourceRoot: string) {
  const relativePath = relative(sourceRoot, path).split("\\").join("/");
  if (relativePath === "") {
    return true;
  }
  if (repositoryOnlyPaths.has(relativePath)) {
    return false;
  }
  return !relativePath.split("/").some((part) => ignoredNames.has(part));
}

function isTextFile(path: string) {
  return textExtensions.has(extname(path)) || textFileNames.has(basename(path));
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isEmptyDirectory(path: string) {
  try {
    const entry = await stat(path);
    return entry.isDirectory() && (await readdir(path)).length === 0;
  } catch {
    return false;
  }
}
