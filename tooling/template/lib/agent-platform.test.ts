import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appNew,
  buildAgentContext,
  buildDiscovery,
  deriveModuleContract,
  readStructuredFile,
  validateAgentRunReport,
  validateAgentPreflight,
  validateSourceRegistry,
  type AppSpec,
} from "./agent-platform.ts";

const root = process.cwd();

describe("agent platform contract", () => {
  it("emits deterministic discovery without local paths by default", async () => {
    const discovery = await buildDiscovery(root);
    const text = JSON.stringify(discovery);
    expect(discovery.schemaVersion).toBe("1.0.0");
    expect(discovery.provenance).toBeUndefined();
    expect(text).not.toContain(root);
    expect(discovery.commands.map((command) => command.id)).toContain(
      "agent.context",
    );
  });

  it("selects minimal task context for the Hundesteuer spec", async () => {
    const context = await buildAgentContext(root, {
      taskPath: "docs/examples/hundesteuer/app.spec.yaml",
      paths: ["modules/dog-tax"],
    });
    expect(context.taskId).toBe("hundesteuer");
    expect(context.selectedCapabilities).toContain("identity-and-trust");
    expect(context.selectedSources).toEqual(["fimportal"]);
    expect(context.writeBoundaries).toContain("modules/dog-tax");
    expect(context.writeBoundaries).toContain(".agent/sources/");
    expect(context.nextCommands.map((command) => command.id)).toContain(
      "fetch-governed-source:fimportal",
    );
    const scaffoldCommand = context.nextCommands.find(
      (command) => command.id === "scaffold-full-repository",
    );
    expect(scaffoldCommand?.expectedArtifacts).toContain(
      "<target-dir>/.template/lock.json",
    );
    expect(scaffoldCommand?.followUpCwd).toBe("<target-dir>");
    expect(
      context.selectedContext.some((item) => item.reason === "UX contract"),
    ).toBe(true);
  });

  it("derives a module contract from an app spec", async () => {
    const spec = await readStructuredFile<AppSpec>(
      join(root, "docs/examples/hundesteuer/app.spec.yaml"),
    );
    const contract = deriveModuleContract(spec);
    expect(contract.moduleId).toBe("dog-tax");
    expect(contract.consumedCapabilities).toContain("payment");
    expect(contract.allowedDomainPaths).toContain("modules/dog-tax");
    expect(contract.permissions).toContain("dog-tax.auditor");
    expect(JSON.stringify(contract)).toContain("AuditPort");
  });

  it("scaffolds an app spec idempotently", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-app-new-"));
    try {
      const specPath = "docs/examples/hundesteuer/app.spec.yaml";
      await mkdir(join(temp, "docs/examples/hundesteuer"), {
        recursive: true,
      });
      await cp(join(root, specPath), join(temp, specPath));
      const first = await appNew(temp, {
        specPath,
      });
      const second = await appNew(temp, {
        specPath,
      });
      expect(first.status).toBe("ok");
      expect(first.generated).toContain(
        "modules/dog-tax/contracts/audit-workspace.screen.yaml",
      );
      expect(first.generated).toContain(
        "modules/dog-tax/ui/DogTaxScreens.stories.tsx",
      );
      expect(first.generated).toContain(
        "modules/dog-tax/migrations/database/0001_create_dog_tax_cases.sql",
      );
      expect(first.generated).toContain(
        "modules/dog-tax/compliance/profile.example.json",
      );
      expect(second.status).toBe("ok");
      expect(second.preserved).toContain("modules/dog-tax");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("defaults optional approvals and normalizes generated SQL identifiers", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-app-new-safe-"));
    try {
      const specPath = "docs/examples/custom/app.spec.yaml";
      const source = await readStructuredFile<AppSpec>(
        join(root, "docs/examples/hundesteuer/app.spec.yaml"),
      );
      const spec = {
        ...source,
        id: "custom",
        fim: source.fim
          ? {
              sourceId: source.fim.sourceId,
              rootId: source.fim.rootId,
            }
          : undefined,
        module: {
          ...source.module,
          id: "123-service",
          destination: "modules/123-service",
        },
      };
      delete spec.humanApproval;
      await mkdir(join(temp, "docs/examples/custom"), {
        recursive: true,
      });
      await writeFile(
        join(temp, specPath),
        `${JSON.stringify(spec, null, 2)}\n`,
      );

      const result = await appNew(temp, { specPath });
      const migration = await readFile(
        join(
          temp,
          "modules/123-service/migrations/database/0001_create_m_123_service_cases.sql",
        ),
        "utf8",
      );
      const domainModule = await readFile(
        join(temp, "modules/123-service/domain.module.yaml"),
        "utf8",
      );

      expect(result.status).toBe("ok");
      expect(migration).toContain(
        "CREATE TABLE IF NOT EXISTS m_123_service_cases",
      );
      expect(domainModule).toContain("  services: []");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("rejects stale report task hashes", async () => {
    const spec = await readStructuredFile<AppSpec>(
      join(root, "docs/examples/hundesteuer/app.spec.yaml"),
    );
    const report = validReportForSpec({
      spec: { ...spec, permittedExternalSources: [] },
      task: "docs/examples/hundesteuer/app.spec.yaml",
      taskHash: "stale",
      filesChanged: ["AGENTS.md"],
    });

    const failures = await validateAgentRunReport(
      root,
      { ...spec, permittedExternalSources: [] },
      report,
      {
        taskPath: "docs/examples/hundesteuer/app.spec.yaml",
        taskHash: "fresh",
      },
    );

    expect(failures).toContain("report taskHash does not match current task");
  });

  it("validates governed source provenance status and digest", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-source-proof-"));
    try {
      await writeFile(
        join(temp, "changed.ts"),
        "export const changed = true;\n",
      );
      await mkdir(join(temp, ".agent/sources/bad-source"), {
        recursive: true,
      });
      await writeFile(
        join(temp, ".agent/sources/bad-source/provenance.json"),
        `${JSON.stringify(
          {
            sourceId: "bad-source",
            status: 500,
            sha256: "a".repeat(64),
          },
          null,
          2,
        )}\n`,
      );
      const source = await readStructuredFile<AppSpec>(
        join(root, "docs/examples/hundesteuer/app.spec.yaml"),
      );
      const spec = {
        ...source,
        permittedExternalSources: ["bad-source"],
      };

      const failures = await validateAgentRunReport(
        temp,
        spec,
        validReportForSpec({
          spec,
          task: "app.spec.yaml",
          taskHash: "hash",
          filesChanged: ["changed.ts"],
        }),
        { taskPath: "app.spec.yaml", taskHash: "hash" },
      );

      expect(failures).toContain(
        "governed source bad-source returned unsuccessful status 500",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("validates source registry and preflight contracts", async () => {
    expect(await validateSourceRegistry(root)).toEqual([]);
    expect(await validateAgentPreflight(root)).toEqual([]);
  });
});

function validReportForSpec({
  spec,
  task,
  taskHash,
  filesChanged,
}: {
  spec: AppSpec;
  task: string;
  taskHash: string;
  filesChanged: string[];
}) {
  return {
    schemaVersion: "1.0.0",
    runId: "test-run",
    task,
    taskHash,
    selectedInstructionHashes: [],
    filesChanged: filesChanged.map((path) => ({ path })),
    commandsExecuted: [
      {
        id: "test",
        command: "pnpm test",
        cwd: ".",
      },
    ],
    acceptanceCriteria: spec.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      tests: criterion.tests,
    })),
  };
}
