import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("2026-07-web-k8s-delivery-hardening migration", () => {
  it("declares review-mode structural changes", () => {
    expect(metadata).toMatchObject({
      id: "2026-07-web-k8s-delivery-hardening",
      mode: "review",
    });
    expect(metadata.touches).toContain("apps/*/deploy/helm/**");
  });

  it("is idempotent for package scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-migration-test-"));
    try {
      await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "demo", scripts: {} }, null, 2),
      );
      const context = {
        root,
        dryRun: false,
        report: () => undefined,
        readJson,
        writeJson,
        setPackageScript,
      };
      await up(context);
      const once = await readFile(join(root, "package.json"), "utf8");
      await up(context);
      const twice = await readFile(join(root, "package.json"), "utf8");
      expect(twice).toBe(once);
      expect(JSON.parse(twice).scripts["check:k8s-delivery"]).toBe(
        "node scripts/check-k8s-delivery.mjs",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
