import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appNew,
  buildAgentContext,
  buildDiscovery,
  deriveModuleContract,
  readStructuredFile,
  validateAgentPreflight,
  validateSourceRegistry,
  type AppSpec,
} from "./agent-platform.ts";

const root = process.cwd();
const ignoredCopyParts = new Set([
  ".git",
  ".pnpm",
  ".pnpm-store",
  "coverage",
  "dist",
  "dist-server",
  "dist-types",
  "node_modules",
  "storybook-static",
]);

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
  });

  it("scaffolds an app spec idempotently", async () => {
    const temp = await mkdtemp(join(tmpdir(), "agent-app-new-"));
    try {
      await cp(root, temp, {
        recursive: true,
        filter: (path) =>
          !path.split("/").some((part) => ignoredCopyParts.has(part)),
      });
      const first = await appNew(temp, {
        specPath: "docs/examples/veranstaltungsanzeige/app.spec.yaml",
      });
      const second = await appNew(temp, {
        specPath: "docs/examples/veranstaltungsanzeige/app.spec.yaml",
      });
      expect(first.status).toBe("ok");
      expect(second.status).toBe("ok");
      expect(second.preserved).toContain("modules/event-notice");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("validates source registry and preflight contracts", async () => {
    expect(await validateSourceRegistry(root)).toEqual([]);
    expect(await validateAgentPreflight(root)).toEqual([]);
  });
});
