import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readJson,
  setPackageScript,
  writeJson,
} from "../../lib/structured-edit.ts";
import metadata from "./migration.json" with { type: "json" };
import { up } from "./up.ts";

async function makeConsumerRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "template-migration-test-"));
  await mkdir(join(root, "apps/demo"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "demo", scripts: {} }, null, 2),
  );
  await writeFile(
    join(root, "tsconfig.json"),
    JSON.stringify(
      {
        files: [],
        references: [{ path: "packages/app-store-postgres" }],
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "tsconfig.base.json"),
    JSON.stringify(
      {
        compilerOptions: {
          paths: {
            "@senticor/app-store-postgres": [
              "packages/app-store-postgres/src/index.ts",
            ],
          },
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "vitest.config.ts"),
    [
      "export default {",
      "  resolve: {",
      "    alias: {",
      '      "@senticor/app-store-postgres": pkg("app-store-postgres"),',
      "    },",
      "  },",
      "};",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "Dockerfile"),
    "COPY packages/app-store-postgres/package.json packages/app-store-postgres/package.json\n",
  );
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    "catalog:\n  fastify-plugin: ^6.0.0\n  pg: ^8.22.0\n",
  );
  await writeFile(
    join(root, "scripts/ci-validate.sh"),
    "pnpm run build:server\npnpm run check:web-delivery\n",
  );
  await writeFile(
    join(root, "scripts/dev-api.mjs"),
    [
      "run(",
      '  "Store-Paket bauen (@senticor/app-store-postgres)",',
      '  "pnpm",',
      '  ["--filter", "@senticor/app-store-postgres", "build"],',
      "  env,",
      ");",
      "",
    ].join("\n"),
  );
  await writeFile(
    join(root, "apps/demo/package.json"),
    JSON.stringify(
      {
        name: "@senticor/demo",
        dependencies: { "@senticor/app-store-postgres": "workspace:*" },
      },
      null,
      2,
    ),
  );
  await writeFile(
    join(root, "apps/demo/tsconfig.server.json"),
    JSON.stringify(
      { references: [{ path: "../../packages/app-store-postgres" }] },
      null,
      2,
    ),
  );
  return root;
}

describe("2026-07-bff-runtime-packages migration", () => {
  it("declares review-mode structural changes", () => {
    expect(metadata).toMatchObject({
      id: "2026-07-bff-runtime-packages",
      mode: "review",
    });
    expect(metadata.touches).toContain("packages/app-runtime-fastify/**");
    expect(metadata.checks).toContain("check:openapi");
    expect(metadata.checks).toContain("smoke:runtime");
  });

  it("verdrahtet die konsumenten-eigenen Dateien idempotent", async () => {
    const root = await makeConsumerRoot();
    try {
      const reports: string[] = [];
      const context = {
        root,
        dryRun: false,
        report: (message: string) => reports.push(message),
        readJson,
        writeJson,
        setPackageScript,
      };
      await up(context);
      const snapshot = await snapshotFiles(root);
      await up(context);
      expect(await snapshotFiles(root)).toEqual(snapshot);

      const rootPackage = JSON.parse(snapshot["package.json"] ?? "{}");
      expect(rootPackage.scripts["check:openapi"]).toBe(
        "node scripts/check-openapi.mjs",
      );
      expect(rootPackage.scripts["smoke:runtime"]).toBe(
        "node scripts/smoke-runtime.mjs",
      );

      const rootTsconfig = JSON.parse(snapshot["tsconfig.json"] ?? "{}");
      expect(rootTsconfig.references).toContainEqual({
        path: "packages/app-bff-fastify",
      });

      const basePaths = JSON.parse(snapshot["tsconfig.base.json"] ?? "{}")
        .compilerOptions.paths;
      expect(basePaths["@senticor/app-bff-contracts"]).toEqual([
        "packages/app-bff-contracts/src/index.ts",
      ]);

      expect(snapshot["vitest.config.ts"]).toContain(
        'pkg("app-runtime-fastify")',
      );
      expect(snapshot["Dockerfile"]).toContain(
        "packages/app-bff-contracts/package.json",
      );
      expect(snapshot["pnpm-workspace.yaml"]).toContain("@sinclair/typebox");
      expect(snapshot["scripts/ci-validate.sh"]).toContain(
        "pnpm run smoke:runtime",
      );
      expect(snapshot["scripts/dev-api.mjs"]).toContain(
        "@senticor/app-runtime-fastify",
      );

      const appPackage = JSON.parse(snapshot["apps/demo/package.json"] ?? "{}");
      expect(appPackage.dependencies["@senticor/app-bff-fastify"]).toBe(
        "workspace:*",
      );
      const appServer = JSON.parse(
        snapshot["apps/demo/tsconfig.server.json"] ?? "{}",
      );
      expect(appServer.references).toContainEqual({
        path: "../../packages/app-runtime-fastify",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fällt bei divergierten Konsumenten auf review-Hinweise zurück statt zu werfen", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-migration-test-"));
    try {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "demo", scripts: {} }, null, 2),
      );
      await writeFile(join(root, "tsconfig.json"), JSON.stringify({}, null, 2));
      await writeFile(
        join(root, "tsconfig.base.json"),
        JSON.stringify({}, null, 2),
      );
      // Divergierter Konsument: kein Anker vorhanden.
      await writeFile(join(root, "vitest.config.ts"), "export default {};\n");
      const reports: string[] = [];
      const context = {
        root,
        dryRun: false,
        report: (message: string) => reports.push(message),
        readJson,
        writeJson,
        setPackageScript,
      };
      await up(context);
      expect(reports.some((message) => message.startsWith("review"))).toBe(
        true,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function snapshotFiles(root: string): Promise<Record<string, string>> {
  const files = [
    "package.json",
    "tsconfig.json",
    "tsconfig.base.json",
    "vitest.config.ts",
    "Dockerfile",
    "pnpm-workspace.yaml",
    "scripts/ci-validate.sh",
    "scripts/dev-api.mjs",
    "apps/demo/package.json",
    "apps/demo/tsconfig.server.json",
  ];
  const snapshot: Record<string, string> = {};
  for (const file of files) {
    snapshot[file] = await readFile(join(root, file), "utf8");
  }
  return snapshot;
}
