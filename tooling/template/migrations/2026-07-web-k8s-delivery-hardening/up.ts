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
    "build:server": "pnpm --filter @senticor/fachverfahren build:server",
    "check:web-delivery": "node scripts/check-web-delivery.mjs",
    "check:k8s-delivery": "node scripts/check-k8s-delivery.mjs",
    "test:supply-chain": "sh scripts/check-supply-chain.sh",
    "test:k8s:render": "scripts/validate-k8s-render.sh",
    "test:k8s:security": "pnpm run check:k8s-delivery",
  };

  for (const [name, value] of Object.entries(requiredScripts)) {
    if (scripts[name] !== value) {
      context.setPackageScript(packageJson, name, value);
      context.report(`set package script ${name}`);
    }
  }

  context.report(
    "review Dockerfile, Helm chart, Fastify runtime, public assets and CI tool bootstrap for web/K8s delivery hardening",
  );

  if (!context.dryRun) {
    await context.writeJson(packagePath, packageJson);
  }
}
