import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultOwnership, mergeOwnershipDefaults } from "./manifest.ts";
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

  it("treats files under newly added default ownership as managed changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-merge-root-"));
    const incomingRoot = await mkdtemp(
      join(tmpdir(), "template-merge-incoming-"),
    );
    try {
      await writeFile(join(root, "ci.yml"), "schemaVersion: v0.1\n");
      await writeFile(join(incomingRoot, "ci.yml"), "schemaVersion: v0.2\n");

      // Prä-#24-Zustand: Konsument wurde gescaffoldet, bevor das Template `ci.yml` verwaltete.
      const staleOwnership = {
        paths: Object.fromEntries(
          Object.entries(defaultOwnership.paths).filter(
            ([path]) => path !== "ci.yml",
          ),
        ),
      };

      const stalePlan = await planOwnershipUpdate({
        root,
        incomingRoot,
        ownership: staleOwnership,
      });
      expect(stalePlan.conflicts).toContainEqual(
        expect.objectContaining({ path: "ci.yml" }),
      );

      const mergedPlan = await planOwnershipUpdate({
        root,
        incomingRoot,
        ownership: mergeOwnershipDefaults(staleOwnership).ownership,
      });
      expect(mergedPlan.changes).toContainEqual(
        expect.objectContaining({ path: "ci.yml", action: "replace" }),
      );
      expect(mergedPlan.conflicts).not.toContainEqual(
        expect.objectContaining({ path: "ci.yml" }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(incomingRoot, { recursive: true, force: true });
    }
  });

  it("plans copies for source-only ownership paths outside the candidate list", async () => {
    // Codex-Finding PR #26 (Runde 2): ein Default, den erst die Ziel-Quelle kennt, steht
    // nicht in der hartkodierten managedCandidateFiles-Liste der laufenden CLI — ohne
    // extraOwnershipPaths würde der Eintrag persistiert, die Datei aber nie kopiert.
    const root = await mkdtemp(join(tmpdir(), "template-merge-root-"));
    const incomingRoot = await mkdtemp(
      join(tmpdir(), "template-merge-incoming-"),
    );
    try {
      await writeFile(join(incomingRoot, "EXTRA-SOURCE-ONLY.md"), "neu\n");
      await mkdir(join(incomingRoot, "generated", "deep"), { recursive: true });
      await writeFile(
        join(incomingRoot, "generated", "deep", "artifact.json"),
        "{}\n",
      );

      const ownership = {
        paths: {
          "EXTRA-SOURCE-ONLY.md": "replace" as const,
          "generated/**": "replace" as const,
        },
      };

      const plan = await planOwnershipUpdate({
        root,
        incomingRoot,
        ownership,
        extraOwnershipPaths: ["EXTRA-SOURCE-ONLY.md", "generated/**"],
      });

      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          path: "EXTRA-SOURCE-ONLY.md",
          action: "replace",
        }),
      );
      expect(plan.changes).toContainEqual(
        expect.objectContaining({
          path: "generated/deep/artifact.json",
          action: "replace",
        }),
      );
      expect(plan.conflicts).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(incomingRoot, { recursive: true, force: true });
    }
  });
});
