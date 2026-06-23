import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { readJson, writeFileAtomic } from "./structured-edit.ts";
import type { PackageJson } from "./structured-edit.ts";

export const discoveryPath = "agent.discovery.json";
export const defaultTaskSpecPath =
  "docs/examples/veranstaltungsanzeige/app.spec.yaml";

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
  fim?: { sourceId: string; rootId: string; services: Record<string, string> };
  dataClassifications: string[];
  requiredCapabilities: string[];
  permittedExternalSources: string[];
  routes: { path: string; surface: string }[];
  workflows: string[];
  integrations: string[];
  humanApproval: string[];
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
    ].sort(),
    requestedPaths: [...paths].sort(),
    relevantChecks,
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
  ].filter(Boolean);
  for (const path of referencedFiles) {
    if (isAbsoluteOrEscaping(path)) {
      failures.push(`${discoveryPath} references non-relative path ${path}`);
    } else if (!(await exists(join(root, path)))) {
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
  const template = join(root, "modules/_template");
  const contract = deriveModuleContract(spec);
  const generated = [
    `${spec.module.destination}/AGENTS.md`,
    `${spec.module.destination}/module.contract.yaml`,
    `${spec.module.destination}/domain.module.yaml`,
  ];
  const preserved: string[] = [];
  if (!dryRun) {
    await mkdir(dirname(destination), { recursive: true });
    if (!(await exists(destination))) {
      await cp(template, destination, { recursive: true });
    } else {
      preserved.push(spec.module.destination);
    }
    await writeFileAtomic(
      join(destination, "AGENTS.md"),
      moduleAgentsContent(spec),
    );
    await writeFileAtomic(
      join(destination, "module.contract.yaml"),
      stableStringify(contract),
    );
    const domainPath = join(destination, "domain.module.yaml");
    const existingDomain = await readOptional(domainPath);
    if (!existingDomain || existingDomain.includes("replace-with-domain-id")) {
      await writeFileAtomic(domainPath, domainModuleYaml(spec));
    } else {
      preserved.push(`${spec.module.destination}/domain.module.yaml`);
    }
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
  { taskPath }: { taskPath: string },
) {
  const context = await buildAgentContext(root, { taskPath, paths: [] });
  const taskHash = await fileSha256(join(root, taskPath));
  const runId = taskHash.slice(0, 16);
  const reportPath = join(root, ".agent", "runs", runId, "report.json");
  const report = stableClone({
    schemaVersion: "1.0.0",
    runId,
    task: taskPath,
    taskHash,
    selectedInstructionHashes: context.selectedContext
      .filter(hasSha256)
      .map((item) => ({ path: item.path, sha256: item.sha256 }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    filesChanged: [],
    commandsExecuted: [],
    acceptanceCriteria: [],
    externalSources: context.selectedSources,
    architecturePolicyFindings: [],
    humanApprovals: [],
    deviations: [],
    residualRisks: [],
  });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFileAtomic(reportPath, stableStringify(report));
  return { reportPath: relative(root, reportPath), report };
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

export function deriveModuleContract(spec: AppSpec): ModuleContract {
  return stableClone({
    schemaVersion: "1.0.0",
    moduleId: spec.module.id,
    lifecycle: spec.module.lifecycle,
    owner: spec.module.owner,
    riskClass: spec.module.riskClass,
    publicExports: ["domain.module.yaml", "contracts/*.screen.yaml"],
    permittedDependencies: [
      "@senticor/platform-contracts",
      "@senticor/public-sector-sdk",
      "@senticor/public-sector-ui",
    ],
    consumedCapabilities: spec.requiredCapabilities,
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
    storage: {
      migrations: [`${spec.module.destination}/migrations/database/`],
      ownsTables: [`${spec.module.id.replace(/-/g, "_")}_cases`],
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
  return Object.fromEntries(
    (discovery.commands ?? [])
      .map((command) => [command.script, scripts[command.script]])
      .filter(([, value]) => Boolean(value))
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
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
    const terms = spec.domainVocabulary.filter((term) => term.length >= 4);
    for (const file of files) {
      const rel = relative(root, file);
      if (rel.startsWith(spec.module.destination)) {
        continue;
      }
      const text = await readFile(file, "utf8").catch(() => "");
      for (const term of terms) {
        if (new RegExp(escapeRegExp(term), "i").test(text)) {
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

function validateAppSpecShape(spec: AppSpec) {
  const failures: string[] = [];
  if (spec.schemaVersion !== "1.0.0") {
    failures.push("app spec schemaVersion must be 1.0.0");
  }
  if (!spec.module?.id || !spec.module?.destination) {
    failures.push("app spec missing module id or destination");
  }
  if (!spec.module?.destination?.startsWith("modules/")) {
    failures.push("module destination must be under modules/");
  }
  if (!spec.acceptanceCriteria?.length) {
    failures.push("app spec must define acceptance criteria");
  }
  if (!spec.requiredCapabilities?.length) {
    failures.push("app spec must consume platform capabilities");
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
