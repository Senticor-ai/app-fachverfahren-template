import { join } from "node:path";

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

export async function up(context: MigrationContext) {
  const packagePath = join(context.root, "package.json");
  const packageJson =
    await context.readJson<Record<string, unknown>>(packagePath);
  const scripts =
    typeof packageJson["scripts"] === "object" &&
    packageJson["scripts"] !== null
      ? (packageJson["scripts"] as Record<string, string>)
      : {};

  const requiredScripts: Record<string, string> = {
    "build:packages":
      'pnpm --filter "./packages/**" run --if-present build && pnpm --filter "./jurisdictions/**" run --if-present build',
    template: "node --experimental-strip-types tooling/template/cli.ts",
    "check:template-invariants":
      "pnpm run template -- check:template-invariants",
    "check:scaffold": "pnpm run template -- check:scaffold",
  };

  for (const [name, value] of Object.entries(requiredScripts)) {
    if (scripts[name] !== value) {
      context.setPackageScript(packageJson, name, value);
      context.report(`set package script ${name}`);
    }
  }

  if (!context.dryRun) {
    await context.writeJson(packagePath, packageJson);
  }
}
