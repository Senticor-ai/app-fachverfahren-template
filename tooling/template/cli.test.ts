import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cli = join(process.cwd(), "tooling", "template", "cli.ts");
const cliUrl = new URL("./cli.ts", import.meta.url);

// Root-caused in infra#5 (flaky under CPU load): each `runTemplateSubprocess`
// call cold-spawns a fresh `node --experimental-strip-types` process that
// re-parses this file's own ~1929 lines PLUS the ~1818-line
// `lib/agent-platform.ts` (and the rest of `lib/`) from scratch every single
// time. On an idle machine that's cheap (~2s for the heaviest commands); under
// real CPU contention -- exactly what happens when CHOS-Code's Durchstich
// pipeline runs a generated app's `pnpm run test:template` gate synchronously
// inside the busy chos-code-runner pod -- it intermittently blows even a 20s
// per-test budget (observed live: "sometimes 2, sometimes 6" of these 7 tests
// timing out), which incorrectly BLOCKIERT/FEHLER's the whole governed run
// (see CHOS-CODE-Innovation#62/#64).
//
// `runTemplate` below fixes the actual root cause for 6 of the 7 cases: it
// invokes `cli.ts` IN-PROCESS via a cache-busted dynamic `import()` instead of
// spawning a subprocess. `cli.ts` has no `import.meta.main` guard -- it reads
// `process.argv` into module-level consts and runs `main()` unconditionally
// as a side effect of being imported -- so a fresh cache-busting query string
// per call forces Node to re-evaluate exactly `cli.ts`'s own ~80 lines of
// top-level setup, while its dependencies (`./lib/agent-platform.ts` and
// friends -- the actually expensive files) resolve to the SAME cached module
// instance across all calls in this file, since only the entrypoint's own
// specifier varies. That removes both the process-spawn overhead and the
// repeated full-dependency-tree re-parse for every case, without touching
// `cli.ts`'s own architecture (it has no exported command handlers to import
// directly -- see the ticket for why that's a much larger refactor).
//
// One thin end-to-end subprocess test (`emits machine-readable status`,
// below) is kept as originally written, proving the actual CLI binary/shebang
// entrypoint still works for a real `node --experimental-strip-types` launch,
// not just the in-process path this file otherwise exercises.
async function runTemplateSubprocess(args: string[]) {
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

let runCounter = 0;

async function runTemplate(args: string[]): Promise<string> {
  const originalArgv = process.argv;
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...values: unknown[]) => {
    lines.push(values.map(String).join(" "));
  };
  process.argv = [
    originalArgv[0] ?? process.execPath,
    cliUrl.pathname,
    ...args,
  ];
  try {
    // The query string is never read by cli.ts -- it exists purely to give
    // Node a distinct module cache key so the top-level side effect (main())
    // actually re-runs against the freshly-set process.argv above, instead of
    // resolving the already-cached module from a prior call in this file.
    await import(/* @vite-ignore */ `${cliUrl.href}?run=${runCounter++}`);
  } finally {
    console.log = originalLog;
    process.argv = originalArgv;
  }
  const exitCode = process.exitCode;
  process.exitCode = originalExitCode;
  if (exitCode) {
    throw new Error(
      `template CLI exited with code ${exitCode} for args ${JSON.stringify(args)}:\n${lines.join("\n")}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

afterEach(() => {
  // Belt-and-suspenders: runTemplate always restores this itself, but a
  // thrown assertion inside a test body could otherwise leave a stale
  // exitCode bleeding into whichever test runs next in this same worker.
  process.exitCode = undefined;
});

describe("template CLI", () => {
  it("emits machine-readable status", async () => {
    const output = await runTemplateSubprocess(["status", "--json"]);
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
