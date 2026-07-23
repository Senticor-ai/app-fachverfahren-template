import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import { getGitCommit, getGitShortStatus } from "./git.ts";
import { readJson, writeFileAtomic } from "./structured-edit.ts";
import type { PackageJson } from "./structured-edit.ts";

const execFileAsync = promisify(execFile);
export const discoveryPath = "agent.discovery.json";
export const defaultTaskSpecPath = "docs/examples/hundesteuer/app.spec.yaml";

/** Ein Übergang der Fall/Dossier-Zustandsmaschine im governten Spec. `requiredPermission` ist optional
 *  (die Naht/Runtime injiziert sonst die Stub-Konstante); `requiresFourEyes`/`closesCase` sind fachliche Wahrheit. */
export interface SpecProcedureTransition {
  from: string;
  to: string;
  action: string;
  requiredPermission?: string;
  requiresFourEyes?: boolean;
  closesCase?: boolean;
}

/** OPTIONALER Dossier-Block: die SDK-`ProcedureVersion` (Zustandsmaschine + Rechtsgrundlagen) als DATEN im
 *  governten `app.spec.yaml`. Seine PRÄSENZ markiert ein Fall/Dossier-Verfahren — Antrag-nur-Apps lassen ihn weg.
 *  Spiegelt `apps/fachverfahren/server/procedure.config.ts` (`dossierProcedure`); ein späterer Emit-Schritt kann
 *  daraus die Naht schreiben. Rechtsgrundlagen/Version werden NIE aus der BPMN erfunden. */
export interface SpecProcedure {
  procedureId: string;
  version: string;
  effectiveFrom?: string;
  legalBasisIds: string[];
  allowedStates: string[];
  allowedTransitions: SpecProcedureTransition[];
  /** OPTIONALE Provenienz: die FIM/KGSt-BPMN, aus der die Zustandsmaschine abgeleitet wurde (muss laut
   *  check:bpmn-example mit ihr deckungsgleich sein). */
  bpmnPath?: string;
}

export interface AppSpec {
  schemaVersion: string;
  id: string;
  displayName: string;
  module: {
    id: string;
    destination: string;
    owner: string;
    lifecycle: string;
    riskClass: string;
  };
  personas: string[];
  roles: string[];
  journeys: { id: string; title: string; surface: string }[];
  acceptanceCriteria: { id: string; text: string; tests: string[] }[];
  assumptions: string[];
  nonGoals: string[];
  fim?: { sourceId: string; rootId: string; services?: Record<string, string> };
  dataClassifications: string[];
  requiredCapabilities: string[];
  permittedExternalSources: string[];
  routes: { path: string; surface: string }[];
  workflows: string[];
  integrations: string[];
  humanApproval?: string[];
  /** OPTIONAL: markiert ein Fall/Dossier-Verfahren (Antrag-nur-Apps lassen es weg). */
  procedure?: SpecProcedure;
  domainVocabulary: string[];
}

export interface ModuleContract {
  schemaVersion: string;
  moduleId: string;
  lifecycle: string;
  owner: string;
  riskClass: string;
  publicExports: string[];
  permittedDependencies: string[];
  consumedCapabilities: string[];
  routes: { path: string; surface: string }[];
  roles: string[];
  permissions: string[];
  dataClassifications: string[];
  retention: string[];
  events: {
    produces: string[];
    consumes: string[];
  };
  storage: {
    migrations: string[];
    ownsTables: string[];
  };
  externalSources: string[];
  requiredTests: string[];
  vocabulary: string[];
  allowedDomainPaths: string[];
}

interface AgentCommandPlan {
  id: string;
  command: string;
  cwd: string;
  writes: boolean;
  expectedArtifacts: string[];
  followUpChecks: string[];
  followUpCwd?: string;
}

export interface SourceRegistry {
  schemaVersion: string;
  sources: {
    id: string;
    origins: string[];
    paths: string[];
    redirectPolicy: "same-origin" | "none";
    methods: string[];
    authority: string;
    expectedContentTypes: string[];
    citationRequired: boolean;
    reuseConstraints: string;
    cache: string;
    retention: string;
    humanReviewRequired: boolean;
    defaultUrl?: string;
  }[];
}

interface AgentDiscoveryManifest {
  [key: string]: unknown;
  schemaVersion?: string;
  commands?: { id: string; script: string }[];
  workflows?: { id: string; description: string }[];
  validationProfiles?: { id: string; script: string }[];
  provenance?: unknown;
  packageScripts?: Record<string, string>;
}

export async function buildDiscovery(
  root: string,
  options: { provenance?: boolean } = {},
) {
  const discovery = await readJson<AgentDiscoveryManifest>(
    join(root, discoveryPath),
  );
  const packageJson = await readJson<PackageJson>(join(root, "package.json"));
  const result: AgentDiscoveryManifest = stableClone({
    ...discovery,
    packageScripts: scriptsForDiscovery(discovery, packageJson),
  });
  if (options.provenance) {
    result.provenance = stableClone({
      files: await hashFiles(root, [
        discoveryPath,
        "AGENTS.md",
        "docs/agents/bootstrap.md",
        ".agents/skills/fachverfahren-app/SKILL.md",
        ".agents/skills/ux-ui/SKILL.md",
      ]),
      packageManager: packageJson.packageManager,
    });
  }
  return result;
}

export async function buildAgentBootstrap(root: string) {
  const packageJson = await readJson<PackageJson>(join(root, "package.json"));
  const requiredCommands = [
    "agent:bootstrap",
    "agent:discover",
    "agent:context",
    "agent:preflight",
    "agent:verify",
    "app:new",
  ];
  const commandFailures = requiredCommands
    .filter((script) => !packageJson.scripts?.[script])
    .map((script) => `package.json missing script ${script}`);
  const preflightFailures = await validateAgentPreflight(root);
  const nodeMajor = Number(process.versions.node.split(".")[0] ?? 0);
  const nodeRequirement =
    typeof packageJson.engines === "object" && packageJson.engines !== null
      ? String((packageJson.engines as Record<string, unknown>).node)
      : ">=24 <25";
  const pnpmVersion = await commandVersion("pnpm", ["--version"]);
  const checks = [
    {
      id: "node",
      status: nodeMajor === 24 ? "ok" : "failed",
      detail: `current ${process.version}; required ${nodeRequirement}`,
    },
    {
      id: "package-manager",
      status: packageJson.packageManager?.startsWith("pnpm@") ? "ok" : "failed",
      detail: packageJson.packageManager ?? "missing packageManager",
    },
    {
      id: "pnpm-lock",
      status: (await exists(join(root, "pnpm-lock.yaml"))) ? "ok" : "failed",
      detail: "pnpm-lock.yaml",
    },
    {
      id: "dependencies",
      status: (await exists(join(root, "node_modules"))) ? "ok" : "failed",
      detail: "node_modules",
      remediation: "pnpm install --frozen-lockfile",
    },
    {
      id: "pnpm",
      status: pnpmVersion.ok ? "ok" : "failed",
      detail: pnpmVersion.value,
    },
    {
      id: "agent-contracts",
      status:
        preflightFailures.length === 0 && commandFailures.length === 0
          ? "ok"
          : "failed",
      detail: [...preflightFailures, ...commandFailures].join("; "),
    },
  ];
  const blockers = checks
    .filter((check) => check.status !== "ok")
    .map((check) => `${check.id}: ${check.detail}`);
  const dirtyStatus = await getGitShortStatus(root);
  return stableClone({
    schemaVersion: "1.0.0",
    ready: blockers.length === 0,
    installCommand: "pnpm install --frozen-lockfile",
    source: {
      commit: await getGitCommit(root),
      dirty: dirtyStatus !== "",
      status: dirtyStatus,
    },
    checks,
    blockers,
    requiredCommands,
    validationProfiles: buildValidationProfiles(),
  });
}

export async function buildAgentContext(
  root: string,
  { taskPath, paths = [] }: { taskPath: string; paths?: string[] },
) {
  const spec = await readStructuredFile<AppSpec>(join(root, taskPath));
  const discovery = await readJson(join(root, discoveryPath));
  const capabilities = await readJson<{
    capabilities: Array<{
      id: string;
      documentation: string;
    }>;
  }>(join(root, "platform/capabilities.json"));
  const selectedCapabilities = (capabilities.capabilities ?? []).filter(
    (capability) => spec.requiredCapabilities.includes(capability.id),
  );
  const selectedSources = await selectedSourceEntries(root, spec);
  const policyItems = [
    selectContextItem(root, "AGENTS.md", "root policy"),
    selectContextItem(
      root,
      "docs/agents/bootstrap.md",
      "vendor-neutral bootstrap",
    ),
    selectContextItem(
      root,
      ".agents/skills/fachverfahren-app/SKILL.md",
      "domain module workflow",
    ),
    selectContextItem(
      root,
      ".agents/skills/ux-ui/SKILL.md",
      "UI and screen-contract workflow",
    ),
    selectContextItem(
      root,
      "docs/ux-ui/fachverfahren-ux-contract.md",
      "UX contract",
    ),
    selectContextItem(
      root,
      "docs/reference/test-driven-development.md",
      "TDD workflow",
    ),
    selectContextItem(
      root,
      "docs/reference/fachverfahren-kit-components.md",
      "component catalog",
    ),
  ];
  const capabilityDocs = selectedCapabilities.map((capability) =>
    selectContextItem(
      root,
      capability.documentation,
      `capability:${capability.id}`,
    ),
  );
  const sourceDocs = selectedSources.map((source) => ({
    path: "sources/registry.yaml",
    reason: `source:${source.id}`,
  }));
  const resolved = await Promise.all([...policyItems, ...capabilityDocs]);
  const contextItems = [
    ...resolved,
    ...sourceDocs,
    {
      path: taskPath,
      reason: "task specification",
      sha256: await fileSha256(join(root, taskPath)),
    },
  ].sort((a, b) => a.path.localeCompare(b.path));
  const relevantChecks = [
    "check:agent-discovery",
    "check:module-contracts",
    "check:module-boundaries",
    "check:capability-catalog",
    "check:source-registry",
    "check:domain-contracts",
    "check:storybook",
    "test",
  ];
  return stableClone({
    schemaVersion: "1.0.0",
    task: taskPath,
    taskId: spec.id,
    instructionPrecedence: discovery.instructionPrecedence,
    selectedContext: contextItems,
    selectedCapabilities: selectedCapabilities
      .map((capability) => capability.id)
      .sort(),
    selectedSources: selectedSources.map((source) => source.id).sort(),
    writeBoundaries: [
      spec.module.destination,
      `${dirname(taskPath)}/`,
      ".agent/runs/",
      ...(spec.permittedExternalSources.length ? [".agent/sources/"] : []),
    ].sort(),
    requestedPaths: [...paths].sort(),
    relevantChecks,
    validationProfiles: buildValidationProfiles(),
    nextCommands: buildNextCommands(spec, taskPath),
    estimatedContextBytes: contextItems.reduce(
      (sum, item) => sum + ((item as { sizeBytes?: number }).sizeBytes ?? 0),
      0,
    ),
  });
}

export async function validateAgentPreflight(root: string) {
  const failures = [
    ...(await validateAgentDiscovery(root)),
    ...(await validateModuleContracts(root)),
    ...(await validateModuleBoundaries(root)),
    ...(await validateCapabilityCatalog(root)),
    ...(await validateSourceRegistry(root)),
  ];
  return failures.sort();
}

export async function validateAgentDiscovery(root: string) {
  const failures: string[] = [];
  const discovery = await readJson(join(root, discoveryPath)).catch((error) => {
    failures.push(`cannot read ${discoveryPath}: ${error.message}`);
    return undefined;
  });
  if (!discovery) {
    return failures;
  }
  for (const key of ["$schema", "schemaVersion", "templateVersion"]) {
    if (!discovery[key]) {
      failures.push(`${discoveryPath} missing ${key}`);
    }
  }
  if (JSON.stringify(discovery).includes(resolve(root))) {
    failures.push(
      `${discoveryPath} must not include absolute repository paths`,
    );
  }
  const referencedFiles = [
    ...(discovery.requiredFiles ?? []),
    ...(discovery.skills ?? []).map((skill) => skill.path),
    ...(discovery.schemas ?? []).map((schema) => schema.path),
    ...(discovery.componentLibraries ?? []).flatMap((library) =>
      [library.entrypoint, library.catalog].filter(Boolean),
    ),
  ].filter(Boolean);
  for (const path of referencedFiles) {
    if (isAbsoluteOrEscaping(path)) {
      failures.push(`${discoveryPath} references non-relative path ${path}`);
    } else if (!(await exists(join(root, path)))) {
      failures.push(`${discoveryPath} references missing path ${path}`);
    }
  }
  const referencedDirectories = (discovery.componentLibraries ?? [])
    .map((library) => library.path)
    .filter(Boolean);
  for (const path of referencedDirectories) {
    if (isAbsoluteOrEscaping(path)) {
      failures.push(`${discoveryPath} references non-relative path ${path}`);
      continue;
    }
    try {
      if (!(await stat(join(root, path))).isDirectory()) {
        failures.push(`${discoveryPath} references non-directory path ${path}`);
      }
    } catch {
      failures.push(`${discoveryPath} references missing path ${path}`);
    }
  }
  const packageJson = await readJson<PackageJson>(join(root, "package.json"));
  const scripts = packageJson.scripts ?? {};
  for (const command of discovery.commands ?? []) {
    if (!scripts[command.script]) {
      failures.push(`package.json missing script ${command.script}`);
    }
  }
  failures.push(...(await validateSkillShims(root)));
  failures.push(...(await validateDomainLeakage(root)));
  return failures;
}

export async function validateModuleContracts(root: string) {
  const failures: string[] = [];
  const moduleDirs = await listModuleDirectories(root);
  for (const moduleDir of moduleDirs) {
    const contractPath = join(moduleDir, "module.contract.yaml");
    if (!(await exists(contractPath))) {
      failures.push(
        `${relative(root, moduleDir)} missing module.contract.yaml`,
      );
      continue;
    }
    const contract = await readStructuredFile<ModuleContract>(contractPath);
    if (!contract.schemaVersion) {
      failures.push(`${relative(root, contractPath)} missing schemaVersion`);
    }
    if (!contract.moduleId) {
      failures.push(`${relative(root, contractPath)} missing moduleId`);
    }
    if (!Array.isArray(contract.consumedCapabilities)) {
      failures.push(
        `${relative(root, contractPath)} missing consumedCapabilities`,
      );
    }
    const domainModule = await readOptional(
      join(moduleDir, "domain.module.yaml"),
    );
    const id = domainModule?.match(/^id:\s*(.+)\s*$/m)?.[1]?.trim();
    if (
      id &&
      contract.moduleId !== "replace-with-domain-id" &&
      id !== contract.moduleId
    ) {
      failures.push(
        `${relative(root, contractPath)} moduleId ${contract.moduleId} does not match domain.module.yaml id ${id}`,
      );
    }
  }
  return failures;
}

export async function validateModuleBoundaries(root: string) {
  const failures: string[] = [];
  const sourceFiles = await collectFiles(root, [".ts", ".tsx"]);
  const platformFiles = sourceFiles.filter((file) =>
    /\/(packages|apps|jurisdictions)\//.test(toPosix(file)),
  );
  for (const file of platformFiles) {
    const text = await readFile(file, "utf8");
    if (
      /from\s+["'][^"']*modules\//.test(text) ||
      /from\s+["']\.\.\/.*modules\//.test(text)
    ) {
      failures.push(`${relative(root, file)} imports domain module code`);
    }
  }
  const moduleFiles = sourceFiles.filter((file) =>
    toPosix(file).includes("/modules/"),
  );
  for (const file of moduleFiles) {
    const text = await readFile(file, "utf8");
    if (
      /@senticor\/provider-|@senticor\/app-store-postgres|from\s+["']pg["']/.test(
        text,
      )
    ) {
      failures.push(
        `${relative(root, file)} imports provider or infrastructure implementation`,
      );
    }
    if (
      /createLocalAuthentication|module-local-authentication|passwordHash|sessionSecret/.test(
        text,
      )
    ) {
      failures.push(
        `${relative(root, file)} appears to reimplement a platform capability`,
      );
    }
  }
  return failures;
}

export async function validateCapabilityCatalog(root: string) {
  const failures: string[] = [];
  const catalog = await readJson(
    join(root, "platform/capabilities.json"),
  ).catch((error) => {
    failures.push(`cannot read platform/capabilities.json: ${error.message}`);
    return undefined;
  });
  if (!catalog) {
    return failures;
  }
  if (catalog.schemaVersion !== "1.0.0") {
    failures.push("platform/capabilities.json schemaVersion must be 1.0.0");
  }
  const ids = new Set<string>();
  for (const capability of catalog.capabilities ?? []) {
    if (ids.has(capability.id)) {
      failures.push(`duplicate capability id ${capability.id}`);
    }
    ids.add(capability.id);
    if (!(await exists(join(root, capability.documentation)))) {
      failures.push(`capability ${capability.id} documentation missing`);
    }
    if (!capability.publicPackage || !capability.contractTests?.length) {
      failures.push(
        `capability ${capability.id} missing package or contract tests`,
      );
    }
  }
  return failures;
}

export async function validateSourceRegistry(root: string) {
  const failures: string[] = [];
  const registry = await readStructuredFile<SourceRegistry>(
    join(root, "sources/registry.yaml"),
  ).catch((error) => {
    failures.push(`cannot read sources/registry.yaml: ${error.message}`);
    return undefined;
  });
  if (!registry) {
    return failures;
  }
  if (registry.schemaVersion !== "1.0.0") {
    failures.push("sources/registry.yaml schemaVersion must be 1.0.0");
  }
  const ids = new Set<string>();
  for (const source of registry.sources ?? []) {
    if (ids.has(source.id)) {
      failures.push(`duplicate source id ${source.id}`);
    }
    ids.add(source.id);
    if (!source.origins?.every((origin) => origin.startsWith("https://"))) {
      failures.push(`source ${source.id} must use https origins`);
    }
    if (!source.methods?.includes("GET")) {
      failures.push(`source ${source.id} must permit GET`);
    }
  }
  const lock = await readJson(join(root, "sources/source-lock.json")).catch(
    (error) => {
      failures.push(`cannot read sources/source-lock.json: ${error.message}`);
      return undefined;
    },
  );
  if (lock && !Array.isArray(lock.sources)) {
    failures.push("sources/source-lock.json sources must be an array");
  }
  return failures;
}

export async function appNew(
  root: string,
  { specPath, dryRun = false }: { specPath: string; dryRun?: boolean },
) {
  const spec = await readStructuredFile<AppSpec>(join(root, specPath));
  const failures = validateAppSpecShape(spec);
  if (failures.length > 0) {
    return { status: "failed", spec, generated: [], preserved: [], failures };
  }
  const destination = join(root, spec.module.destination);
  // TRAVERSAL-SCHUTZ: das Modul muss STRIKT im modules-Baum liegen. Die Spec-Pruefung vergleicht nur das
  // PRAEFIX ("modules/") und laesst sich mit ".." aushebeln — erst das Aufloesen der Grenze erzwingt, was
  // das Praefix meinte. Nachgewiesene Ausbrueche, die das Praefix passieren:
  //   "modules/../../ausserhalb" -> /ausserhalb        (ausserhalb des Repos)
  //   "modules/.."               -> /repo              (Repo-Wurzel: ueberschrieb die echte AGENTS.md)
  //   "modules/../modules-evil"  -> /repo/modules-evil (im Repo, aber ausserhalb des modules-Baums →
  //                                                     faellt aus den modules-Ownership-Regeln heraus)
  assertInsideBoundary(join(root, "modules"), destination);
  // JEDER Schreibpfad von app:new läuft durch diese zwei Wrapper — sie erzwingen die Modul-Grenze
  // (siehe assertInsideBoundary). Damit ist „app:new scaffoldt ausschliesslich das Modul" eine
  // durchgesetzte Invariante statt einer Konvention, auf die man sich verlässt.
  const writeInModule = async (
    target: string,
    content: string,
  ): Promise<void> => {
    assertInsideBoundary(destination, target);
    await writeFileAtomic(target, content);
  };
  const writeInModuleIfMissing = async (
    target: string,
    content: string,
    preservedPaths: string[],
    relativePath: string,
  ): Promise<void> => {
    assertInsideBoundary(destination, target);
    await writeIfMissing(target, content, preservedPaths, relativePath);
  };
  const contract = deriveModuleContract(spec);
  const migrationFile = `0001_create_${tableName(spec.module.id)}_cases.sql`;
  const storyFile = `${pascalCase(spec.module.id)}Screens.stories.tsx`;
  const hasAuditRoute = spec.routes.some((route) => route.surface === "audit");
  const generated = [
    `${spec.module.destination}/AGENTS.md`,
    `${spec.module.destination}/module.contract.yaml`,
    `${spec.module.destination}/domain.module.yaml`,
    `${spec.module.destination}/compliance/profile.example.json`,
    ...(hasAuditRoute
      ? [`${spec.module.destination}/contracts/audit-workspace.screen.yaml`]
      : []),
    `${spec.module.destination}/contracts/citizen-intake.screen.yaml`,
    `${spec.module.destination}/contracts/caseworker-workspace.screen.yaml`,
    `${spec.module.destination}/events/events.yaml`,
    `${spec.module.destination}/forms/intake.form.schema.json`,
    `${spec.module.destination}/i18n/de.json`,
    `${spec.module.destination}/migrations/database/${migrationFile}`,
    `${spec.module.destination}/permissions/permissions.yaml`,
    `${spec.module.destination}/tests/${spec.module.id}.test.ts`,
    `${spec.module.destination}/ui/${storyFile}`,
    `${spec.module.destination}/ui/screens.tsx`,
  ];
  const preserved: string[] = [];
  if (!dryRun) {
    await mkdir(dirname(destination), { recursive: true });
    if (!(await exists(destination))) {
      await createDomainModuleSkeleton(destination);
    } else {
      preserved.push(spec.module.destination);
    }
    await writeInModule(
      join(destination, "AGENTS.md"),
      moduleAgentsContent(spec),
    );
    await writeInModule(
      join(destination, "module.contract.yaml"),
      stableStringify(contract),
    );
    const domainPath = join(destination, "domain.module.yaml");
    const existingDomain = await readOptional(domainPath);
    if (!existingDomain || existingDomain.includes("replace-with-domain-id")) {
      await writeInModule(domainPath, domainModuleYaml(spec));
    } else {
      preserved.push(`${spec.module.destination}/domain.module.yaml`);
    }
    await writeInModuleIfMissing(
      join(destination, "contracts", "citizen-intake.screen.yaml"),
      screenContractYaml(spec, "citizen"),
      preserved,
      `${spec.module.destination}/contracts/citizen-intake.screen.yaml`,
    );
    await writeInModuleIfMissing(
      join(destination, "contracts", "caseworker-workspace.screen.yaml"),
      screenContractYaml(spec, "caseworker"),
      preserved,
      `${spec.module.destination}/contracts/caseworker-workspace.screen.yaml`,
    );
    if (hasAuditRoute) {
      await writeInModuleIfMissing(
        join(destination, "contracts", "audit-workspace.screen.yaml"),
        screenContractYaml(spec, "audit"),
        preserved,
        `${spec.module.destination}/contracts/audit-workspace.screen.yaml`,
      );
    }
    await writeInModuleIfMissing(
      join(destination, "events", "events.yaml"),
      eventsYaml(spec),
      preserved,
      `${spec.module.destination}/events/events.yaml`,
    );
    await writeInModuleIfMissing(
      join(destination, "forms", "intake.form.schema.json"),
      intakeFormSchema(spec),
      preserved,
      `${spec.module.destination}/forms/intake.form.schema.json`,
    );
    await writeInModuleIfMissing(
      join(destination, "i18n", "de.json"),
      i18nJson(spec),
      preserved,
      `${spec.module.destination}/i18n/de.json`,
    );
    await writeInModuleIfMissing(
      join(destination, "migrations", "database", migrationFile),
      migrationSql(spec),
      preserved,
      `${spec.module.destination}/migrations/database/${migrationFile}`,
    );
    await writeInModuleIfMissing(
      join(destination, "permissions", "permissions.yaml"),
      permissionsYaml(spec),
      preserved,
      `${spec.module.destination}/permissions/permissions.yaml`,
    );
    await writeInModuleIfMissing(
      join(destination, "tests", `${spec.module.id}.test.ts`),
      moduleTestTs(spec),
      preserved,
      `${spec.module.destination}/tests/${spec.module.id}.test.ts`,
    );
    await writeInModuleIfMissing(
      join(destination, "ui", storyFile),
      screensStoryTsx(spec),
      preserved,
      `${spec.module.destination}/ui/${storyFile}`,
    );
    await writeInModuleIfMissing(
      join(destination, "ui", "screens.tsx"),
      screensTsx(spec),
      preserved,
      `${spec.module.destination}/ui/screens.tsx`,
    );
    await writeInModuleIfMissing(
      join(destination, "compliance", "profile.example.json"),
      complianceProfileJson(spec),
      preserved,
      `${spec.module.destination}/compliance/profile.example.json`,
    );
  }
  return {
    status: "ok",
    spec,
    generated: generated.sort(),
    preserved: preserved.sort(),
    failures,
  };
}

export async function verifyAgentRun(
  root: string,
  { taskPath, reportPath }: { taskPath: string; reportPath?: string },
) {
  const context = await buildAgentContext(root, { taskPath, paths: [] });
  const spec = await readStructuredFile<AppSpec>(join(root, taskPath));
  const taskHash = await fileSha256(join(root, taskPath));
  const runId = taskHash.slice(0, 16);
  const resolvedReportPath = reportPath
    ? resolve(root, reportPath)
    : join(root, ".agent", "runs", runId, "report.json");
  const existingReport = reportPath
    ? await readJson(resolvedReportPath)
    : undefined;
  const report = stableClone({
    schemaVersion: "1.0.0",
    runId,
    task: taskPath,
    taskHash,
    selectedInstructionHashes: context.selectedContext
      .filter(hasSha256)
      .map((item) => ({ path: item.path, sha256: item.sha256 }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    filesChanged: await moduleFileEntries(root, spec),
    plannedCommands: buildNextCommands(spec, taskPath),
    commandsExecuted: [],
    acceptanceCriteria: spec.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      tests: criterion.tests,
      text: criterion.text,
    })),
    externalSources: await externalSourceEvidence(
      root,
      context.selectedSources,
    ),
    architecturePolicyFindings: [],
    humanApprovals: [],
    deviations: [],
    residualRisks: [],
  });
  const validatedReport = existingReport ?? report;
  const failures = await validateAgentRunReport(root, spec, validatedReport, {
    taskPath,
    taskHash,
  });
  await mkdir(dirname(resolvedReportPath), { recursive: true });
  if (!existingReport) {
    await writeFileAtomic(resolvedReportPath, stableStringify(report));
  }
  return {
    reportPath: relative(root, resolvedReportPath),
    report: validatedReport,
    failures,
  };
}

export async function fetchGovernedSource(
  root: string,
  { sourceId, url }: { sourceId: string; url?: string },
) {
  const registry = await readStructuredFile<SourceRegistry>(
    join(root, "sources/registry.yaml"),
  );
  const source = registry.sources.find((entry) => entry.id === sourceId);
  if (!source) {
    throw new Error(`unknown source ${sourceId}`);
  }
  const targetUrl = new URL(url ?? source.defaultUrl ?? source.origins[0]);
  if (!source.origins.includes(targetUrl.origin)) {
    throw new Error(
      `source ${sourceId} does not allow origin ${targetUrl.origin}`,
    );
  }
  if (!source.paths.some((path) => targetUrl.pathname.startsWith(path))) {
    throw new Error(
      `source ${sourceId} does not allow path ${targetUrl.pathname}`,
    );
  }
  const response = await fetch(targetUrl, { redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    const redirectUrl = location ? new URL(location, targetUrl) : undefined;
    if (
      source.redirectPolicy !== "same-origin" ||
      !redirectUrl ||
      redirectUrl.origin !== targetUrl.origin
    ) {
      throw new Error(`source ${sourceId} rejected redirect to ${location}`);
    }
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!source.expectedContentTypes.some((type) => contentType.includes(type))) {
    throw new Error(
      `source ${sourceId} returned unexpected content type ${contentType}`,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `source ${sourceId} returned unsuccessful status ${response.status}`,
    );
  }
  const body = await response.text();
  const directory = join(root, ".agent", "sources", sourceId);
  await mkdir(directory, { recursive: true });
  await writeFileAtomic(join(directory, "content.html"), body);
  await writeFileAtomic(
    join(directory, "provenance.json"),
    stableStringify({
      sourceId,
      url: targetUrl.toString(),
      status: response.status,
      contentType,
      sha256: sha256(body),
    }),
  );
  return {
    sourceId,
    path: relative(root, join(directory, "content.html")),
    sha256: sha256(body),
  };
}

async function moduleFileEntries(root: string, spec: AppSpec) {
  const directory = join(root, spec.module.destination);
  const files = await collectFiles(directory, [
    ".json",
    ".sql",
    ".ts",
    ".tsx",
    ".yaml",
  ]);
  const entries = await Promise.all(
    files.map(async (file) => ({
      path: relative(root, file),
      sha256: await fileSha256(file),
    })),
  );
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

async function externalSourceEvidence(root: string, sourceIds: string[]) {
  const entries = [];
  for (const sourceId of sourceIds) {
    const provenancePath = join(
      root,
      ".agent",
      "sources",
      sourceId,
      "provenance.json",
    );
    const provenance = await readJson(provenancePath).catch(() => undefined);
    entries.push({
      sourceId,
      provenancePath: relative(root, provenancePath),
      status:
        provenance && typeof provenance === "object"
          ? (provenance as Record<string, unknown>).status
          : undefined,
      sha256:
        provenance && typeof provenance === "object"
          ? (provenance as Record<string, unknown>).sha256
          : undefined,
    });
  }
  return entries;
}

export async function validateAgentRunReport(
  root: string,
  spec: AppSpec,
  report: Record<string, unknown>,
  expected?: { taskPath: string; taskHash: string },
) {
  const failures: string[] = [];
  if (report.schemaVersion !== "1.0.0") {
    failures.push("report schemaVersion must be 1.0.0");
  }
  if (!report.runId) {
    failures.push("report missing runId");
  }
  if (expected) {
    if (report.task !== expected.taskPath) {
      failures.push("report task does not match current task");
    }
    if (report.taskHash !== expected.taskHash) {
      failures.push("report taskHash does not match current task");
    }
  }
  const filesChanged = Array.isArray(report.filesChanged)
    ? report.filesChanged
    : [];
  if (filesChanged.length === 0) {
    failures.push("report filesChanged must not be empty");
  }
  for (const entry of filesChanged) {
    const path = reportPathEntry(entry);
    if (!path) {
      failures.push("report filesChanged entry missing path");
      continue;
    }
    if (!(await exists(join(root, path)))) {
      failures.push(`report references missing file ${path}`);
    }
  }
  if (
    !Array.isArray(report.commandsExecuted) ||
    report.commandsExecuted.length === 0
  ) {
    failures.push("report commandsExecuted must not be empty");
  }
  const acceptanceCriteria = Array.isArray(report.acceptanceCriteria)
    ? report.acceptanceCriteria
    : [];
  const acceptedIds = new Set(
    acceptanceCriteria
      .map((entry) =>
        typeof entry === "object" && entry
          ? String((entry as Record<string, unknown>).id ?? "")
          : "",
      )
      .filter(Boolean),
  );
  for (const criterion of spec.acceptanceCriteria) {
    if (!acceptedIds.has(criterion.id)) {
      failures.push(`report missing acceptance criterion ${criterion.id}`);
    }
  }
  for (const sourceId of spec.permittedExternalSources) {
    const provenancePath = join(
      root,
      ".agent",
      "sources",
      sourceId,
      "provenance.json",
    );
    if (!(await exists(provenancePath))) {
      failures.push(`missing governed source provenance for ${sourceId}`);
      continue;
    }
    const provenance = await readJson(provenancePath).catch(() => undefined);
    if (!provenance || typeof provenance !== "object") {
      failures.push(`invalid governed source provenance for ${sourceId}`);
      continue;
    }
    const status = (provenance as Record<string, unknown>).status;
    if (typeof status !== "number" || status < 200 || status >= 300) {
      failures.push(
        `governed source ${sourceId} returned unsuccessful status ${String(status)}`,
      );
    }
    const digest = (provenance as Record<string, unknown>).sha256;
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) {
      failures.push(`governed source ${sourceId} missing valid sha256 digest`);
    }
  }
  return failures.sort();
}

function reportPathEntry(entry: unknown) {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry && typeof entry === "object") {
    const path = (entry as Record<string, unknown>).path;
    return typeof path === "string" ? path : undefined;
  }
  return undefined;
}

export function deriveModuleContract(spec: AppSpec): ModuleContract {
  return stableClone({
    schemaVersion: "1.0.0",
    moduleId: spec.module.id,
    lifecycle: spec.module.lifecycle,
    owner: spec.module.owner,
    riskClass: spec.module.riskClass,
    publicExports: ["domain.module.yaml", "contracts/*.screen.yaml"],
    permittedDependencies: [
      "@senticor/fachverfahren-kit",
      "@senticor/platform-contracts",
      "@senticor/public-sector-sdk",
      "@senticor/public-sector-ui",
    ],
    consumedCapabilities: spec.requiredCapabilities,
    platformPorts: spec.requiredCapabilities.map(capabilityPortName).sort(),
    routes: spec.routes,
    roles: spec.roles,
    permissions: spec.roles.map((role) => `${spec.module.id}.${role}`),
    dataClassifications: spec.dataClassifications,
    retention: [`${spec.module.id}-case-records`],
    events: {
      produces: spec.workflows.map(
        (workflow) => `${spec.module.id}.${workflow}`,
      ),
      consumes: [],
    },
    audit: spec.requiredCapabilities.includes("audit")
      ? {
          port: "AuditPort",
          appendOnlyEvents: spec.workflows.map(
            (workflow) => `${spec.module.id}.${workflow}`,
          ),
        }
      : undefined,
    fimReferences: spec.fim
      ? {
          rootId: spec.fim.rootId,
          services: fimServices(spec),
        }
      : undefined,
    humanApproval: humanApprovals(spec),
    storage: {
      migrations: [`${spec.module.destination}/migrations/database/`],
      ownsTables: [`${tableName(spec.module.id)}_cases`],
    },
    externalSources: spec.permittedExternalSources,
    requiredTests: spec.acceptanceCriteria.flatMap(
      (criterion) => criterion.tests,
    ),
    vocabulary: spec.domainVocabulary,
    allowedDomainPaths: [
      spec.module.destination,
      `docs/examples/${spec.id.replace(/^example:/, "")}/`,
    ],
  });
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(stableClone(value), null, 2)}\n`;
}

export function stableClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(stableClone) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stableClone(nested)]),
    ) as T;
  }
  return value;
}

export async function readStructuredFile<T>(path: string): Promise<T> {
  const text = await readFile(path, "utf8");
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return parseYaml(trimmed) as T;
    }
  }
  return parseYaml(trimmed) as T;
}

function scriptsForDiscovery(
  discovery: AgentDiscoveryManifest,
  packageJson: PackageJson,
) {
  const scripts = packageJson.scripts ?? {};
  const commandScripts = (discovery.commands ?? []).map(
    (command) => command.script,
  );
  const profileScripts = (discovery.validationProfiles ?? []).map(
    (profile) => profile.script,
  );
  return Object.fromEntries(
    [...commandScripts, ...profileScripts]
      .map((script) => [script, scripts[script]])
      .filter(([, value]) => Boolean(value))
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}

function buildValidationProfiles() {
  return [
    {
      id: "agent-smoke",
      script: "check:agent-smoke",
      purpose: "Fast agent contract and scaffold metadata check.",
      checks: ["agent:preflight", "check:agent-discovery", "check:scaffold"],
    },
    {
      id: "agent-domain",
      script: "check:agent-domain",
      purpose: "Domain module contract, boundary and source validation.",
      checks: [
        "check:domain-contracts",
        "check:module-contracts",
        "check:module-boundaries",
        "check:capability-catalog",
        "check:source-registry",
        "test",
      ],
    },
    {
      id: "agent-ui",
      script: "check:agent-ui",
      purpose: "Screen contract, Storybook and TypeScript UI validation.",
      checks: ["check:storybook", "typecheck:storybook", "check:css-tokens"],
    },
    {
      id: "agent-release",
      script: "check:agent-release",
      purpose: "Release-grade template, type, test and build validation.",
      checks: [
        "format:check",
        "lint",
        "typecheck",
        "test",
        "test:template",
        "check:template-invariants",
        "check:scaffold-reproducible",
        "build:packages",
        "build:app",
        "build:server",
        "check:web-delivery",
        "check:k8s-delivery",
      ],
    },
  ];
}

function buildNextCommands(
  spec: AppSpec,
  taskPath: string,
): AgentCommandPlan[] {
  const auditArtifacts = spec.routes.some((route) => route.surface === "audit")
    ? [`${spec.module.destination}/contracts/audit-workspace.screen.yaml`]
    : [];
  return [
    {
      id: "install-template-dependencies",
      command: "pnpm install --frozen-lockfile",
      cwd: ".",
      writes: true,
      expectedArtifacts: ["node_modules/"],
      followUpChecks: ["agent:bootstrap"],
    },
    {
      id: "scaffold-full-repository",
      command: `pnpm run scaffold:domain-app -- --domain <domain> --display-name <display-name> --target <target-dir> --allow-existing-empty`,
      cwd: ".",
      writes: true,
      expectedArtifacts: [
        "<target-dir>/.template/lock.json",
        "<target-dir>/agent.discovery.json",
      ],
      followUpChecks: ["template:status"],
      followUpCwd: "<target-dir>",
    },
    {
      id: "install-generated-repository",
      command: "pnpm install --frozen-lockfile",
      cwd: "<target-dir>",
      writes: true,
      expectedArtifacts: ["node_modules/"],
      followUpChecks: ["agent:bootstrap"],
    },
    {
      id: "generate-domain-module",
      command: `pnpm run app:new -- --spec ${taskPath}`,
      cwd: "<target-dir>",
      writes: true,
      expectedArtifacts: [
        `${spec.module.destination}/domain.module.yaml`,
        `${spec.module.destination}/module.contract.yaml`,
        `${spec.module.destination}/contracts/citizen-intake.screen.yaml`,
        `${spec.module.destination}/contracts/caseworker-workspace.screen.yaml`,
        ...auditArtifacts,
        `${spec.module.destination}/ui/${pascalCase(spec.module.id)}Screens.stories.tsx`,
      ],
      followUpChecks: ["check:agent-domain", "check:agent-ui"],
    },
    ...spec.permittedExternalSources.map((sourceId) => ({
      id: `fetch-governed-source:${sourceId}`,
      command: `pnpm run source:fetch -- --source ${sourceId}`,
      cwd: "<target-dir>",
      writes: true,
      expectedArtifacts: [`.agent/sources/${sourceId}/provenance.json`],
      followUpChecks: ["source:verify"],
    })),
    {
      id: "verify-agent-run",
      command: `pnpm run agent:verify -- --task ${taskPath}`,
      cwd: "<target-dir>",
      writes: true,
      expectedArtifacts: [".agent/runs/<run-id>/report.json"],
      followUpChecks: ["check:agent-release"],
    },
  ];
}

async function commandVersion(command: string, args: string[]) {
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024,
    });
    return { ok: true, value: result.stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      value: error instanceof Error ? error.message : String(error),
    };
  }
}

async function selectContextItem(root: string, path: string, reason: string) {
  const absolute = join(root, path);
  const fileStat = await stat(absolute);
  return {
    path,
    reason,
    sha256: await fileSha256(absolute),
    sizeBytes: fileStat.size,
  };
}

async function selectedSourceEntries(root: string, spec: AppSpec) {
  const registry = await readStructuredFile<SourceRegistry>(
    join(root, "sources/registry.yaml"),
  );
  return registry.sources.filter((source) =>
    spec.permittedExternalSources.includes(source.id),
  );
}

async function hashFiles(root: string, paths: string[]) {
  const entries = [];
  for (const path of paths.sort()) {
    if (await exists(join(root, path))) {
      entries.push({ path, sha256: await fileSha256(join(root, path)) });
    }
  }
  return entries;
}

async function validateSkillShims(root: string) {
  const failures: string[] = [];
  const canonicalSkills = await listSkillNames(join(root, ".agents/skills"));
  if (!(await exists(join(root, ".claude/skills")))) {
    return failures;
  }
  const shimSkills = await listSkillNames(join(root, ".claude/skills"));
  for (const skill of canonicalSkills) {
    if (!shimSkills.includes(skill)) {
      failures.push(`missing .claude shim for skill ${skill}`);
      continue;
    }
    const shimPath = join(root, ".claude/skills", skill, "SKILL.md");
    const text = await readFile(shimPath, "utf8");
    if (!text.includes(`.agents/skills/${skill}/SKILL.md`)) {
      failures.push(
        `${relative(root, shimPath)} does not point to canonical skill`,
      );
    }
  }
  return failures;
}

async function validateDomainLeakage(root: string) {
  const failures: string[] = [];
  // Die eigene Identität der generierten App (aus .template/answers.json) ist KEIN geleaktes
  // Domänen-Vokabular: heißt die App selbst „Hundesteuer", trägt ihre Shell (Paketname, Chart, …)
  // legitim „Hundesteuer". NUR das GANZE Identitäts-Token (Domain/Display) ausnehmen — NICHT als
  // Teilstring, sonst fiele mit „hundesteuer" auch der eigenständige Begriff „Hund" global weg und
  // dog-spezifischer Code in SHARED packages käme durch. So bleibt „Hundesteuer" erlaubt, während
  // „Hund"/„Befreiung"/… weiter (wortgenau) erzwungen werden. Pristine Vorlage: kein answers.json
  // -> keine Ausnahme, Verhalten unverändert.
  const identity = await readJson<{ domain?: string; displayName?: string }>(
    join(root, ".template", "answers.json"),
  ).catch(() => null);
  const identityTokens = [identity?.domain, identity?.displayName]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    )
    .map((value) => value.toLowerCase());
  const specFiles = await collectFiles(join(root, "docs/examples"), [".yaml"]);
  const specs = [];
  for (const file of specFiles.filter((path) =>
    path.endsWith("app.spec.yaml"),
  )) {
    specs.push({
      path: relative(root, file),
      spec: await readStructuredFile<AppSpec>(file),
    });
  }
  const forbiddenRoots = ["apps", "packages", "jurisdictions"];
  const files = (
    await Promise.all(
      forbiddenRoots.map((entry) =>
        collectFiles(join(root, entry), [
          ".ts",
          ".tsx",
          ".md",
          ".json",
          ".yaml",
        ]),
      ),
    )
  ).flat();
  for (const { spec } of specs) {
    const terms = spec.domainVocabulary.filter(
      (term) =>
        term.length >= 4 && !identityTokens.includes(term.toLowerCase()),
    );
    for (const file of files) {
      const rel = relative(root, file);
      if (rel.startsWith(spec.module.destination)) {
        continue;
      }
      // Das generierte Doc-Wiki-Manifest aggregiert Repo-Doku (inkl. Skills, die Beispiel-Verfahren wie
      // Hundesteuer NENNEN) — Dokumentation, kein Runtime-Domaenencode. Der Leckage-Gate schuetzt AUTHORED
      // Code vor hart kodiertem Domaenen-Vokabular; ein generiertes Doku-Aggregat ist bewusst ausgenommen.
      if (rel.endsWith("docs-manifest.generated.ts")) {
        continue;
      }
      const text = await readFile(file, "utf8").catch(() => "");
      for (const term of terms) {
        // Wortgenau (\b…\b): sonst matcht „Hund" innerhalb von „Hundesteuer" und meldet die App-
        // Identität fälschlich als Leckage.
        if (new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(text)) {
          failures.push(
            `${rel} contains domain term ${term} outside ${spec.module.destination}`,
          );
        }
      }
    }
  }
  return failures;
}

async function listModuleDirectories(root: string) {
  const modulesRoot = join(root, "modules");
  const entries = await readdir(modulesRoot, { withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(modulesRoot, entry.name))
    .sort();
}

async function listSkillNames(root: string) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Strukturprüfung des OPTIONALEN Dossier-Blocks — dieselben Invarianten wie das Datei-Gate
 *  scripts/check-procedure-contract.mts, aber lokal (Tooling darf nicht aus packages/ importieren). Prüft nur,
 *  WENN ein Block da ist: mind. 1 Rechtsgrundlage; Übergänge referenzieren deklarierte Zustände; eindeutige
 *  (from,action); mind. 1 schließender Übergang (closesCase); keine Sackgasse; kein verwaister Zustand. */
function validateProcedureBlock(procedure: SpecProcedure): string[] {
  const failures: string[] = [];
  const fail = (m: string) => failures.push(`app spec procedure: ${m}`);

  if (!procedure.procedureId) fail("procedureId fehlt/leer.");
  if (!procedure.version) fail("version fehlt/leer.");
  if (
    procedure.effectiveFrom !== undefined &&
    Number.isNaN(Date.parse(procedure.effectiveFrom))
  )
    fail(
      `effectiveFrom ("${procedure.effectiveFrom}") ist kein gültiges ISO-Datum.`,
    );

  const legal = procedure.legalBasisIds;
  if (!Array.isArray(legal) || legal.length < 1)
    fail(
      "legalBasisIds muss mind. 1 Rechtsgrundlage enthalten (nie erfunden).",
    );
  else if (legal.some((id) => !id || id.trim() === ""))
    fail("legalBasisIds enthält einen leeren Eintrag.");

  const states = procedure.allowedStates;
  if (!Array.isArray(states) || states.length < 1) {
    fail("allowedStates muss mind. 1 Zustand enthalten.");
    return failures;
  }
  if (states.some((s) => !s || s.trim() === ""))
    fail("allowedStates enthält einen leeren Zustand.");
  if (new Set(states).size !== states.length)
    fail("allowedStates enthält Duplikate.");

  const transitions = procedure.allowedTransitions;
  if (!Array.isArray(transitions) || transitions.length < 1) {
    fail("allowedTransitions muss mind. 1 Übergang enthalten.");
    return failures;
  }

  const known = new Set(states);
  const pairs = new Set<string>();
  for (const t of transitions) {
    if (!known.has(t.from))
      fail(`Übergang referenziert unbekannten from-Zustand "${t.from}".`);
    if (!known.has(t.to))
      fail(`Übergang referenziert unbekannten to-Zustand "${t.to}".`);
    if (!t.action || t.action.trim() === "")
      fail(`Übergang ${t.from}→${t.to} hat keine action.`);
    const key = `${t.from} ${t.action}`;
    if (pairs.has(key))
      fail(
        `Mehrdeutiger Übergang: (from "${t.from}", action "${t.action}") mehrfach definiert.`,
      );
    pairs.add(key);
  }

  const schliessende = transitions.filter((t) => t.closesCase === true);
  if (schliessende.length < 1)
    fail(
      "kein schließender Übergang (closesCase: true) — der Fall kann nicht abgeschlossen werden.",
    );

  const hatAusgang = new Set(transitions.map((t) => t.from));
  const geschlosseneZiele = new Set(schliessende.map((t) => t.to));
  for (const s of states)
    if (!hatAusgang.has(s) && !geschlosseneZiele.has(s))
      fail(
        `Zustand "${s}" hat keinen ausgehenden Übergang und ist kein geschlossener Zustand (Sackgasse).`,
      );

  const beruehrt = new Set<string>();
  for (const t of transitions) {
    beruehrt.add(t.from);
    beruehrt.add(t.to);
  }
  for (const s of states)
    if (!beruehrt.has(s))
      fail(`Zustand "${s}" wird von keinem Übergang referenziert (verwaist).`);

  return failures;
}

function validateAppSpecShape(spec: AppSpec) {
  const failures: string[] = [];
  if (spec.schemaVersion !== "1.0.0") {
    failures.push("app spec schemaVersion must be 1.0.0");
  }
  if (!spec.module?.id || !spec.module?.destination) {
    failures.push("app spec missing module id or destination");
  }
  // `..`-Segmente hebeln die Praefix-Pruefung aus: "modules/.." und "modules/../apps" beginnen mit
  // "modules/", zeigen nach dem Aufloesen aber auf die Repo-Wurzel bzw. aus dem modules-Baum heraus.
  // Der Spec faellt deshalb SAUBER durch die Validierung (status "failed" mit Meldung) — der
  // Write-Boundary-Guard bleibt die letzte Verteidigungslinie fuer fehlgeleitete Schreibpfade.
  if (spec.module?.destination?.split("/").includes("..")) {
    failures.push("module destination must not contain .. segments");
  } else if (!spec.module?.destination?.startsWith("modules/")) {
    failures.push("module destination must be under modules/");
  }
  if (!spec.acceptanceCriteria?.length) {
    failures.push("app spec must define acceptance criteria");
  }
  if (!spec.requiredCapabilities?.length) {
    failures.push("app spec must consume platform capabilities");
  }
  if (spec.fim && (!spec.fim.sourceId || !spec.fim.rootId)) {
    failures.push("app spec fim references require sourceId and rootId");
  }
  if (
    spec.fim?.services &&
    (typeof spec.fim.services !== "object" || Array.isArray(spec.fim.services))
  ) {
    failures.push("app spec fim services must be an object when provided");
  }
  // OPTIONALER Dossier-Block — nur prüfen, wenn er da ist (Antrag-nur-Apps bleiben valide).
  if (spec.procedure) {
    failures.push(...validateProcedureBlock(spec.procedure));
  }
  return failures;
}

function moduleAgentsContent(spec: AppSpec) {
  return [
    `# ${spec.displayName} Modul`,
    "",
    "Dieses Modul unterliegt zusätzlich zu den Root-Regeln diesem Vertrag:",
    "",
    "- Fachlogik bleibt in diesem Modul.",
    "- Plattformfähigkeiten werden über deklarierte Capabilities genutzt.",
    "- Regeln dürfen Root-Policy nur verschärfen, nie lockern.",
    "- `module.contract.yaml` ist die maschinenlesbare Grenze für Agenten.",
    "",
  ].join("\n");
}

function domainModuleYaml(spec: AppSpec) {
  return [
    `id: ${spec.module.id}`,
    "version: 0.1.0",
    `displayName: ${spec.displayName}`,
    "",
    "routes:",
    ...spec.routes.map(
      (route) => `  - path: ${route.path}\n    surface: ${route.surface}`,
    ),
    "",
    "requiredCapabilities:",
    ...spec.requiredCapabilities.map((capability) => `  - ${capability}`),
    "",
    "platformPorts:",
    ...spec.requiredCapabilities
      .map(capabilityPortName)
      .sort()
      .map((port) => `  - ${port}`),
    "",
    "permissions:",
    ...spec.roles.map(
      (role) =>
        `  - permission: ${spec.module.id}.${role}\n    description: ${role} Rechte`,
    ),
    "",
    "events:",
    "  publishes:",
    ...spec.workflows.map(
      (workflow) =>
        `    - eventType: ${spec.module.id}.${workflow}\n      version: v1`,
    ),
    "  consumes: []",
    "",
    "dataCategories:",
    ...spec.dataClassifications.map(
      (classification) => `  - ${classification}`,
    ),
    "",
    "retentionPolicies:",
    `  - ${spec.module.id}-case-records`,
    "",
    "migrations:",
    "  database: migrations/database/",
    "  documents: migrations/documents/",
    "  externalSystems: []",
    "",
    ...(spec.fim
      ? [
          "fimReferences:",
          `  sourceId: ${spec.fim.sourceId}`,
          `  rootId: "${spec.fim.rootId}"`,
          ...fimServiceYaml(spec),
          "",
        ]
      : []),
    "humanApproval:",
    ...(humanApprovals(spec).length
      ? humanApprovals(spec).map((approval) => `  - ${approval}`)
      : ["  - none"]),
    "",
    "screenContracts:",
    "  - contracts/citizen-intake.screen.yaml",
    "  - contracts/caseworker-workspace.screen.yaml",
    ...(spec.routes.some((route) => route.surface === "audit")
      ? ["  - contracts/audit-workspace.screen.yaml"]
      : []),
    "",
  ].join("\n");
}

async function createDomainModuleSkeleton(destination: string) {
  await Promise.all(
    [
      "contracts",
      "ui",
      "forms",
      "permissions",
      "events",
      "migrations/database",
      "migrations/documents",
      "i18n",
      "tests",
      "compliance",
    ].map((dir) => mkdir(join(destination, dir), { recursive: true })),
  );
  await writeFileAtomic(join(destination, "migrations/database/.gitkeep"), "");
  await writeFileAtomic(join(destination, "migrations/documents/.gitkeep"), "");
}

// Write-Boundary: wirft, wenn ein Schreibziel AUSSERHALB der erlaubten Grenze liegt.
//
// WARUM: `writeFileAtomic` legt jeden Pfad einfach an — es gibt sonst KEINE Durchsetzung. Die Regel
// „app:new scaffoldt ausschliesslich das Modul" galt bisher nur BY CONSTRUCTION (jeder Write ist
// `join(destination, …)`) und war durch keinen Guard und keinen Exklusivitäts-Test gedeckt: ein
// fehlgeleitetes Ziel (etwa in den Vorlagen-eigenen apps-server-Bäumen) schlüge STILL durch — grüne
// Tests, aber verletzter Governance-Scope, geclobberte Ownership und ein blinder agent:verify-Report.
// Lieber laut scheitern als still danebenschreiben.
// (Zeilen-Kommentar statt Block: Ownership-Globs enthalten die Zeichenfolge, die einen Block beendet.)
function assertInsideBoundary(boundary: string, target: string): void {
  const rel = relative(resolve(boundary), resolve(target));
  // `rel === ""` heisst: das Ziel IST die Grenze selbst — das ist KEIN „strikt darunter" und muss ebenso
  // scheitern. Ohne diesen Fall zeigte `module.destination: "modules/.."` auf das Repo-Wurzelverzeichnis
  // (relative(root, root) === "", also weder ".."-Praefix noch absolut) und app:new ueberschrieb dort die
  // echte AGENTS.md des Repos — nachgewiesen, nicht theoretisch.
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `app:new: Ziel ausserhalb der erlaubten Grenze — "${target}" liegt nicht strikt unter "${boundary}"`,
    );
  }
}

async function writeIfMissing(
  path: string,
  content: string,
  preserved: string[],
  relativePath: string,
) {
  if (await exists(path)) {
    preserved.push(relativePath);
    return;
  }
  await writeFileAtomic(path, content);
}

function screenContractYaml(
  spec: AppSpec,
  persona: "citizen" | "caseworker" | "audit",
) {
  const route =
    spec.routes.find((entry) => entry.surface === persona)?.path ??
    spec.routes[0]?.path ??
    `/${spec.module.id}`;
  const title =
    spec.journeys.find((journey) => journey.surface === persona)?.title ??
    spec.displayName;
  return [
    `id: ${spec.module.id}-${persona}`,
    `route: ${route}`,
    `owner: ${spec.module.owner}`,
    `persona: ${persona}`,
    "",
    "inputs:",
    "  - app-spec",
    "  - domain-contract",
    "",
    "outputs:",
    "  - screen",
    "  - validation-feedback",
    "",
    "states:",
    "  - loading",
    "  - empty",
    "  - error",
    "  - ready",
    "  - success",
    "",
    "ia:",
    `  pattern: ${persona === "citizen" ? "guided-flow" : persona === "audit" ? "audit-timeline" : "dense-list-detail"}`,
    "  navigation: persona-local",
    "  profile: public-sector",
    "  scroll: stable",
    "",
    "content:",
    "  language: de",
    "  architectureTerms: hidden-from-users",
    `  title: ${title}`,
    "",
    "hcai:",
    "  mode: human-in-control",
    "  controls:",
    "    - review",
    "    - correction",
    "",
    "a11y:",
    "  landmarks: required",
    "  keyboard: required",
    "  focusOrder: deterministic",
    "  zoom: 200-percent",
    "  statusSemantics: text-and-color",
    "",
    "tests:",
    "  unit: required",
    "  integration: required",
    "  storybook: required",
    "",
    "evidence:",
    "  - screen-contract",
    "  - storybook-state",
    ...(persona === "audit" ? ["  - audit-provenance"] : []),
    "",
  ].join("\n");
}

function eventsYaml(spec: AppSpec) {
  return [
    "publishes:",
    ...spec.workflows.map((workflow) => `  - ${spec.module.id}.${workflow}`),
    "consumes: []",
    "",
  ].join("\n");
}

function intakeFormSchema(spec: AppSpec) {
  return stableStringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    additionalProperties: true,
    properties: {
      reference: { minLength: 1, title: "Referenz", type: "string" },
    },
    required: ["reference"],
    title: `${spec.displayName} Intake`,
    type: "object",
  });
}

function i18nJson(spec: AppSpec) {
  return stableStringify({
    [`${spec.module.id}.empty`]: "Noch keine Vorgaenge vorhanden.",
    [`${spec.module.id}.title`]: spec.displayName,
  });
}

function permissionsYaml(spec: AppSpec) {
  return [
    "permissions:",
    ...spec.roles.map(
      (role) => `  - id: ${spec.module.id}.${role}\n    role: ${role}`,
    ),
    "",
  ].join("\n");
}

function migrationSql(spec: AppSpec) {
  const table = `${tableName(spec.module.id)}_cases`;
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    "  id text PRIMARY KEY,",
    "  tenant_id text NOT NULL,",
    "  authority_id text NOT NULL,",
    "  status text NOT NULL DEFAULT 'draft',",
    "  payload jsonb NOT NULL DEFAULT '{}'::jsonb,",
    "  created_at timestamptz NOT NULL DEFAULT now(),",
    "  updated_at timestamptz NOT NULL DEFAULT now()",
    ");",
    "",
    `CREATE INDEX IF NOT EXISTS ${table}_tenant_status_idx`,
    `  ON ${table} (tenant_id, status);`,
    "",
    `-- ${spec.displayName}: extend this migration with jurisdiction-approved fields before production use.`,
    "",
  ].join("\n");
}

function complianceProfileJson(spec: AppSpec) {
  return stableStringify({
    accessibility: {
      bitv: "planned",
      wcag: "2.2-AA",
      evidence: ["contracts/*.screen.yaml", "ui/*.stories.tsx"],
    },
    audit: {
      appendOnly: spec.requiredCapabilities.includes("audit"),
      events: spec.workflows.map((workflow) => `${spec.module.id}.${workflow}`),
    },
    dataProtection: {
      dataClassifications: spec.dataClassifications,
      dsfa: "planned",
      retention: [`${spec.module.id}-case-records`],
      vvt: "planned",
    },
    externalSources: spec.permittedExternalSources.map((sourceId) => ({
      sourceId,
      citationRequired: true,
    })),
    humanApproval: humanApprovals(spec),
    module: spec.module.id,
    status: "example-generated",
  });
}

function screensStoryTsx(spec: AppSpec) {
  const title = `${spec.displayName}/Screens`;
  return [
    'import type { Meta, StoryObj } from "@storybook/react";',
    'import { AuditScreen, CaseworkerScreen, CitizenScreen } from "./screens.js";',
    "",
    "const meta = {",
    `  title: ${JSON.stringify(title)},`,
    "  parameters: {",
    '    layout: "fullscreen",',
    "  },",
    "} satisfies Meta;",
    "",
    "export default meta;",
    "type Story = StoryObj;",
    "",
    "export const CitizenReady: Story = {",
    "  render: () => <CitizenScreen />,",
    "};",
    "",
    "export const CaseworkerReady: Story = {",
    "  render: () => <CaseworkerScreen />,",
    "};",
    "",
    "export const AuditReady: Story = {",
    "  render: () => <AuditScreen />,",
    "};",
    "",
  ].join("\n");
}

function moduleTestTs(spec: AppSpec) {
  return [
    'import { describe, expect, it } from "vitest";',
    "",
    `describe("${spec.module.id} module contract", () => {`,
    '  it("keeps generated module boundaries explicit", () => {',
    `    expect("${spec.module.destination}").toMatch(/^modules\\//);`,
    `    expect(${JSON.stringify(spec.requiredCapabilities)}.length).toBeGreaterThan(0);`,
    "  });",
    "});",
    "",
  ].join("\n");
}

function capabilityPortName(capability: string) {
  return `${pascalCase(capability)}Port`;
}

function humanApprovals(spec: AppSpec) {
  return spec.humanApproval ?? [];
}

function fimServices(spec: AppSpec): Record<string, string> {
  const services = spec.fim?.services;
  if (!services || typeof services !== "object" || Array.isArray(services)) {
    return {};
  }
  return services;
}

function fimServiceYaml(spec: AppSpec) {
  const services = Object.entries(fimServices(spec)).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (!services.length) {
    return ["  services: []"];
  }
  return [
    "  services:",
    ...services.map(
      ([id, label]) => `    - id: "${id}"\n      label: ${label}`,
    ),
  ];
}

function tableName(id: string) {
  const normalized = id
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = normalized || "module";
  return /^[a-z_]/.test(base) ? base : `m_${base}`;
}

function pascalCase(value: string) {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function screensTsx(spec: AppSpec) {
  const displayName = JSON.stringify(spec.displayName);
  const domain = JSON.stringify(spec.module.id);
  return [
    'import { Badge, EmptyState, PageHeader } from "@senticor/fachverfahren-kit";',
    "",
    "export const moduleMeta = {",
    `  domain: ${domain},`,
    `  label: ${displayName},`,
    "};",
    "",
    "export function CitizenScreen() {",
    "  return (",
    '    <main className="mx-auto max-w-5xl p-6">',
    `      <PageHeader title={${displayName}} description="Buergerleistung" />`,
    '      <EmptyState title="Noch kein Antrag" description="Der Antrag wird aus der Leistungskonfiguration aufgebaut." />',
    "    </main>",
    "  );",
    "}",
    "",
    "export function CaseworkerScreen() {",
    "  return (",
    '    <main className="mx-auto max-w-6xl p-6">',
    `      <PageHeader title={${displayName}} description="Sachbearbeitung" actions={<Badge tone="info">Bereit</Badge>} />`,
    '      <EmptyState title="Noch kein Vorgang" description="Vorgaenge erscheinen nach Eingang oder Migration." />',
    "    </main>",
    "  );",
    "}",
    "",
    "export function AuditScreen() {",
    "  return (",
    '    <main className="mx-auto max-w-6xl p-6">',
    `      <PageHeader title={${displayName}} description="Audit" />`,
    '      <EmptyState title="Noch kein Audit-Nachweis" description="Nachweise werden vom Build- und Laufprotokoll verknuepft." />',
    "    </main>",
    "  );",
    "}",
    "",
  ].join("\n");
}

async function collectFiles(root: string, extensions: string[]) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (
      [".git", "node_modules", "dist", "storybook-static", ".agent"].includes(
        entry.name,
      )
    ) {
      continue;
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, extensions)));
    } else if (
      extensions.length === 0 ||
      extensions.includes(extname(entry.name))
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

async function readOptional(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isAbsoluteOrEscaping(path: string) {
  return path.startsWith("/") || path.includes("..");
}

function hasSha256(item: {
  path: string;
  reason: string;
  sha256?: unknown;
}): item is { path: string; reason: string; sha256: string } {
  return typeof item.sha256 === "string";
}

function toPosix(path: string) {
  return path.replaceAll("\\", "/");
}

async function fileSha256(path: string) {
  return sha256(await readFile(path));
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
