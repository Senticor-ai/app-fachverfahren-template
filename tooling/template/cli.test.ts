import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = join(process.cwd(), "tooling", "template", "cli.ts");

async function runTemplate(args: string[]) {
  const result = await execFileAsync(
    process.execPath,
    ["--experimental-strip-types", cli, ...args],
    {
      cwd: process.cwd(),
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  return result.stdout;
}

describe("template CLI", () => {
  it("emits machine-readable status", async () => {
    const output = await runTemplate(["status", "--json"]);
    const report = JSON.parse(output);
    expect(report).toMatchObject({
      title: "Template Status",
      status: "ok",
    });
    expect(report.sections[0].items[0]).toContain("current:");
  });

  it("explains ownership for consumer paths", async () => {
    const output = await runTemplate([
      "explain",
      "apps/fachverfahren/src/domain/example.ts",
      "--json",
    ]);
    const report = JSON.parse(output);
    expect(report.explanation).toMatchObject({
      strategy: "consumer",
    });
  });

  it("scaffolds a repository with deterministic provenance", async () => {
    const root = await mkdtemp(join(tmpdir(), "template-cli-test-"));
    try {
      const target = join(root, "app");
      const output = await runTemplate([
        "scaffold",
        "--domain",
        "fachverfahren",
        "--display-name",
        "Fachverfahren",
        "--target",
        target,
        "--allow-existing-empty",
        "--allow-dirty",
        "--json",
      ]);
      const report = JSON.parse(output);
      expect(report.status).toBe("ok");
      expect(report.sections[0].items).toContain(".template/lock.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("discovers vendor-neutral agent workflows", async () => {
    const output = await runTemplate(["agent:discover", "--json"]);
    const report = JSON.parse(output);
    expect(report.status).toBe("ok");
    expect(report.discovery.workflows.map((workflow) => workflow.id)).toContain(
      "workflow:new-domain-module",
    );
    expect(JSON.stringify(report.discovery)).not.toContain(process.cwd());
  });

  it("bootstraps agent readiness as JSON", async () => {
    const output = await runTemplate(["agent:bootstrap", "--json"]);
    const report = JSON.parse(output);
    expect(report.title).toBe("Agent Bootstrap");
    expect(report.bootstrap.installCommand).toBe(
      "pnpm install --frozen-lockfile",
    );
    expect(
      report.bootstrap.validationProfiles.map((profile) => profile.id),
    ).toContain("agent-release");
  });

  it("returns task-specific agent context", async () => {
    const output = await runTemplate([
      "agent:context",
      "--task",
      "docs/examples/hundesteuer/app.spec.yaml",
      "--paths",
      "modules/dog-tax",
      "--json",
    ]);
    const report = JSON.parse(output);
    expect(report.status).toBe("ok");
    expect(report.context.selectedSources).toEqual(["fimportal"]);
    expect(report.context.writeBoundaries).toContain("modules/dog-tax");
    expect(report.context.nextCommands.map((command) => command.id)).toContain(
      "generate-domain-module",
    );
    expect(
      report.context.validationProfiles.map((profile) => profile.id),
    ).toContain("agent-domain");
  });

  it("preflights agent contracts", async () => {
    const output = await runTemplate(["agent:preflight", "--json"]);
    const report = JSON.parse(output);
    expect(report.status).toBe("ok");
  });
});
