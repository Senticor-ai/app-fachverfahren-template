import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultOwnership } from "./manifest.ts";
import { planOwnershipUpdate } from "./merge.ts";

describe("template ownership merge", () => {
  it("tracks template library files with CLI updates", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-merge-root-"));
    const incomingRoot = await mkdtemp(
      join(tmpdir(), "template-merge-incoming-"),
    );
    try {
      await mkdir(join(root, "tooling/template/lib"), { recursive: true });
      await mkdir(join(incomingRoot, "tooling/template/lib"), {
        recursive: true,
      });
      await mkdir(join(root, "schemas"), { recursive: true });
      await mkdir(join(incomingRoot, "schemas"), { recursive: true });
      await writeFile(
        join(root, "tooling/template/lib/agent-platform.ts"),
        "export const version = 1;\n",
      );
      await writeFile(
        join(incomingRoot, "tooling/template/lib/agent-platform.ts"),
        "export const version = 2;\n",
      );
      await writeFile(
        join(root, "schemas/app-spec.schema.json"),
        '{"version":1}\n',
      );
      await writeFile(
        join(incomingRoot, "schemas/app-spec.schema.json"),
        '{"version":2}\n',
      );

      const plan = await planOwnershipUpdate({
        root,
        incomingRoot,
        ownership: defaultOwnership,
      });

      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          path: "tooling/template/lib/agent-platform.ts",
          action: "replace",
        }),
      );
      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          path: "schemas/app-spec.schema.json",
          action: "replace",
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(incomingRoot, { recursive: true, force: true });
    }
  });
});
