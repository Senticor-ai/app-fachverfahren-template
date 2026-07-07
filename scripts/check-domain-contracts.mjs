import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd();
const modulesRoot = join(root, "modules");
const requiredModuleDirectories = [
  "contracts",
  "ui",
  "forms",
  "permissions",
  "events",
  "migrations",
  "i18n",
  "tests",
  "compliance",
];
const requiredManifestKeys = [
  "id",
  "version",
  "displayName",
  "routes",
  "requiredCapabilities",
  "permissions",
  "events",
  "dataCategories",
  "retentionPolicies",
  "migrations",
];
const requiredScreenKeys = [
  "id",
  "route",
  "owner",
  "persona",
  "inputs",
  "outputs",
  "states",
  "ia",
  "content",
  "hcai",
  "a11y",
  "tests",
  "evidence",
];
const requiredScreenStates = ["loading", "empty", "error", "ready", "success"];

const failures = [];

for (const moduleName of await listDomainModuleNames()) {
  const moduleDir = join(modulesRoot, moduleName);
  await checkModuleDirectories(moduleName, moduleDir);
  await checkDomainManifest(moduleName, moduleDir);
  await checkScreenContracts(moduleName, moduleDir);
}

if (failures.length > 0) {
  console.error("Domain contract check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    "\nEvery directory under modules/ must be a complete domain module. Build a Fachverfahren via apps/fachverfahren/src/leistung.config.ts, generate a module with `pnpm run app:new`, and keep grounding/scratch out of modules/ (see modules/README.md).",
  );
  process.exit(1);
}

console.log("Domain contract check passed.");

async function listDomainModuleNames() {
  const entries = await safeReaddir(modulesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"));
}

async function checkModuleDirectories(moduleName, moduleDir) {
  const entries = await safeReaddir(moduleDir, { withFileTypes: true });
  const directories = new Set(
    entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  );

  for (const expectedDirectory of requiredModuleDirectories) {
    if (!directories.has(expectedDirectory)) {
      failures.push(
        `${moduleName} missing required directory ${expectedDirectory}/`,
      );
    }
  }
}

async function checkDomainManifest(moduleName, moduleDir) {
  const manifestPath = join(moduleDir, "domain.module.yaml");
  const manifest = await readText(manifestPath);

  if (!manifest) {
    failures.push(`${moduleName} missing domain.module.yaml`);
    return;
  }

  for (const key of requiredManifestKeys) {
    if (!hasTopLevelKey(manifest, key)) {
      failures.push(`${display(manifestPath)} missing top-level key ${key}`);
    }
  }

  requireNonEmptySection(manifestPath, manifest, "routes");
  requireNonEmptySection(manifestPath, manifest, "requiredCapabilities");
  requireNonEmptySection(manifestPath, manifest, "permissions");
  requireNonEmptySection(manifestPath, manifest, "dataCategories");
  requireNonEmptySection(manifestPath, manifest, "retentionPolicies");
  requireNestedKey(manifestPath, manifest, "events", "publishes");
  requireNestedKey(manifestPath, manifest, "events", "consumes");
  requireNestedKey(manifestPath, manifest, "migrations", "database");
}

async function checkScreenContracts(moduleName, moduleDir) {
  const contractsDir = join(moduleDir, "contracts");
  const contractFiles = (await safeReaddir(contractsDir))
    .filter((fileName) => fileName.endsWith(".screen.yaml"))
    .sort();

  if (contractFiles.length === 0) {
    failures.push(`${moduleName} requires at least one *.screen.yaml contract`);
    return;
  }

  for (const contractFile of contractFiles) {
    const contractPath = join(contractsDir, contractFile);
    const contract = await readText(contractPath);

    for (const key of requiredScreenKeys) {
      if (!hasTopLevelKey(contract, key)) {
        failures.push(`${display(contractPath)} missing top-level key ${key}`);
      }
    }

    for (const key of ["inputs", "outputs", "states", "evidence"]) {
      requireNonEmptySection(contractPath, contract, key);
    }

    for (const state of requiredScreenStates) {
      if (!sectionHasListValue(contract, "states", state)) {
        failures.push(`${display(contractPath)} missing state ${state}`);
      }
    }

    requireNestedKey(contractPath, contract, "a11y", "landmarks");
    requireNestedKey(contractPath, contract, "a11y", "keyboard");
    requireNestedKey(contractPath, contract, "a11y", "focusOrder");
    requireNestedKey(contractPath, contract, "a11y", "zoom");
    requireNestedKey(contractPath, contract, "a11y", "statusSemantics");
    requireNestedKey(contractPath, contract, "ia", "pattern");
    requireNestedKey(contractPath, contract, "ia", "navigation");
    requireNestedKey(contractPath, contract, "ia", "profile");
    requireNestedKey(contractPath, contract, "ia", "scroll");
    requireNestedKey(contractPath, contract, "content", "language");
    requireNestedKey(contractPath, contract, "content", "architectureTerms");
    requireNestedKey(contractPath, contract, "hcai", "mode");
    requireNestedKey(contractPath, contract, "hcai", "controls");
    requireNestedKey(contractPath, contract, "tests", "unit");
    requireNestedKey(contractPath, contract, "tests", "integration");
    requireNestedKey(contractPath, contract, "tests", "storybook");
  }
}

async function safeReaddir(path, options) {
  try {
    return await readdir(path, options);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function display(path) {
  return relative(root, path);
}

function hasTopLevelKey(text, key) {
  return new RegExp(`^${escapeRegExp(key)}:\\s*`, "m").test(text);
}

function getSection(text, key) {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) =>
    new RegExp(`^${escapeRegExp(key)}:\\s*`).test(line),
  );

  if (startIndex === -1) {
    return "";
  }

  const sectionLines = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\S[^:]*:\s*/.test(line)) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines.join("\n");
}

function requireNonEmptySection(path, text, key) {
  const section = getSection(text, key);
  if (!/^\s+-\s+\S/m.test(section) && !/:\s*\S/m.test(section)) {
    failures.push(`${display(path)} requires non-empty section ${key}`);
  }
}

function requireNestedKey(path, text, sectionKey, nestedKey) {
  const section = getSection(text, sectionKey);
  if (!new RegExp(`^\\s+${escapeRegExp(nestedKey)}:\\s*`, "m").test(section)) {
    failures.push(
      `${display(path)} missing nested key ${sectionKey}.${nestedKey}`,
    );
  }
}

function sectionHasListValue(text, key, value) {
  return new RegExp(`^\\s+-\\s+${escapeRegExp(value)}\\s*$`, "m").test(
    getSection(text, key),
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
