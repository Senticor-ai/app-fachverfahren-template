import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderDomainApp } from "./render.ts";

describe("domain app rendering", () => {
  it("renders deterministic full-repo template provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-render-test-"));
    try {
      const first = join(root, "first");
      const second = join(root, "second");
      const options = {
        domain: "demo-k8s",
        displayName: "Demo K8s",
        force: true,
        allowDirty: true,
      };

      await renderDomainApp(process.cwd(), first, options);
      await renderDomainApp(process.cwd(), second, options);

      const firstAnswers = await readFile(
        join(first, ".template", "answers.json"),
        "utf8",
      );
      const secondAnswers = await readFile(
        join(second, ".template", "answers.json"),
        "utf8",
      );
      const firstLock = await readFile(
        join(first, ".template", "lock.json"),
        "utf8",
      );

      expect(firstAnswers).toBe(secondAnswers);
      expect(firstLock).not.toContain(tmpdir());
      expect(firstLock).not.toContain(first);
      const packageJson = await readFile(join(first, "package.json"), "utf8");
      expect(packageJson).toContain("@senticor/demo-k8s");
      expect(packageJson).not.toContain("@senticor/fachverfahren");
      await expect(
        readFile(
          join(
            first,
            "apps",
            "demo-k8s",
            "deploy",
            "helm",
            "demo-k8s",
            "Chart.yaml",
          ),
          "utf8",
        ),
      ).resolves.toContain("name: demo-k8s");
      expect(
        await readFile(
          join(first, "scripts", "check-k8s-delivery.mjs"),
          "utf8",
        ),
      ).not.toContain("apps/fachverfahren/deploy/helm/fachverfahren");
      expect(
        await readFile(join(first, "tooling", "template", "cli.ts"), "utf8"),
      ).toContain("template");

      // Template-Repo-interne Workflows (repositoryOnlyPaths) dürfen NICHT im Konsumenten landen;
      // die generische CI und der (substituierte) GitLab-Mirror schon.
      for (const consumerWorkflow of ["ci.yml", "mirror-gitlab.yml"]) {
        await expect(
          access(join(first, ".github", "workflows", consumerWorkflow)),
        ).resolves.toBeUndefined();
      }
      for (const repositoryOnlyWorkflow of [
        "scaffold-nightly.yml",
        "deploy-demo-consumer.yml",
      ]) {
        await expect(
          access(join(first, ".github", "workflows", repositoryOnlyWorkflow)),
        ).rejects.toThrow();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // GUARD (CHOS-CODE#68): the scaffold must refuse to render FROM a live/governed consumer project (one carrying a
  // `.chos/` dir or a `cognitive-hive.*` symlink). Scaffolding from there would follow that symlink and flip the shared
  // source governance (parallel app + broken gates). It renders from the pristine template only.
  it("refuses to scaffold FROM a live/governed consumer project (.chos present)", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-guard-test-"));
    try {
      const fakeConsumer = join(root, "consumer");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(fakeConsumer, ".chos"), { recursive: true });
      await expect(
        renderDomainApp(fakeConsumer, join(root, "out"), {
          domain: "demo-k8s",
          displayName: "Demo",
          force: true,
          allowDirty: true,
        }),
      ).rejects.toThrow(/live\/governed consumer project|CHOS-CODE#68/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
