import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
const targetArg = args.find((arg) => !arg.startsWith("--"));
const force = args.includes("--force");

if (!targetArg) {
  console.error(
    "Usage: pnpm run scaffold:standalone -- <target-dir> [--force]",
  );
  process.exit(1);
}

const targetDir = resolve(root, targetArg);
const appSourceDir = join(root, "apps/antragsservice");
const appTargetDir = targetDir;
const rootPackage = await readJson(join(root, "package.json"));
const appPackage = await readJson(join(appSourceDir, "package.json"));
const catalog = await readCatalog();
const workspaceVersions = await readWorkspaceVersions();
const replacements = [];

if (targetDir === root || root.startsWith(`${targetDir}/`)) {
  console.error("Refusing to scaffold into the repository root or its parent.");
  process.exit(1);
}

if ((await exists(targetDir)) && !force) {
  console.error(`Target already exists: ${targetDir}`);
  console.error("Pass --force to replace it.");
  process.exit(1);
}

if (force) {
  await rm(targetDir, { recursive: true, force: true });
}

await mkdir(targetDir, { recursive: true });
await cp(appSourceDir, appTargetDir, {
  recursive: true,
  filter: (source) => !shouldSkip(source),
});

const standalonePackage = rewritePackageJson(appPackage);
standalonePackage.name = basename(targetDir);
standalonePackage.private = true;
standalonePackage.scripts = {
  dev: "vite",
  build: "vite build",
  "build:server": "tsc -p tsconfig.server.json",
  preview: "vite preview",
  start: "node dist-server/index.js",
  typecheck:
    "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.server.json",
};

await writeFile(
  join(appTargetDir, "package.json"),
  `${JSON.stringify(standalonePackage, null, 2)}\n`,
);
await writeFile(
  join(appTargetDir, "standalone-export-report.json"),
  `${JSON.stringify(
    {
      sourceTemplate: rootPackage.name,
      sourceVersion: rootPackage.version,
      generatedAt: new Date().toISOString(),
      replacements,
      note: "workspace:* dependencies were resolved to local package versions. Ensure those packages are published or otherwise available.",
    },
    null,
    2,
  )}\n`,
);

console.log(`Standalone app scaffolded at ${targetDir}`);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readCatalog() {
  const workspaceYaml = await readFile(
    join(root, "pnpm-workspace.yaml"),
    "utf8",
  );
  const result = new Map();
  let inCatalog = false;

  for (const line of workspaceYaml.split(/\r?\n/)) {
    if (/^catalog:\s*$/.test(line)) {
      inCatalog = true;
      continue;
    }

    if (inCatalog && /^\S/.test(line)) {
      break;
    }

    const match = line.match(/^\s{2}["']?([^"':]+)["']?:\s*(.+)\s*$/);
    if (inCatalog && match) {
      const [, name, spec] = match;
      result.set(name, spec.trim());
    }
  }

  return result;
}

async function readWorkspaceVersions() {
  const packageFiles = [
    ...(await listPackageFiles("packages")),
    ...(await listPackageFiles("jurisdictions")),
  ];
  const result = new Map();

  for (const packageFile of packageFiles) {
    const packageJson = await readJson(packageFile);
    if (packageJson.name && packageJson.version) {
      result.set(packageJson.name, packageJson.version);
    }
  }

  return result;
}

async function listPackageFiles(workspaceDir) {
  const directory = join(root, workspaceDir);
  const entries = await readdirSafe(directory);
  return entries.map((entry) => join(directory, entry, "package.json"));
}

async function readdirSafe(path) {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function rewritePackageJson(packageJson) {
  const next = structuredClone(packageJson);

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    if (next[field]) {
      next[field] = rewriteDependencyMap(field, next[field]);
    }
  }

  return next;
}

function rewriteDependencyMap(field, dependencyMap) {
  return Object.fromEntries(
    Object.entries(dependencyMap).map(([name, spec]) => [
      name,
      rewriteSpec(field, name, spec),
    ]),
  );
}

function rewriteSpec(field, name, spec) {
  if (spec === "catalog:" || spec.startsWith("catalog:")) {
    const resolved = catalog.get(name);
    if (!resolved) {
      throw new Error(`No catalog entry for ${name}`);
    }
    replacements.push({ field, name, from: spec, to: resolved });
    return resolved;
  }

  if (spec === "workspace:*" || spec.startsWith("workspace:")) {
    const resolved = workspaceVersions.get(name);
    if (!resolved) {
      throw new Error(`No local workspace version for ${name}`);
    }
    replacements.push({ field, name, from: spec, to: resolved });
    return resolved;
  }

  return spec;
}

function shouldSkip(source) {
  const relativeSource = source.slice(appSourceDir.length + 1);
  return ["node_modules", "dist", "dist-server", "dist-types", "coverage"].some(
    (ignored) =>
      relativeSource === ignored || relativeSource.startsWith(`${ignored}/`),
  );
}
