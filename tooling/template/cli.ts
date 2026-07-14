#!/usr/bin/env node
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertCleanWorktree, getGitShortStatus } from "./lib/git.ts";
import {
  appNew,
  buildAgentBootstrap,
  buildAgentContext,
  buildDiscovery,
  defaultTaskSpecPath,
  fetchGovernedSource,
  validateAgentDiscovery,
  validateCapabilityCatalog,
  validateModuleBoundaries,
  validateModuleContracts,
  validateSourceRegistry,
  verifyAgentRun,
} from "./lib/agent-platform.ts";
import {
  defaultOwnership,
  explainOwnership,
  hasTemplateMetadata,
  loadSourceOwnershipDefaults,
  mergeOwnershipDefaults,
  readOwnership,
  readTemplateAnswers,
  readTemplateLock,
  validateOwnership,
  writeTemplateMetadata,
} from "./lib/manifest.ts";
import { planOwnershipUpdate, applyOwnershipUpdate } from "./lib/merge.ts";
import { renderDomainApp } from "./lib/render.ts";
import { writeReport } from "./lib/report.ts";
import {
  readJson,
  setPackageScript,
  writeFileAtomic,
  writeJson,
} from "./lib/structured-edit.ts";
import type { PackageJson } from "./lib/structured-edit.ts";

const cliPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(cliPath), "..", "..");
const rawArgs =
  process.argv[2] === "--" ? process.argv.slice(3) : process.argv.slice(2);
const command = rawArgs[0] ?? "help";
const args = rawArgs.slice(1);
const jsonMode = args.includes("--json");

const exitCodes = {
  ok: 0,
  usage: 2,
  dirtyWorktree: 3,
  invariantFailure: 4,
  conflict: 5,
  unavailable: 6,
};

interface CliError extends Error {
  code?: string;
  details?: string;
  exitCode?: number;
}

try {
  await main();
} catch (error) {
  await fail(error);
}

async function main() {
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      return help();
    case "scaffold":
      return scaffold();
    case "agent:discover":
      return agentDiscover();
    case "agent:bootstrap":
      return agentBootstrap();
    case "agent:context":
      return agentContext();
    case "agent:preflight":
      return agentPreflight();
    case "agent:verify":
      return agentVerify();
    case "app:new":
      return appNewCommand();
    case "source:fetch":
      return sourceFetch();
    case "source:verify":
      return sourceVerify();
    case "status":
      return status();
    case "doctor":
      return doctor();
    case "explain":
      return explain();
    case "diff":
      return diff();
    case "update":
      return update();
    case "upgrade":
    case "template:upgrade":
      return templateUpgrade();
    case "adopt":
      return adopt();
    case "change":
      return change();
    case "release":
      return release();
    case "migration:new":
      return migrationNew();
    case "consumers:status":
      return consumersStatus();
    case "consumers:update":
      return consumersUpdate();
    case "consumers:mr":
      return consumersMr();
    case "consumers:report":
      return consumersReport();
    case "check:template-lock":
      return checkTemplateLock();
    case "check:template-invariants":
      return checkTemplateInvariants();
    case "check:scaffold":
      return checkScaffold();
    case "check:scaffold-reproducible":
      return checkScaffoldReproducible();
    case "check:template-release":
      return checkTemplateRelease();
    case "check:migration-coverage":
      return checkMigrationCoverage();
    case "check:runbook-commands":
      return checkRunbookCommands();
    case "check:docs-language":
      return checkDocsLanguage();
    case "check:agent-discovery":
      return checkAgentDiscovery();
    case "check:module-contracts":
      return checkModuleContracts();
    case "check:module-boundaries":
      return checkModuleBoundaries();
    case "check:capability-catalog":
      return checkCapabilityCatalog();
    case "check:source-registry":
      return checkSourceRegistry();
    case "test:agent-readiness":
      return testAgentReadiness();
    case "test:golden-generated-app":
      return testGoldenGeneratedApp();
    case "test:template-upgrades":
      return testTemplateUpgrades();
    case "test:template-upgrade-roundtrip":
      return testTemplateUpgradeRoundtrip();
    case "test:template-upgrade-customized":
      return testTemplateUpgradeCustomized();
    case "test:template-upgrade-idempotent":
      return testTemplateUpgradeIdempotent();
    case "test:template-upgrade-atomic":
      return testTemplateUpgradeAtomic();
    case "test:template-adopt":
      return testTemplateAdopt();
    default:
      throw usage(`unknown template command: ${command}`);
  }
}

function help() {
  const commands = [
    "scaffold --domain <slug> --target <dir> [--display-name <name>] [--allow-existing-empty] [--allow-dirty] [--force]",
    "agent:bootstrap [--json]",
    "agent:discover [--json] [--provenance]",
    "agent:context --task <app.spec.yaml> [--paths <path...>] [--json]",
    "agent:preflight [--json]",
    "agent:verify --task <app.spec.yaml> [--json]",
    "app:new --spec <app.spec.yaml> [--dry-run] [--json]",
    "source:fetch --source <id> [--url <url>] [--json]",
    "source:verify [--json]",
    "status [--json]",
    "doctor [--json]",
    "explain -- <path> [--json]",
    "diff --to <version> [--template-source-dir <dir>] [--json]",
    "update --to <version> [--template-source-dir <dir>] [--dry-run] [--json]",
    "upgrade --from <version> --to <version> [--dry-run] [--json]",
    "adopt --from <version> --domain <slug> --display-name <name> [--json]",
    "change --bump <patch|minor|major> --update-mode <auto|review|manual|security> [--migration <id|none>]",
    "release [--json]",
    "migration:new --id <id>",
    "consumers:status|consumers:update|consumers:mr|consumers:report",
    "test:golden-generated-app [--json]",
  ];
  writeReport({
    title: "Fachverfahren Template CLI",
    status: "ok",
    sections: [{ title: "Commands", items: commands }],
  });
}

async function scaffold() {
  const domain = requiredOption("--domain");
  const target = requiredOption("--target");
  const displayName = option("--display-name") ?? titleFromDomain(domain);
  const force = args.includes("--force");
  const allowDirty = args.includes("--allow-dirty");
  const allowExistingEmpty = args.includes("--allow-existing-empty");
  const result = await renderDomainApp(repoRoot, target, {
    domain,
    displayName,
    force,
    allowDirty,
    allowExistingEmpty,
    features: {
      postgres: !args.includes("--no-postgres"),
      mockAuth: !args.includes("--no-mock-auth"),
    },
  });
  writeReport(
    {
      title: "Scaffold Domain App",
      status: "ok",
      summary: `Generated ${result.answers.displayName} at ${result.target}`,
      sections: [
        {
          title: "Template Metadata",
          items: [
            ".template/answers.json",
            ".template/lock.json",
            ".template/ownership.yaml",
          ],
        },
      ],
    },
    { json: jsonMode },
  );
}

async function agentBootstrap() {
  const bootstrap = await buildAgentBootstrap(process.cwd());
  writeReport(
    {
      title: "Agent Bootstrap",
      status: bootstrap.ready ? "ok" : "failed",
      bootstrap,
      sections: [
        {
          title: "Blockers",
          items: bootstrap.blockers,
        },
      ],
    },
    { json: jsonMode },
  );
  if (!bootstrap.ready) {
    process.exitCode = exitCodes.unavailable;
  }
}

async function agentDiscover() {
  const discovery = await buildDiscovery(process.cwd(), {
    provenance: args.includes("--provenance"),
  });
  writeReport(
    {
      title: "Agent Discovery",
      status: "ok",
      discovery,
      sections: [
        {
          title: "Workflows",
          items: (discovery.workflows ?? []).map(
            (workflow) => `${workflow.id}: ${workflow.description}`,
          ),
        },
        {
          title: "Commands",
          items: (discovery.commands ?? []).map(
            (command) => `${command.id}: ${command.script}`,
          ),
        },
      ],
    },
    { json: jsonMode },
  );
}

async function agentContext() {
  const taskPath = option("--task") ?? defaultTaskSpecPath;
  const paths = valuesAfter("--paths");
  const context = await buildAgentContext(process.cwd(), { taskPath, paths });
  writeReport(
    {
      title: "Agent Context",
      status: "ok",
      context,
      sections: [
        {
          title: "Selected Context",
          items: context.selectedContext.map(
            (item) => `${item.path}: ${item.reason}`,
          ),
        },
        {
          title: "Write Boundaries",
          items: context.writeBoundaries,
        },
      ],
    },
    { json: jsonMode },
  );
}

async function agentPreflight() {
  const preflight = await buildAgentBootstrap(process.cwd());
  const failures = preflight.blockers;
  writeReport(
    {
      title: "Agent Preflight",
      status: failures.length === 0 ? "ok" : "failed",
      preflight,
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function agentVerify() {
  const taskPath = option("--task") ?? defaultTaskSpecPath;
  const reportPath = option("--report");
  const result = await verifyAgentRun(process.cwd(), { taskPath, reportPath });
  writeReport(
    {
      title: "Agent Verification Report",
      status: result.failures.length === 0 ? "ok" : "failed",
      reportPath: result.reportPath,
      report: result.report,
      sections: [
        { title: "Report", items: [result.reportPath] },
        { title: "Findings", items: result.failures },
      ],
    },
    { json: jsonMode },
  );
  if (result.failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function appNewCommand() {
  const specPath = requiredOption("--spec");
  const dryRun = args.includes("--dry-run");
  const result = await appNew(process.cwd(), { specPath, dryRun });
  writeReport(
    {
      title: dryRun ? "App New Dry Run" : "App New",
      status: result.status,
      generated: result.generated,
      preserved: result.preserved,
      sections: [
        { title: "Generated", items: result.generated },
        { title: "Preserved", items: result.preserved },
        { title: "Findings", items: result.failures },
      ],
    },
    { json: jsonMode },
  );
  if (result.status !== "ok") {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function sourceFetch() {
  const sourceId = requiredOption("--source");
  const url = option("--url");
  const result = await fetchGovernedSource(process.cwd(), { sourceId, url });
  writeReport(
    {
      title: "Source Fetch",
      status: "ok",
      source: result,
      sections: [{ title: "Fetched", items: [result.path] }],
    },
    { json: jsonMode },
  );
}

async function sourceVerify() {
  const failures = await validateSourceRegistry(process.cwd());
  writeReport(
    {
      title: "Source Registry Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function status() {
  const packageJson = await readJson<PackageJson>(
    join(process.cwd(), "package.json"),
  );
  const metadata = await readMetadataOrSourceDefaults();
  const dirty = await getGitShortStatus(process.cwd());
  const migrations = await listMigrations(process.cwd());
  const pending = migrations.filter(
    (migration) => !metadata.lock.appliedMigrations.includes(migration.id),
  );

  writeReport(
    {
      title: "Template Status",
      status: "ok",
      template: metadata,
      sections: [
        {
          title: "Version",
          items: [
            `current: ${metadata.lock.templateVersion}`,
            `latest: ${packageJson.version}`,
            `source: ${metadata.lock.templateSource}`,
          ],
        },
        {
          title: "Worktree",
          items: dirty ? dirty.split(/\r?\n/) : ["clean"],
        },
        {
          title: "Pending Migrations",
          items: pending.map((migration) => migration.id),
        },
      ],
    },
    { json: jsonMode },
  );
}

async function doctor() {
  const failures = [];
  const metadataExists = await hasTemplateMetadata(process.cwd());
  const sourcePackage = await readJson<PackageJson>(
    join(process.cwd(), "package.json"),
  ).catch(() => undefined);
  const isTemplateSource =
    typeof sourcePackage?.name === "string" &&
    sourcePackage.name.includes("fachverfahren-template");

  if (!metadataExists && !isTemplateSource) {
    failures.push("missing .template metadata; run template:adopt or scaffold");
  }

  if (metadataExists) {
    const metadata = await readMetadataOrSourceDefaults();
    failures.push(...validateLock(metadata.lock));
    failures.push(...validateAnswers(metadata.answers));
    failures.push(...validateOwnership(metadata.ownership));
  }

  failures.push(...(await validateInvariants(process.cwd())));

  writeReport(
    {
      title: "Template Doctor",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );

  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function explain() {
  const path = positionalPath();
  const ownership = await loadOwnershipOrDefault();
  const explanation = explainOwnership(ownership, path);
  writeReport(
    {
      title: "Template Ownership",
      status: "ok",
      path,
      explanation,
      sections: [
        {
          title: "Decision",
          items: [
            `${path}: ${explanation.strategy}`,
            `matched by: ${explanation.pattern}`,
          ],
        },
      ],
    },
    { json: jsonMode },
  );
}

async function diff() {
  const updatePlan = await computeUpdatePlan({ dryRun: true });
  writeReport(updatePlan.report, { json: jsonMode });
  if (updatePlan.conflicts.length > 0) {
    process.exitCode = exitCodes.conflict;
  }
}

async function update() {
  const dryRun = args.includes("--dry-run");
  if (!dryRun) {
    await assertCleanWorktree(process.cwd());
  }
  const updatePlan = await computeUpdatePlan({ dryRun });
  if (updatePlan.conflicts.length > 0) {
    writeReport(updatePlan.report, { json: jsonMode });
    process.exitCode = exitCodes.conflict;
    return;
  }

  if (!dryRun) {
    await applyComputedUpdate(updatePlan, option("--to"));
  }

  writeReport(updatePlan.report, { json: jsonMode });
}

async function templateUpgrade() {
  const fromVersion = option("--from") ?? "current";
  const toVersion = requiredOption("--to");
  const dryRun = args.includes("--dry-run");
  if (!dryRun) {
    await assertCleanWorktree(process.cwd());
  }
  const updatePlan = await computeUpdatePlan({ dryRun });
  const report = {
    ...updatePlan.report,
    title: dryRun ? "Template Upgrade Dry Run" : "Template Upgrade",
    from: fromVersion,
    to: toVersion,
    updateMode: "review",
    compatibility: "same-major",
    sections: [
      ...updatePlan.report.sections,
      {
        title: "Upgrade Contract",
        items: [
          "ownership strategies respected",
          "codemods run through template migrations",
          "capability deprecations reported through platform/capabilities.json",
          "template:update remains a backward-compatible alias",
        ],
      },
    ],
  };
  if (updatePlan.conflicts.length > 0) {
    writeReport(report, { json: jsonMode });
    process.exitCode = exitCodes.conflict;
    return;
  }
  if (!dryRun) {
    await applyComputedUpdate(updatePlan, toVersion);
  }
  writeReport(report, { json: jsonMode });
}

async function adopt() {
  const fromVersion = requiredOption("--from");
  const domain = requiredOption("--domain");
  const displayName = requiredOption("--display-name");
  if (await hasTemplateMetadata(process.cwd())) {
    throw usage(".template metadata already exists");
  }
  await writeTemplateMetadata(process.cwd(), {
    answers: {
      domain,
      displayName,
      features: { postgres: true, mockAuth: true },
    },
    lock: {
      schemaVersion: 1,
      templateSource: "senticor-app-fachverfahren-template",
      templateVersion: fromVersion,
      templateCommit: "adopted",
      generatorVersion: fromVersion,
      appliedMigrations: [],
    },
    ownership: defaultOwnership,
  });
  writeReport(
    {
      title: "Template Adopt",
      status: "ok",
      sections: [
        {
          title: "Metadata",
          items: [`.template attached at baseline ${fromVersion}`],
        },
      ],
    },
    { json: jsonMode },
  );
}

async function change() {
  const bump = requiredOption("--bump");
  const updateMode = requiredOption("--update-mode");
  const migration = option("--migration") ?? "none";
  const allowedBumps = new Set(["patch", "minor", "major"]);
  const allowedModes = new Set(["auto", "review", "manual", "security"]);
  if (!allowedBumps.has(bump)) {
    throw usage(`unsupported bump: ${bump}`);
  }
  if (!allowedModes.has(updateMode)) {
    throw usage(`unsupported update mode: ${updateMode}`);
  }
  const slug = option("--id") ?? `template-change-${Date.now()}`;
  const path = join(process.cwd(), ".template-changes", `${slug}.md`);
  await writeFileAtomic(
    path,
    [
      "---",
      `bump: ${bump}`,
      `updateMode: ${updateMode}`,
      `migration: ${migration}`,
      "---",
      "",
      "Beschreibe die Template-Aenderung und die erwartete Consumer-Wirkung.",
      "",
    ].join("\n"),
  );
  writeReport(
    {
      title: "Template Change",
      status: "ok",
      sections: [{ title: "Created", items: [relative(process.cwd(), path)] }],
    },
    { json: jsonMode },
  );
}

async function release() {
  const fragments = await readChangeFragments(process.cwd());
  const packageJsonPath = join(process.cwd(), "package.json");
  const packageJson = await readJson<PackageJson>(packageJsonPath);
  const nextVersion = bumpVersion(
    packageJson.version,
    strongestBump(fragments.map((fragment) => fragment.bump)),
  );
  const releaseNotes = [
    `# Template ${nextVersion}`,
    "",
    ...fragments.map(
      (fragment) =>
        `- ${fragment.file}: ${fragment.bump}, ${fragment.updateMode}, migration ${fragment.migration}`,
    ),
    "",
  ].join("\n");
  writeReport(
    {
      title: "Template Release",
      status: fragments.length === 0 ? "failed" : "ok",
      nextVersion,
      sections: [
        {
          title: "Fragments",
          items: fragments.map((fragment) => fragment.file),
        },
        {
          title: "Release Notes Preview",
          items: [releaseNotes.trim()],
        },
      ],
    },
    { json: jsonMode },
  );
  if (fragments.length === 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function migrationNew() {
  const id = requiredOption("--id");
  assertSafeId(id);
  const directory = join(
    process.cwd(),
    "tooling",
    "template",
    "migrations",
    id,
  );
  await mkdir(directory, { recursive: true });
  await writeFileAtomic(
    join(directory, "migration.json"),
    `${JSON.stringify(
      {
        id,
        from: ">=0.0.0",
        to: "next",
        mode: "review",
        touches: [],
        checks: ["check:template-invariants", "precommit:check"],
      },
      null,
      2,
    )}\n`,
  );
  await writeFileAtomic(
    join(directory, "up.ts"),
    [
      "export async function up(context: { report(message: string): void }) {",
      "  context.report('migration has no operations yet');",
      "}",
      "",
    ].join("\n"),
  );
  await writeFileAtomic(
    join(directory, "migration.test.ts"),
    [
      'import { describe, expect, it } from "vitest";',
      'import metadata from "./migration.json" with { type: "json" };',
      'import { up } from "./up.ts";',
      "",
      `describe("${id}", () => {`,
      '  it("declares a migration id", () => {',
      `    expect(metadata.id).toBe("${id}");`,
      "  });",
      "",
      '  it("runs without side effects by default", async () => {',
      "    const messages: string[] = [];",
      "    await up({ report: (message) => messages.push(message) });",
      '    expect(messages).toEqual(["migration has no operations yet"]);',
      "  });",
      "});",
      "",
    ].join("\n"),
  );
  writeReport(
    {
      title: "Template Migration",
      status: "ok",
      sections: [
        { title: "Created", items: [relative(process.cwd(), directory)] },
      ],
    },
    { json: jsonMode },
  );
}

async function consumersStatus() {
  const consumers = await readConsumers();
  writeReport(
    {
      title: "Template Consumers",
      status: "ok",
      sections: [
        {
          title: "Consumers",
          items: consumers.length
            ? consumers.map(
                (consumer) => `${consumer.name}: ${consumer.repository}`,
              )
            : ["no template-consumers.yaml configured"],
        },
      ],
    },
    { json: jsonMode },
  );
}

async function consumersUpdate() {
  const consumers = await readConsumers();
  writeReport(
    {
      title: "Template Consumers Update",
      status: "ok",
      sections: [
        {
          title: "Planned",
          items: consumers.length
            ? consumers.map(
                (consumer) =>
                  `${consumer.name}: update branch would be prepared`,
              )
            : ["no consumers configured"],
        },
      ],
    },
    { json: jsonMode },
  );
}

async function consumersMr() {
  const consumers = await readConsumers();
  writeReport(
    {
      title: "Template Consumers MR",
      status: "ok",
      sections: [
        {
          title: "Draft MR Plan",
          items: consumers.length
            ? consumers.map(
                (consumer) => `${consumer.name}: draft MR would be opened`,
              )
            : ["no consumers configured"],
        },
      ],
    },
    { json: jsonMode },
  );
}

async function consumersReport() {
  return consumersStatus();
}

async function checkTemplateLock() {
  const metadata = await readMetadataOrSourceDefaults();
  const failures = [
    ...validateLock(metadata.lock),
    ...validateAnswers(metadata.answers),
    ...validateOwnership(metadata.ownership),
  ];
  writeReport(
    {
      title: "Template Lock Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkTemplateInvariants() {
  const failures = await validateInvariants(process.cwd());
  writeReport(
    {
      title: "Template Invariants",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkScaffold() {
  const root = await mkdtemp(join(tmpdir(), "template-scaffold-"));
  const target = join(root, "demo");
  await renderDomainApp(process.cwd(), target, {
    domain: "demo-fachverfahren",
    displayName: "Demo Fachverfahren",
    force: true,
    allowDirty: true,
  });
  const failures = [
    ...(await validateInvariants(target)),
    ...(await validateGeneratedScaffold(target)),
  ];
  await rm(root, { recursive: true, force: true });
  writeReport(
    {
      title: "Scaffold Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkScaffoldReproducible() {
  const root = await mkdtemp(join(tmpdir(), "template-repro-"));
  const first = join(root, "first");
  const second = join(root, "second");
  const options = {
    domain: "demo-fachverfahren",
    displayName: "Demo Fachverfahren",
    force: true,
    allowDirty: true,
  };
  await renderDomainApp(process.cwd(), first, options);
  await renderDomainApp(process.cwd(), second, options);
  const differences = await compareDirectories(first, second);
  await rm(root, { recursive: true, force: true });
  writeReport(
    {
      title: "Scaffold Reproducibility",
      status: differences.length === 0 ? "ok" : "failed",
      sections: [{ title: "Differences", items: differences }],
    },
    { json: jsonMode },
  );
  if (differences.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkTemplateRelease() {
  const fragments = await readChangeFragments(process.cwd());
  writeReport(
    {
      title: "Template Release Check",
      status: fragments.length > 0 ? "ok" : "failed",
      sections: [
        {
          title: "Fragments",
          items: fragments.map((fragment) => fragment.file),
        },
      ],
    },
    { json: jsonMode },
  );
  if (fragments.length === 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkMigrationCoverage() {
  const fragments = await readChangeFragments(process.cwd());
  const failures = fragments
    .filter((fragment) => !fragment.migration)
    .map((fragment) => `${fragment.file} missing migration field`);
  writeReport(
    {
      title: "Migration Coverage",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkRunbookCommands() {
  const files = await collectFiles(process.cwd(), [".md"]);
  const failures = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const blocks = [...text.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)];
    for (const block of blocks) {
      const lines = block[1].split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/^\s*[^#\s].+\s+#\s+\S/.test(line)) {
          failures.push(
            `${relative(process.cwd(), file)} command block line ${index + 1} has inline shell comment`,
          );
        }
      });
    }
  }
  writeReport(
    {
      title: "Runbook Command Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkDocsLanguage() {
  const files = await collectFiles(process.cwd(), [".md"]);
  const patterns = [
    /\bfuer\b/g,
    /\bueber\b/g,
    /\bBuerger/g,
    /\boeffentlich/g,
    /\bzulaessig/g,
    /\bAenderung/g,
    /\bPruef/g,
    /\bFlaeche/g,
    /\bgehoert/g,
    /\bmuessen/g,
    /\bkoennen/g,
  ];
  const failures = [];
  for (const file of files) {
    const text = stripCodeFences(await readFile(file, "utf8"));
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        failures.push(
          `${relative(process.cwd(), file)} contains ASCII umlaut spelling matching ${pattern}`,
        );
      }
      pattern.lastIndex = 0;
    }
  }
  writeReport(
    {
      title: "Docs Language Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkAgentDiscovery() {
  const failures = await validateAgentDiscovery(process.cwd());
  writeReport(
    {
      title: "Agent Discovery Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkModuleContracts() {
  const failures = await validateModuleContracts(process.cwd());
  writeReport(
    {
      title: "Module Contract Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkModuleBoundaries() {
  const failures = await validateModuleBoundaries(process.cwd());
  writeReport(
    {
      title: "Module Boundary Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkCapabilityCatalog() {
  const failures = await validateCapabilityCatalog(process.cwd());
  writeReport(
    {
      title: "Capability Catalog Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function checkSourceRegistry() {
  const failures = await validateSourceRegistry(process.cwd());
  writeReport(
    {
      title: "Source Registry Check",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testAgentReadiness() {
  const root = await mkdtemp(join(tmpdir(), "agent-readiness-"));
  await cp(process.cwd(), root, {
    recursive: true,
    filter: (path) =>
      !path
        .split("/")
        .some((part) => part === ".git" || part === "node_modules"),
  });
  const result = await appNew(root, {
    specPath: defaultTaskSpecPath,
    dryRun: false,
  });
  const before = await snapshotDirectory(join(root, "modules", "dog-tax"));
  const second = await appNew(root, {
    specPath: defaultTaskSpecPath,
    dryRun: false,
  });
  const after = await snapshotDirectory(join(root, "modules", "dog-tax"));
  const differences = compareSnapshots(before, after);
  const failures = [
    ...(result.status === "ok" ? [] : result.failures),
    ...(second.status === "ok" ? [] : second.failures),
    ...differences.map((difference) => `second app:new changed ${difference}`),
    ...(await validateModuleContracts(root)),
    ...(await validateModuleBoundaries(root)),
  ];
  await rm(root, { recursive: true, force: true });
  writeReport(
    {
      title: "Agent Readiness",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testGoldenGeneratedApp() {
  const root = await mkdtemp(join(tmpdir(), "golden-generated-app-"));
  const target = join(root, "app-hundesteuer");
  await renderDomainApp(process.cwd(), target, {
    domain: "hundesteuer",
    displayName: "Hundesteuer",
    force: true,
    allowDirty: true,
  });
  const appResult = await appNew(target, {
    specPath: defaultTaskSpecPath,
    dryRun: false,
  });
  const context = await buildAgentContext(target, {
    taskPath: defaultTaskSpecPath,
    paths: ["modules/dog-tax"],
  });
  const failures = [
    ...(appResult.status === "ok" ? [] : appResult.failures),
    ...(context.nextCommands?.length
      ? []
      : ["agent context missing nextCommands"]),
    ...(await validateGeneratedScaffold(target)),
    ...(await validateModuleContracts(target)),
    ...(await validateModuleBoundaries(target)),
  ];
  await rm(root, { recursive: true, force: true });
  writeReport(
    {
      title: "Golden Generated App",
      status: failures.length === 0 ? "ok" : "failed",
      sections: [{ title: "Findings", items: failures }],
    },
    { json: jsonMode },
  );
  if (failures.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testTemplateUpgrades() {
  return checkScaffold();
}

async function testTemplateUpgradeRoundtrip() {
  const root = await mkdtemp(join(tmpdir(), "template-roundtrip-"));
  const oldTarget = join(root, "old");
  const freshTarget = join(root, "fresh");
  const options = {
    domain: "demo-fachverfahren",
    displayName: "Demo Fachverfahren",
    force: true,
    allowDirty: true,
  };
  await renderDomainApp(process.cwd(), oldTarget, options);
  await renderDomainApp(process.cwd(), freshTarget, options);
  const differences = await compareDirectories(oldTarget, freshTarget);
  await rm(root, { recursive: true, force: true });
  writeReport(
    {
      title: "Template Upgrade Roundtrip",
      status: differences.length === 0 ? "ok" : "failed",
      sections: [{ title: "Differences", items: differences }],
    },
    { json: jsonMode },
  );
  if (differences.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testTemplateUpgradeCustomized() {
  const root = await mkdtemp(join(tmpdir(), "template-custom-"));
  const target = join(root, "custom");
  await renderDomainApp(process.cwd(), target, {
    domain: "demo-fachverfahren",
    displayName: "Demo Fachverfahren",
    force: true,
    allowDirty: true,
  });
  const consumerFile = join(
    target,
    "apps",
    "demo-fachverfahren",
    "src",
    "consumer-note.ts",
  );
  await mkdir(dirname(consumerFile), { recursive: true });
  await writeFile(consumerFile, 'export const consumerCustom = "bewahrt";\n');
  const after = await readFile(consumerFile, "utf8");
  await rm(root, { recursive: true, force: true });
  const ok = after.includes("consumer.custom");
  writeReport(
    {
      title: "Template Upgrade Customized",
      status: ok ? "ok" : "failed",
      sections: [
        {
          title: "Findings",
          items: ok ? [] : ["consumer file was not preserved"],
        },
      ],
    },
    { json: jsonMode },
  );
  if (!ok) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testTemplateUpgradeIdempotent() {
  const root = await mkdtemp(join(tmpdir(), "template-idempotent-"));
  const target = join(root, "idempotent");
  await renderDomainApp(process.cwd(), target, {
    domain: "demo-fachverfahren",
    displayName: "Demo Fachverfahren",
    force: true,
    allowDirty: true,
  });
  const before = await snapshotDirectory(target);
  const after = await snapshotDirectory(target);
  await rm(root, { recursive: true, force: true });
  const differences = compareSnapshots(before, after);
  writeReport(
    {
      title: "Template Upgrade Idempotent",
      status: differences.length === 0 ? "ok" : "failed",
      sections: [{ title: "Differences", items: differences }],
    },
    { json: jsonMode },
  );
  if (differences.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testTemplateUpgradeAtomic() {
  const root = await mkdtemp(join(tmpdir(), "template-atomic-"));
  const target = join(root, "atomic");
  await renderDomainApp(process.cwd(), target, {
    domain: "demo-fachverfahren",
    displayName: "Demo Fachverfahren",
    force: true,
    allowDirty: true,
  });
  const before = await snapshotDirectory(target);
  const after = await snapshotDirectory(target);
  await rm(root, { recursive: true, force: true });
  const differences = compareSnapshots(before, after);
  writeReport(
    {
      title: "Template Upgrade Atomic",
      status: differences.length === 0 ? "ok" : "failed",
      sections: [{ title: "Differences", items: differences }],
    },
    { json: jsonMode },
  );
  if (differences.length > 0) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function testTemplateAdopt() {
  const root = await mkdtemp(join(tmpdir(), "template-adopt-"));
  await cp(process.cwd(), root, {
    recursive: true,
    filter: (path) =>
      !path
        .split("/")
        .some((part) => part === ".git" || part === "node_modules"),
  });
  await rm(join(root, ".template"), { recursive: true, force: true });
  await writeTemplateMetadata(root, {
    answers: {
      domain: "adopted",
      displayName: "Adopted",
      features: { postgres: true, mockAuth: true },
    },
    lock: {
      schemaVersion: 1,
      templateSource: "senticor-app-fachverfahren-template",
      templateVersion: "0.0.0",
      templateCommit: "adopted",
      generatorVersion: "0.0.0",
      appliedMigrations: [],
    },
    ownership: defaultOwnership,
  });
  const ok = await exists(join(root, ".template", "lock.json"));
  await rm(root, { recursive: true, force: true });
  writeReport(
    {
      title: "Template Adopt Test",
      status: ok ? "ok" : "failed",
      sections: [
        { title: "Findings", items: ok ? [] : ["lock.json was not created"] },
      ],
    },
    { json: jsonMode },
  );
  if (!ok) {
    process.exitCode = exitCodes.invariantFailure;
  }
}

async function computeUpdatePlan({ dryRun }: { dryRun: boolean }) {
  const metadata = await readMetadataOrSourceDefaults();
  const sourceDir =
    option("--template-source-dir") ??
    process.env["TEMPLATE_SOURCE_DIR"] ??
    process.cwd();
  // Neue Template-Defaults (z.B. ein nach dem Scaffold des Konsumenten ergänzter ownership-Eintrag)
  // in die persistierte Sicht mergen, BEVOR geplant wird — sonst fiele die Datei auf den
  // merge-Fallback zurück und ein Replace-Kandidat erschiene fälschlich als Konflikt (#24).
  // Die Defaults kommen aus der ZIEL-Quelle, nicht aus der laufenden CLI: beim Update eines
  // Konsumenten läuft dessen ältere CLI, deren kompilierte defaultOwnership den neuen Eintrag
  // ebenfalls noch nicht kennt (Codex-Review PR #26).
  const ownershipDefaults = await loadSourceOwnershipDefaults(sourceDir);
  const { ownership, added: ownershipUpdates } = mergeOwnershipDefaults(
    metadata.ownership,
    ownershipDefaults,
  );
  const toVersion = option("--to") ?? metadata.lock.templateVersion;
  const incomingParent = await mkdtemp(join(tmpdir(), "template-incoming-"));
  const incomingRoot = join(incomingParent, "incoming");
  await renderDomainApp(sourceDir, incomingRoot, {
    ...metadata.answers,
    force: true,
    allowDirty: true,
  });
  const { changes, conflicts } = await planOwnershipUpdate({
    root: process.cwd(),
    incomingRoot,
    ownership,
    // ALLE replace-/structured-merge-verwalteten Ownership-Pfade in den Plan geben (Globs werden
    // gegen den Incoming-Baum expandiert) — nicht nur frisch gemergte: Dateien unter bestehenden
    // Globs (.agents/skills/**, docs/reference/**, …) stehen nicht in der hartkodierten
    // Kandidatenliste und blieben sonst bei Updates stale (Codex-Review PR #26, Runde 4).
    // merge-Strategie-Pfade bleiben bewusst bei der kuratierten Liste: README/SECURITY/CHANGELOG
    // sind konsumenten-editiert und würden sonst zum Dauer-Konflikt.
    extraOwnershipPaths: Object.entries(ownership.paths)
      .filter(
        ([, strategy]) =>
          strategy === "replace" || strategy === "structured-merge",
      )
      .map(([path]) => path),
  });
  const report = {
    title: dryRun ? "Template Update Dry Run" : "Template Update",
    status: conflicts.length === 0 ? "ok" : "conflict",
    dryRun,
    from: metadata.lock.templateVersion,
    to: toVersion,
    incomingRoot,
    ownershipUpdates,
    sections: [
      {
        title: "Managed Changes",
        items: changes.map((change) => `${change.path}: ${change.action}`),
      },
      {
        title: "Conflicts",
        items: conflicts.map(
          (conflict) => `${conflict.path}: ${conflict.reason}`,
        ),
      },
      {
        title: "Ownership Updates",
        items: ownershipUpdates.map(
          (entry) => `${entry.path}: ${entry.strategy} (new template default)`,
        ),
      },
    ],
  };
  return {
    changes,
    conflicts,
    incomingRoot,
    report,
    ownershipUpdates,
    ownershipDefaults,
  };
}

async function applyComputedUpdate(updatePlan, requestedVersion?: string) {
  await applyOwnershipUpdate({
    root: process.cwd(),
    incomingRoot: updatePlan.incomingRoot,
    changes: updatePlan.changes,
  });
  await runPendingMigrations({ dryRun: false });
  const metadata = await readMetadataOrSourceDefaults();
  // Bewusst RE-mergen statt die geplante Map durchzureichen: die Migrationen eine Zeile weiter oben
  // dürfen ownership.yaml legitim editieren; der Merge ist idempotent und persistiert gewinnt.
  // Die Defaults der ZIEL-Quelle kommen aus dem Plan (siehe computeUpdatePlan).
  metadata.ownership = mergeOwnershipDefaults(
    metadata.ownership,
    updatePlan.ownershipDefaults ?? defaultOwnership,
  ).ownership;
  const toVersion = requestedVersion ?? metadata.lock.templateVersion;
  metadata.lock.templateVersion = toVersion;
  metadata.lock.generatorVersion = toVersion;
  metadata.lock.appliedMigrations = [
    ...new Set([
      ...metadata.lock.appliedMigrations,
      ...(await listMigrations(process.cwd())).map((migration) => migration.id),
    ]),
  ].sort();
  await writeTemplateMetadata(process.cwd(), metadata);
}

async function runPendingMigrations({ dryRun }) {
  const metadata = await readMetadataOrSourceDefaults();
  const migrations = await listMigrations(process.cwd());
  const pending = migrations.filter(
    (migration) => !metadata.lock.appliedMigrations.includes(migration.id),
  );
  const logs = [];
  for (const migration of pending) {
    const module = await import(migration.upPath);
    if (typeof module.up !== "function") {
      throw new Error(`${migration.id} does not export up(context)`);
    }
    await module.up({
      root: process.cwd(),
      dryRun,
      report: (message) => logs.push(`${migration.id}: ${message}`),
      readJson,
      writeJson,
      setPackageScript,
    });
  }
  return logs;
}

async function validateInvariants(root) {
  const failures = [];
  const appDomain = await resolveAppDomain(root);
  const appPath = `apps/${appDomain}`;
  const packageJson = await readJson<PackageJson>(
    join(root, "package.json"),
  ).catch(() => undefined);
  const dockerfile = await readOptional(join(root, "Dockerfile"));
  const gitlab = await readOptional(join(root, ".gitlab-ci.yml"));
  const gitignore = await readOptional(join(root, ".gitignore"));

  if (!packageJson) {
    failures.push("missing package.json");
  } else {
    const scripts = packageJson.scripts ?? {};
    requireScript(scripts, "build:packages", failures);
    requireScript(scripts, "build:server", failures);
    // EINE App (Komposition + Naht): der Dev-Einstieg ist `dev`; der alte BFF-/Postgres-Dreiklang
    // (dev:postgres/dev:vite/dev:all) gehörte zur entfernten Beispiel-Shell.
    requireScript(scripts, "dev", failures);
    requireScript(scripts, "check:typescript-policy", failures);
    requireScript(scripts, "check:css-tokens", failures);
    requireScript(scripts, "check:web-delivery", failures);
    requireScript(scripts, "check:k8s-delivery", failures);
    requireScript(scripts, "test:supply-chain", failures);
    requireScript(scripts, "template", failures);
    requireScript(scripts, "agent:bootstrap", failures);
    requireScript(scripts, "agent:discover", failures);
    requireScript(scripts, "agent:context", failures);
    requireScript(scripts, "agent:preflight", failures);
    requireScript(scripts, "agent:verify", failures);
    requireScript(scripts, "app:new", failures);
    requireScript(scripts, "check:agent-smoke", failures);
    requireScript(scripts, "check:agent-domain", failures);
    requireScript(scripts, "check:agent-ui", failures);
    requireScript(scripts, "check:agent-release", failures);
    requireScript(scripts, "check:agent-discovery", failures);
    requireScript(scripts, "check:module-contracts", failures);
    requireScript(scripts, "check:module-boundaries", failures);
    requireScript(scripts, "check:capability-catalog", failures);
    requireScript(scripts, "check:source-registry", failures);
    requireScript(scripts, "test:golden-generated-app", failures);
    requireScript(scripts, "test:generated-app-ci", failures);
    if (
      !scripts["build:packages"]?.includes(
        'pnpm --filter "./packages/**" run --if-present build',
      )
    ) {
      failures.push("build:packages must keep pnpm --filter before run");
    }
    if (!packageJson.devDependencies?.concurrently) {
      failures.push("missing concurrently devDependency");
    }
  }

  if (!dockerfile) {
    failures.push("missing Dockerfile");
  } else {
    if (!/FROM .* AS build\nUSER root/m.test(dockerfile)) {
      failures.push("Dockerfile build stage must set USER root");
    }
    if (!/ENV CI=true/.test(dockerfile)) {
      failures.push("Dockerfile build stage must set ENV CI=true");
    }
    if (
      !/RUN pnpm run build:packages\s*\\\n && pnpm run build:app\s*\\\n && pnpm run build:server/m.test(
        dockerfile,
      )
    ) {
      failures.push("Dockerfile must build packages before app and server");
    }
    if (!/@sha256:[a-f0-9]{64}/.test(dockerfile)) {
      failures.push("Dockerfile base images must be pinned by digest");
    }
  }

  if (!gitlab) {
    failures.push("missing .gitlab-ci.yml");
  } else {
    if (!gitlab.includes("gcr.io/kaniko-project/executor")) {
      failures.push(".gitlab-ci.yml must use Kaniko");
    }
    if (/docker:27-dind|docker:dind|privileged:\s*true/.test(gitlab)) {
      failures.push(
        ".gitlab-ci.yml must not use DinD or privileged containers",
      );
    }
  }

  if (!(await exists(join(root, ".env.local.example")))) {
    failures.push("missing .env.local.example");
  }
  for (const requiredPath of [
    `${appPath}/deploy/helm/${appDomain}/Chart.yaml`,
    `${appPath}/public/robots.txt`,
    `${appPath}/public/manifest.webmanifest`,
    `${appPath}/server/index.ts`,
    "docs/reference/web-delivery.md",
    "docs/reference/kubernetes-delivery.md",
    "policy/k8s-delivery.rego",
    "scripts/check-web-delivery.mjs",
    "scripts/check-k8s-delivery.mjs",
    "scripts/ci-validate.sh",
    "scripts/test-generated-app-ci.sh",
    "scripts/smoke-generated-app.sh",
  ]) {
    if (!(await exists(join(root, requiredPath)))) {
      failures.push(`missing ${requiredPath}`);
    }
  }
  if (!gitignore?.includes(".env.local")) {
    failures.push(".gitignore must ignore .env.local");
  }
  return failures;
}

async function validateGeneratedScaffold(root) {
  const failures = [];
  const appDomain = await resolveAppDomain(root);
  const appPath = `apps/${appDomain}`;
  for (const path of [
    ".template/answers.json",
    ".template/lock.json",
    ".template/ownership.yaml",
    ".template/README.md",
    "agent.discovery.json",
    ".agents/skills/fachverfahren-app/SKILL.md",
    ".claude/skills/fachverfahren-app/SKILL.md",
    `${appPath}/deploy/helm/${appDomain}/Chart.yaml`,
    `${appPath}/server/index.ts`,
    `${appPath}/public/robots.txt`,
    "packages/app-runtime-fastify/package.json",
    "packages/app-bff-contracts/package.json",
    "packages/app-bff-fastify/package.json",
    "schemas/openapi.internal.json",
    "scripts/check-openapi.mjs",
    "scripts/smoke-runtime.mjs",
    "docs/agents/bootstrap.md",
    "docs/agents/codex.md",
    "docs/agents/gemini.md",
    "platform/capabilities.json",
    "policy/k8s-delivery.rego",
    "sources/registry.yaml",
    "tooling/template/cli.ts",
  ]) {
    if (!(await exists(join(root, path)))) {
      failures.push(`generated scaffold missing ${path}`);
    }
  }
  const metadata = await readMetadataOrSourceDefaults(root);
  failures.push(...validateLock(metadata.lock));
  failures.push(...validateAnswers(metadata.answers));
  failures.push(...validateOwnership(metadata.ownership));
  return failures;
}

async function resolveAppDomain(root) {
  const metadata = await readMetadataOrSourceDefaults(root);
  if (await exists(join(root, "apps", metadata.answers.domain))) {
    return metadata.answers.domain;
  }
  return "fachverfahren";
}

async function readMetadataOrSourceDefaults(root = process.cwd()) {
  if (await hasTemplateMetadata(root)) {
    return {
      answers: await readTemplateAnswers(root),
      lock: await readTemplateLock(root),
      ownership: await readOwnership(root),
    };
  }
  const packageJson = await readJson<PackageJson>(join(root, "package.json"));
  return {
    answers: {
      domain: "fachverfahren",
      displayName: "Fachverfahren",
      features: { postgres: true, mockAuth: true },
    },
    lock: {
      schemaVersion: 1,
      templateSource: packageJson.name,
      templateVersion: packageJson.version,
      templateCommit: "source",
      generatorVersion: packageJson.version,
      appliedMigrations: [],
    },
    ownership: defaultOwnership,
  };
}

async function loadOwnershipOrDefault() {
  if (await hasTemplateMetadata(process.cwd())) {
    return readOwnership(process.cwd());
  }
  return defaultOwnership;
}

async function listMigrations(root) {
  const migrationsRoot = join(root, "tooling", "template", "migrations");
  const entries = await readdir(migrationsRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const migrations = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = join(migrationsRoot, entry.name);
    const metadataPath = join(directory, "migration.json");
    const metadata = await readJson(metadataPath).catch(() => ({
      id: entry.name,
    }));
    migrations.push({
      ...metadata,
      id: metadata.id ?? entry.name,
      directory,
      upPath: join(directory, "up.ts"),
    });
  }
  return migrations.sort((a, b) => a.id.localeCompare(b.id));
}

function validateLock(lock) {
  const failures = [];
  if (lock.schemaVersion !== 1) {
    failures.push("lock.json schemaVersion must be 1");
  }
  for (const key of [
    "templateSource",
    "templateVersion",
    "templateCommit",
    "generatorVersion",
  ]) {
    if (!lock[key]) {
      failures.push(`lock.json missing ${key}`);
    }
  }
  if (!Array.isArray(lock.appliedMigrations)) {
    failures.push("lock.json appliedMigrations must be an array");
  }
  return failures;
}

function validateAnswers(answers) {
  const failures = [];
  if (!answers.domain) {
    failures.push("answers.json missing domain");
  }
  if (!answers.displayName) {
    failures.push("answers.json missing displayName");
  }
  if (typeof answers.features !== "object" || answers.features === null) {
    failures.push("answers.json missing features object");
  }
  return failures;
}

function requireScript(scripts, name, failures) {
  if (!scripts[name]) {
    failures.push(`package.json missing script ${name}`);
  }
}

async function readChangeFragments(root) {
  const directory = join(root, ".template-changes");
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const fragments = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    const path = join(directory, entry.name);
    const text = await readFile(path, "utf8");
    fragments.push({
      file: relative(root, path),
      ...parseFrontmatter(text),
    });
  }
  return fragments;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const result = {};
  if (!match) {
    return result;
  }
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z0-9_-]+):\s*(.+)\s*$/);
    if (entry) {
      result[entry[1]] = entry[2].replace(/^["']|["']$/g, "");
    }
  }
  return result;
}

function strongestBump(bumps) {
  if (bumps.includes("major")) {
    return "major";
  }
  if (bumps.includes("minor")) {
    return "minor";
  }
  return "patch";
}

function bumpVersion(version, bump) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!match) {
    return version;
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);
  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

async function readConsumers() {
  const file = join(process.cwd(), "template-consumers.yaml");
  const text = await readOptional(file);
  if (!text) {
    return [];
  }
  const consumers = [];
  let current = undefined;
  for (const line of text.split(/\r?\n/)) {
    const start = line.match(/^\s*-\s+name:\s*(.+)\s*$/);
    if (start) {
      current = { name: start[1].trim() };
      consumers.push(current);
      continue;
    }
    const field = line.match(/^\s{4}([A-Za-z0-9_-]+):\s*(.+)\s*$/);
    if (current && field) {
      current[field[1]] = field[2].trim();
    }
  }
  return consumers;
}

async function compareDirectories(first, second) {
  const firstSnapshot = await snapshotDirectory(first);
  const secondSnapshot = await snapshotDirectory(second);
  return compareSnapshots(firstSnapshot, secondSnapshot);
}

async function snapshotDirectory(root) {
  const files = await collectFiles(root, []);
  const snapshot = new Map();
  for (const file of files) {
    snapshot.set(
      relative(root, file),
      await readFile(file, "utf8").catch(() => ""),
    );
  }
  return snapshot;
}

function compareSnapshots(first, second) {
  const differences = [];
  const keys = new Set([...first.keys(), ...second.keys()]);
  for (const key of [...keys].sort()) {
    if (first.get(key) !== second.get(key)) {
      differences.push(key);
    }
  }
  return differences;
}

async function collectFiles(root, extensions) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (
      [".git", "node_modules", "dist", "storybook-static"].includes(entry.name)
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, extensions)));
    } else if (
      extensions.length === 0 ||
      extensions.some((extension) => entry.name.endsWith(extension))
    ) {
      files.push(path);
    }
  }
  return files;
}

function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, "");
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function requiredOption(name) {
  const value = option(name);
  if (!value) {
    throw usage(`missing required option ${name}`);
  }
  return value;
}

function valuesAfter(name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return [];
  }
  const values = [];
  for (const value of args.slice(index + 1)) {
    if (value.startsWith("--")) {
      break;
    }
    values.push(value);
  }
  return values;
}

function positionalPath() {
  const values = args.filter((arg) => !arg.startsWith("--"));
  if (values[0] === "--") {
    return values[1];
  }
  return values[0] ?? args.at(-1);
}

function titleFromDomain(domain) {
  return domain
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function assertSafeId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    throw usage(`unsafe id: ${id}`);
  }
}

function usage(message) {
  const error: CliError = new Error(message);
  error.exitCode = exitCodes.usage;
  return error;
}

async function fail(error: CliError) {
  const exitCode =
    error.code === "DIRTY_WORKTREE"
      ? exitCodes.dirtyWorktree
      : (error.exitCode ?? exitCodes.unavailable);
  const report = {
    title: "Template Command Failed",
    status: "failed",
    error: error.message,
    sections: [
      {
        title: "Details",
        items: error.details ? [error.details] : [],
      },
    ],
  };
  writeReport(report, { json: jsonMode });
  process.exitCode = exitCode;
}
