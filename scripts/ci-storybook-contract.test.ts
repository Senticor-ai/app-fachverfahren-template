import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  needs?: unknown;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  steps?: WorkflowStep[];
}

describe("CI-STORYBOOK-001", () => {
  it("runs the Storybook Axe suite in an independent pinned Chromium job", () => {
    const workflow = parseYaml(
      readFileSync(".github/workflows/ci.yml", "utf8"),
    ) as { jobs?: Record<string, WorkflowJob> };
    const job = workflow.jobs?.["storybook-a11y"];
    expect(job).toBeDefined();
    expect(job?.needs).toBeUndefined();
    expect(job?.["runs-on"]).toBe("ubuntu-latest");
    expect(job?.["timeout-minutes"]).toBe(25);

    const steps = job?.steps ?? [];
    const checkout = steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    const setupNode = steps.find((step) =>
      step.uses?.startsWith("actions/setup-node@"),
    );
    expect(checkout?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/);
    expect(setupNode?.uses).toMatch(/^actions\/setup-node@[0-9a-f]{40}$/);
    expect(setupNode?.with?.["node-version"]).toBe(24);
    expect(
      steps.some((step) => step.run?.includes("scripts/ci-setup-node.sh")),
    ).toBe(true);
    expect(
      steps.some((step) => step.run === "pnpm install --frozen-lockfile"),
    ).toBe(true);
    expect(
      steps.some(
        (step) =>
          step.run === "pnpm exec playwright install --with-deps chromium",
      ),
    ).toBe(true);
    expect(steps.some((step) => step.run === "pnpm run test:storybook")).toBe(
      true,
    );
    expect(
      steps
        .filter((step) => step.uses)
        .every((step) => /@[0-9a-f]{40}$/.test(step.uses ?? "")),
    ).toBe(true);
  });

  it("runs test:storybook immediately after test in check:agent-release", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const commands =
      packageJson.scripts?.["check:agent-release"]
        ?.split("&&")
        .map((command) => command.trim()) ?? [];
    const unitTestIndex = commands.indexOf("pnpm run test");
    expect(unitTestIndex).toBeGreaterThanOrEqual(0);
    expect(commands[unitTestIndex + 1]).toBe("pnpm run test:storybook");
  });
});
