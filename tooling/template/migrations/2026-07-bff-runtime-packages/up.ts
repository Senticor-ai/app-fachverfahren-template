// 2026-07-bff-runtime-packages — ergänzt die KONSUMENTEN-EIGENE Verdrahtung der neuen
// Server-Pakete (@senticor/app-runtime-fastify, app-bff-contracts, app-bff-fastify).
// Die template-verwalteten Inhalte (packages/**, apps/*/server/**, scripts/check-*.mjs,
// schemas/**) kommen über template:update; hier passieren nur die Dateien, die
// Konsumenten besitzen: Workspace-Deps, tsconfig-Referenzen, vitest-Aliase,
// Dockerfile-COPYs, Catalog-Einträge, CI-Schritte. Jede Text-Änderung ist idempotent
// (Guard per includes) und fällt bei divergierten Konsumenten auf einen
// review-Hinweis zurück statt zu scheitern.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  replaceExactlyOnce,
  writeFileAtomic,
} from "../../lib/structured-edit.ts";

interface MigrationContext {
  root: string;
  dryRun: boolean;
  report(message: string): void;
  readJson<T = Record<string, unknown>>(path: string): Promise<T>;
  writeJson(path: string, value: unknown): Promise<void>;
  setPackageScript(
    packageJson: Record<string, unknown>,
    name: string,
    value: string,
  ): void;
}

const NEW_PACKAGES = [
  "app-runtime-fastify",
  "app-bff-contracts",
  "app-bff-fastify",
] as const;

export async function up(context: MigrationContext) {
  await addRootScripts(context);
  await addRootTsconfigReferences(context);
  await addBasePaths(context);
  await addAppDependencies(context);
  await addAppServerReferences(context);
  await patchTextFile(context, "vitest.config.ts", {
    already: 'pkg("app-bff-fastify")',
    anchor: '      "@senticor/app-store-postgres": pkg("app-store-postgres"),',
    replacement:
      '      "@senticor/app-store-postgres": pkg("app-store-postgres"),\n' +
      '      "@senticor/app-runtime-fastify": pkg("app-runtime-fastify"),\n' +
      '      "@senticor/app-bff-contracts": pkg("app-bff-contracts"),\n' +
      '      "@senticor/app-bff-fastify": pkg("app-bff-fastify"),',
    hint: "vitest.config.ts: resolve.alias um die drei neuen @senticor/app-*-Pakete (dist) ergänzen",
  });
  await patchTextFile(context, "Dockerfile", {
    already: "packages/app-bff-fastify/package.json",
    anchor:
      "COPY packages/app-store-postgres/package.json packages/app-store-postgres/package.json",
    replacement:
      "COPY packages/app-store-postgres/package.json packages/app-store-postgres/package.json\n" +
      "COPY packages/app-runtime-fastify/package.json packages/app-runtime-fastify/package.json\n" +
      "COPY packages/app-bff-contracts/package.json packages/app-bff-contracts/package.json\n" +
      "COPY packages/app-bff-fastify/package.json packages/app-bff-fastify/package.json",
    hint: "Dockerfile: COPY-Zeilen für die drei neuen packages/*/package.json ergänzen (check:dockerfile-paths)",
  });
  await patchTextFile(context, "pnpm-workspace.yaml", {
    already: "@sinclair/typebox",
    anchor: "  fastify-plugin: ^6.0.0",
    replacement:
      "  fastify-plugin: ^6.0.0\n" +
      "  # TypeBox gepinnt auf <=0.34: @fastify/type-provider-typebox 5.x peert\n" +
      "  # @sinclair/typebox >=0.26 <=0.34; Provider 6.x verlangt das UMBENANNTE\n" +
      "  # Paket typebox@^1 — die Migration darauf ist ein eigener, koordinierter Schritt.\n" +
      '  "@sinclair/typebox": ^0.34.0\n' +
      '  "@fastify/type-provider-typebox": ^5.2.0',
    hint: "pnpm-workspace.yaml: Catalog-Einträge @sinclair/typebox ^0.34.0 und @fastify/type-provider-typebox ^5.2.0 ergänzen",
  });
  await patchTextFile(context, "scripts/ci-validate.sh", {
    already: "pnpm run check:openapi",
    anchor: "pnpm run check:web-delivery",
    replacement:
      "pnpm run check:web-delivery\npnpm run check:openapi\npnpm run smoke:runtime",
    hint: "scripts/ci-validate.sh: check:openapi und smoke:runtime nach check:web-delivery aufnehmen",
  });
  await patchTextFile(context, "scripts/dev-api.mjs", {
    already: "@senticor/app-runtime-fastify",
    anchor: '["--filter", "@senticor/app-store-postgres", "build"],',
    replacement:
      "[\n" +
      '      "--filter",\n' +
      '      "@senticor/app-store-postgres",\n' +
      '      "--filter",\n' +
      '      "@senticor/app-runtime-fastify",\n' +
      '      "build",\n' +
      "    ],",
    hint: "scripts/dev-api.mjs: Build-Filter um @senticor/app-runtime-fastify erweitern (build:server referenziert das Paket)",
  });
  context.report(
    "review: pnpm install ausführen (Lockfile), danach build:packages && check:openapi -- --update falls das Snapshot-Gate rot ist",
  );
}

async function addRootScripts(context: MigrationContext) {
  const packagePath = join(context.root, "package.json");
  const packageJson =
    await context.readJson<Record<string, unknown>>(packagePath);
  const scripts =
    typeof packageJson["scripts"] === "object" && packageJson["scripts"]
      ? (packageJson["scripts"] as Record<string, string>)
      : {};
  let changed = false;
  for (const [name, value] of Object.entries({
    "check:openapi": "node scripts/check-openapi.mjs",
    "smoke:runtime": "node scripts/smoke-runtime.mjs",
  })) {
    if (scripts[name] !== value) {
      context.setPackageScript(packageJson, name, value);
      context.report(`set package script ${name}`);
      changed = true;
    }
  }
  if (changed && !context.dryRun) {
    await context.writeJson(packagePath, packageJson);
  }
}

async function addRootTsconfigReferences(context: MigrationContext) {
  const path = join(context.root, "tsconfig.json");
  const tsconfig = await context.readJson<{
    references?: { path: string }[];
  }>(path);
  const references = tsconfig.references ?? [];
  const anchorIndex = references.findIndex(
    (reference) => reference.path === "packages/app-store-postgres",
  );
  let changed = false;
  for (const name of NEW_PACKAGES) {
    const entry = `packages/${name}`;
    if (!references.some((reference) => reference.path === entry)) {
      references.splice(
        anchorIndex >= 0 ? anchorIndex + 1 : references.length,
        0,
        { path: entry },
      );
      context.report(`tsconfig.json: reference ${entry}`);
      changed = true;
    }
  }
  if (changed && !context.dryRun) {
    tsconfig.references = references;
    await context.writeJson(path, tsconfig);
  }
}

async function addBasePaths(context: MigrationContext) {
  const path = join(context.root, "tsconfig.base.json");
  const tsconfig = await context.readJson<{
    compilerOptions?: { paths?: Record<string, string[]> };
  }>(path);
  const paths = tsconfig.compilerOptions?.paths;
  if (!paths) {
    context.report(
      "review: tsconfig.base.json hat keine compilerOptions.paths — Aliase der drei neuen Pakete manuell ergänzen",
    );
    return;
  }
  let changed = false;
  for (const name of NEW_PACKAGES) {
    const alias = `@senticor/${name}`;
    if (!paths[alias]) {
      paths[alias] = [`packages/${name}/src/index.ts`];
      context.report(`tsconfig.base.json: path ${alias}`);
      changed = true;
    }
  }
  if (changed && !context.dryRun) {
    await context.writeJson(path, tsconfig);
  }
}

async function addAppDependencies(context: MigrationContext) {
  const appDir = await detectSingleAppDir(context.root);
  if (!appDir) {
    context.report(
      "review: apps/* nicht eindeutig — Workspace-Deps @senticor/app-runtime-fastify und @senticor/app-bff-fastify manuell in der App ergänzen",
    );
    return;
  }
  const path = join(context.root, "apps", appDir, "package.json");
  const packageJson = await context.readJson<{
    dependencies?: Record<string, string>;
  }>(path);
  const dependencies = packageJson.dependencies ?? {};
  let changed = false;
  for (const name of ["app-runtime-fastify", "app-bff-fastify"]) {
    const alias = `@senticor/${name}`;
    if (!dependencies[alias]) {
      dependencies[alias] = "workspace:*";
      context.report(`apps/${appDir}/package.json: dependency ${alias}`);
      changed = true;
    }
  }
  if (changed && !context.dryRun) {
    packageJson.dependencies = sortRecord(dependencies);
    await context.writeJson(path, packageJson);
  }
}

async function addAppServerReferences(context: MigrationContext) {
  const appDir = await detectSingleAppDir(context.root);
  if (!appDir) return;
  const path = join(context.root, "apps", appDir, "tsconfig.server.json");
  const tsconfig = await context
    .readJson<{ references?: { path: string }[] }>(path)
    .catch(() => undefined);
  if (!tsconfig) {
    context.report(
      `review: apps/${appDir}/tsconfig.server.json fehlt — Referenzen auf die drei neuen Pakete manuell ergänzen`,
    );
    return;
  }
  const references = tsconfig.references ?? [];
  let changed = false;
  for (const name of NEW_PACKAGES) {
    const entry = `../../packages/${name}`;
    if (!references.some((reference) => reference.path === entry)) {
      references.unshift({ path: entry });
      context.report(`apps/${appDir}/tsconfig.server.json: reference ${entry}`);
      changed = true;
    }
  }
  if (changed && !context.dryRun) {
    tsconfig.references = references;
    await context.writeJson(path, tsconfig);
  }
}

async function patchTextFile(
  context: MigrationContext,
  relativePath: string,
  edit: { already: string; anchor: string; replacement: string; hint: string },
) {
  const path = join(context.root, relativePath);
  const content = await readFile(path, "utf8").catch(() => undefined);
  if (content === undefined) {
    context.report(`review: ${relativePath} fehlt — ${edit.hint}`);
    return;
  }
  if (content.includes(edit.already)) return;
  try {
    const next = replaceExactlyOnce(
      content,
      edit.anchor,
      edit.replacement,
      relativePath,
    );
    if (!context.dryRun) {
      await writeFileAtomic(path, next);
    }
    context.report(`${relativePath}: ${edit.hint}`);
  } catch {
    context.report(`review (manuell): ${edit.hint}`);
  }
}

async function detectSingleAppDir(root: string): Promise<string | undefined> {
  const entries = await readdir(join(root, "apps"), {
    withFileTypes: true,
  }).catch(() => []);
  const apps = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  return apps.length === 1 ? apps[0] : undefined;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}
