import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const deprecatedDocuments: Readonly<Record<string, string>> = {
  "docs/UX-UPGRADE-PLAN.md":
    "e7ee9b9ccf3624b3f05501758954a4fddc93aca46473fac3ca260d03be85e64e",
  "docs/agents/codex.md":
    "8a4ec1740911e445f4e2589911190cdb403cb9efb7977bca42539aa1155a064f",
  "docs/agents/gemini.md":
    "27e084bbdb7c6ef1be3cf7a5d0f133ae542234602578f980657633d427e070d0",
  "docs/agents/opencode.md":
    "fff4cb932e3819cfa981d6b0dbaa95f553c6c488ca11c420b42ae46b51613f4e",
  "docs/contributing/agent-configuration.md":
    "c390464057df9b6d509949b8a71aa9b0b2020cd869ea0d18ffeecb35a17e02cc",
  "docs/migration/babelfish.md":
    "97e2b1984b78dcfe706823956386afb99c90e92e432ec7087dc43d04387b5756",
  "docs/operations/runtime-configuration.md":
    "e43eda015f7bcba9452e4bb71cb29688e9d992c7b69a1f3ad9a5a0bff07b7a04",
  "docs/reference/opencode-agent-readiness.md":
    "ff919d7b1b5bf56f14043fd0974e8f6724ae5ed75bce74bd9809714b55ad2ec9",
  "docs/ux-ui/DESIGN-UPGRADE-SPEC.md":
    "fa57066bbb4dc1e7ad6a967f52e02910e0146cbe6259377c2a297b654e82f431",
  "docs/ux-ui/fachverfahren-design-manual-audit.md":
    "fb8a8a431e058ffb0286447242c0ad7fd577804a982389eb5e47bb034f71ce36",
  "docs/ux-ui/source-set-template-audit.md":
    "8d3672429ffe462f66eb0ba5458b81754442942514477b32df6b94f244d2f856",
  "docs/ux-ui/ux-methodik-public-sector-audit.md":
    "74b098428275da4120a981ded50cc16a1aabca8cb3407a630444eb341f96eb38",
  "docs/validation/template-evaluation.md":
    "eae842c8af8a31d62d2425d3c283827c17c682963537aff4ac6449747fcc926c",
};

interface MigrationContext {
  root: string;
  dryRun: boolean;
  report(message: string): void;
}

export async function up(context: MigrationContext) {
  for (const [relativePath, expectedHash] of Object.entries(
    deprecatedDocuments,
  )) {
    const path = join(context.root, relativePath);
    let content: Buffer;
    try {
      content = await readFile(path);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }

    const actualHash = createHash("sha256").update(content).digest("hex");
    if (actualHash !== expectedHash) {
      context.report(
        `preserve customized deprecated document ${relativePath} for manual review`,
      );
      continue;
    }

    context.report(`remove deprecated document ${relativePath}`);
    if (!context.dryRun) await rm(path);
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
