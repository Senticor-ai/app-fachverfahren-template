import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { getGitCommit, getGitDiffHash, getGitShortStatus } from "./git.ts";
import {
  createAnswers,
  createLock,
  defaultOwnership,
  writeTemplateMetadata,
} from "./manifest.ts";
import { readJson, type PackageJson } from "./structured-edit.ts";

interface RenderDomainAppOptions {
  domain: string;
  displayName: string;
  force?: boolean;
  allowDirty?: boolean;
  allowExistingEmpty?: boolean;
  features?: {
    postgres?: boolean;
    mockAuth?: boolean;
  };
}

const ignoredNames = new Set([
  ".git",
  ".agent",
  ".pnpm",
  ".pnpm-tools",
  ".pnpm-store",
  ".tmp",
  "coverage",
  "dist",
  "dist-server",
  "dist-types",
  "node_modules",
  "playwright-report",
  "storybook-static",
  "temp",
  "test-results",
  "tmp",
]);

const repositoryOnlyPaths = new Set([".gitlab/CODEOWNERS"]);

// INTERNE MAINTAINER-Skills bleiben im Template-Repo (für dessen eigene Pflege/Publish-Workflow), werden aber NIE in
// einen gescaffoldeten/konsumierbaren App-Baum kopiert — sonst leckt Maintainer-Internes (SDK-Publish-Interna,
// interne Anforderungsregister mit contributor-lokalen Pfaden) in jeden Fork. Präfix-basiert, ganze Verzeichnisse.
const repositoryOnlyPrefixes = [
  ".agents/skills/deutschland-plattform-anforderungen/",
  // auch der Claude-Shim des internen Skills — sonst erhielte ein Konsument einen verwaisten Zeiger auf einen
  // Skill, den er (korrekt) nicht bekommt.
  ".claude/skills/deutschland-plattform-anforderungen/",
];

// Die generische Template-Engine wird VERBATIM kopiert — NIE textersetzt. Sie enthält ihre eigene
// Ersetzungs-Tabelle sowie Identitäts-/Provenienz-Konstanten als DATEN (z.B. `fachverfahren-template`,
// `senticor-app-fachverfahren-template`, `Musterantrag`). Würde man sie ersetzen, zerlegte sich die
// Engine im Konsumenten selbst (aus `["fachverfahren-template", domain]` würde `["beispiel", domain]`
// — eine nackte Ersetzungsregel, die Identifier zerbricht) und der "bin ich die Vorlage?"-Selbsttest
// (`sourcePackage.name.includes("fachverfahren-template")`) kippte. Umbenennung/Ersetzung im
// Konsumenten laufen stattdessen generisch über die zur Laufzeit erkannte Basis-Domain (`${from}`).
const substitutionExcludedPrefixes = ["tooling/template/"];

const textExtensions = new Set([
  ".css",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".mts",
  ".rego",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".tpl",
  ".tsx",
  ".txt",
  ".webmanifest",
  ".yaml",
  ".yml",
]);

const textFileNames = new Set([
  ".dockerignore",
  ".editorconfig",
  ".env.example",
  ".env.local.example",
  ".gitignore",
  ".gitlab-ci.yml",
  ".npmrc",
  ".prettierignore",
  ".prettierrc",
  "Dockerfile",
  // Husky-Hooks (kein Datei-Suffix): referenzieren App-Pfade (apps/<domain>/…), müssen daher
  // mit-umgeschrieben werden, sonst bricht z.B. der Leistungsvertrag-Hook in der generierten App.
  "commit-msg",
  "pre-commit",
  "pre-push",
]);

/** Is `dir` a LIVE/governed consumer project (not the pristine template)? A governed instance carries an overlay
 *  marker — a `.chos/` directory (the public overlay convention; see docs/reference/chos-code-integration.md). The
 *  domain-app scaffold must render from the pristine template only — scaffolding from a governed consumer could follow
 *  an overlay symlink into shared governance and corrupt it. The pristine template ships no such marker. */
async function isLiveConsumerProject(dir: string): Promise<boolean> {
  for (const marker of [".chos"]) {
    try {
      await access(join(dir, marker));
      return true;
    } catch {
      /* marker absent — good */
    }
  }
  return false;
}

export async function renderDomainApp(
  sourceRoot: string,
  targetDir: string,
  options: RenderDomainAppOptions,
) {
  const source = resolve(sourceRoot);
  const target = resolve(targetDir);
  const answers = createAnswers(options);

  if (target === source || source.startsWith(`${target}/`)) {
    throw new Error(
      "refusing to scaffold into the template root or its parent",
    );
  }

  // GUARD: the domain-app scaffold renders FROM the pristine template — NEVER from a live/governed consumer project.
  // A governed instance carries an overlay marker (a `.chos/` dir) that may be a SYMLINK into shared source governance.
  // Copying + the in-place string-replace would follow that symlink and flip the shared source
  // (`apps/fachverfahren` -> `apps/<domain>`), corrupting it for every future build (in multi-tenancy: cross-tenant
  // corruption). One truth, no parallel path: refuse hard.
  if (await isLiveConsumerProject(source)) {
    throw new Error(
      "refusing to scaffold FROM a live/governed consumer project (found .chos/ — a governed instance, not the pristine template). Run the domain-app scaffold from the template source only.",
    );
  }

  const targetExists = await exists(target);
  if (targetExists && options.force) {
    await rm(target, { recursive: true, force: true });
  } else if (targetExists && options.allowExistingEmpty) {
    if (!(await isEmptyDirectory(target))) {
      throw new Error(`target already exists and is not empty: ${target}`);
    }
  } else if (targetExists) {
    throw new Error(`target already exists: ${target}`);
  }

  const dirtyStatus = await getGitShortStatus(source);
  if (dirtyStatus && !options.allowDirty) {
    throw new Error(
      "refusing to scaffold from a dirty template source; commit or stash changes, or pass --allow-dirty",
    );
  }

  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, {
    recursive: true,
    filter: (path) => shouldCopy(path, source),
  });

  // Basis-Identität der QUELLE: die pristine Vorlage ist `fachverfahren`/`Fachverfahren`; ein bereits
  // scaffoldeter Konsument trägt seine eigene Domain in `.template/answers.json`. Ohne diese Erkennung
  // könnte eine generierte App (apps/<domain>) sich selbst NICHT erneut scaffolden — die mitgelieferte
  // render.test.ts / `check:scaffold` würden dort `apps/fachverfahren` suchen und fehlschlagen. Ein externer
  // App-Generator fährt aber genau diesen `pnpm run test:template`-Gate in generierten Apps.
  const base = await detectBaseIdentity(source);

  const appSource = join(target, "apps", base.domain);
  const appTarget = join(target, "apps", answers.domain);
  if ((await exists(appSource)) && appSource !== appTarget) {
    await rm(appTarget, { recursive: true, force: true });
    await rename(appSource, appTarget);
  }
  const chartSource = join(appTarget, "deploy", "helm", base.domain);
  const chartTarget = join(appTarget, "deploy", "helm", answers.domain);
  if ((await exists(chartSource)) && chartSource !== chartTarget) {
    await rm(chartTarget, { recursive: true, force: true });
    await rename(chartSource, chartTarget);
  }

  const replacements = createReplacements(base, answers);
  const rewritten = await rewriteTextFiles(target, replacements);
  await writeEnvExample(target);
  // Domain-Ersetzung ändert Zeilenlängen (z.B. `apps/fachverfahren` -> `apps/<domain>`), wodurch
  // Prettiers opinionated Umbruch/Markdown-Tabellen-Ausrichtung nicht mehr passt und `format:check`
  // in der generierten App bricht. Deshalb die umgeschriebenen Dateien einmal deterministisch
  // nachformatieren (respektiert .prettierignore, z.B. den emit-generierten Leistungsvertrag).
  await formatRewrittenFiles(target, rewritten);

  const rootPackage = await readJson<PackageJson>(join(source, "package.json"));
  const commit = await getGitCommit(source);
  const dirty = dirtyStatus !== "";
  const appliedMigrations = await listMigrationIds(source);
  await writeTemplateMetadata(target, {
    answers,
    ownership: defaultOwnership,
    lock: createLock({
      templateSource: rootPackage.name,
      templateVersion: rootPackage.version,
      generatorVersion: rootPackage.version,
      templateCommit: dirty ? "working-tree" : commit,
      templateDirty: dirty ? true : undefined,
      templateDiffHash: dirty ? await getGitDiffHash(source) : undefined,
      appliedMigrations,
    }),
  });

  return {
    target,
    answers,
    appliedMigrations,
  };
}

export async function listMigrationIds(root: string): Promise<string[]> {
  const migrationsDir = join(root, "tooling", "template", "migrations");
  const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function rewriteTextFiles(
  root: string,
  replacements: Array<[string, string]>,
): Promise<string[]> {
  const files = await collectFiles(root);
  const changed: string[] = [];
  for (const file of files) {
    if (!isTextFile(file) || isSubstitutionExcluded(file, root)) {
      continue;
    }
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    if (content.includes("\u0000")) {
      continue;
    }
    let next = content;
    for (const [from, to] of replacements) {
      next = next.split(from).join(to);
    }
    if (next !== content) {
      await writeFile(file, next);
      changed.push(file);
    }
  }
  return changed;
}

/** Formatiert die durch die Domain-Ersetzung veränderten Dateien mit Prettier nach. Nur Dateien, die
 *  Prettier kennt (inferredParser gesetzt) und die NICHT via .prettierignore ausgenommen sind, werden
 *  angefasst — deterministisch (gleiche Prettier-Version + Config => byte-gleich, `check:scaffold-
 *  reproducible` bleibt grün). Prettier wird lazy importiert, damit reine CLI-Importe von cli.ts nicht
 *  die große Prettier-Modulgraph-Ladezeit zahlen. */
async function formatRewrittenFiles(root: string, files: string[]) {
  if (files.length === 0) {
    return;
  }
  const prettier = (await import("prettier")).default;
  const ignorePath = join(root, ".prettierignore");
  for (const file of files) {
    const info = await prettier.getFileInfo(file, {
      ignorePath,
      resolveConfig: true,
    });
    if (info.ignored || !info.inferredParser) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const config = await prettier.resolveConfig(file);
    let formatted: string;
    try {
      formatted = await prettier.format(content, {
        ...config,
        filepath: file,
      });
    } catch (error) {
      // Kann Prettier eine Datei nicht parsen, dann könnte `format:check` sie ohnehin nicht erzwingen
      // — die generierte Datei unformatiert lassen statt das ganze Scaffold abzubrechen. Sichtbar
      // machen, damit echte Ersetzungs-Fehler (Substitution erzeugt ungültige Syntax) auffallen.
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`prettier skip (nicht parsebar): ${file} — ${message}`);
      continue;
    }
    if (formatted !== content) {
      await writeFile(file, formatted);
    }
  }
}

// Schutz-Platzhalter: Namen, die "fachverfahren" enthalten, aber beim Scaffold NIE umbenannt werden dürfen —
// das Kit-Paket (packages/fachverfahren-kit bleibt in jeder App gleichnamig; "@senticor/fachverfahren" ist ein
// Präfix von "@senticor/fachverfahren-kit") und der Skill-Ordner .agents/skills/fachverfahren-app (Verzeichnisse
// werden nicht umbenannt, Text-Referenzen müssen dazu passen). Werden vor den Identitäts-Regeln maskiert und
// danach wiederhergestellt; die Platzhalter-Strings kommen im Repo sonst nirgends vor.
const KIT_GUARD = "@@senticor-kit-guard@@";
const SKILL_GUARD = "@@fachverfahren-app-skill-guard@@";

interface BaseIdentity {
  domain: string;
  displayName: string;
}

/** Identität der QUELL-App, aus der gerendert wird. Die pristine Vorlage kennzeichnet sich NICHT als
 *  Konsument (kein `.template/answers.json`) und ist per Definition `fachverfahren`/`Fachverfahren`.
 *  Ein bereits scaffoldeter Konsument trägt seine Domain in `.template/answers.json` — von dort lesen
 *  wir sie, damit apps/<domain>-Umbenennung und Textersetzung generisch (nicht auf `fachverfahren`
 *  festgenagelt) funktionieren und ein generierter App sich selbst erneut scaffolden kann. */
async function detectBaseIdentity(source: string): Promise<BaseIdentity> {
  try {
    const answers = await readJson<Partial<BaseIdentity>>(
      join(source, ".template", "answers.json"),
    );
    if (answers.domain && answers.displayName) {
      return { domain: answers.domain, displayName: answers.displayName };
    }
  } catch {
    /* pristine Vorlage: kein .template/answers.json — Fallback unten */
  }
  return { domain: "fachverfahren", displayName: "Fachverfahren" };
}

function createReplacements(
  base: BaseIdentity,
  answers: { domain: string; displayName: string },
): Array<[string, string]> {
  const domain = answers.domain;
  const displayName = answers.displayName;
  const from = base.domain;
  const fromDisplay = base.displayName;
  return [
    // SCHUTZ zuerst (siehe oben) — dann Reihenfolge: längste/spezifischste Muster zuerst,
    // sonst zerlegt ein kürzeres Muster die längeren Treffer.
    ["fachverfahren-kit", KIT_GUARD],
    ["fachverfahren-app", SKILL_GUARD],
    // Vorlagen-spezifische Verbund-Tokens: existieren NUR in der pristinen Vorlage (im Konsumenten
    // bereits zu seiner Domain konsumiert → hier No-ops). Müssen vor den Basis-Identitätsregeln stehen.
    ["senticor-app-fachverfahren-template", `senticor-app-${domain}`],
    ["fachverfahren-template", domain],
    ["Fachverfahren Template", displayName],
    ["Fachverfahren Vorlage", displayName],
    // Die neutrale Demo-Leistung der Vorlage wird beim Scaffold zum konkreten Verfahren.
    ["Musterantrag", displayName],
    // App-IDENTITÄT (Paketname, Pfade, Helm-Chart/-Helper, Registry/Host, Anzeige-Name) — parametrisiert
    // über die ERKANNTE Basis-Domain (`from`): Vorlage=fachverfahren, sonst die Konsumenten-Domain.
    // Bewusst KEINE nackte from-Regel: das Wort ist zugleich Gattungsbegriff der Doku und Bestandteil
    // von Kit-Bezeichnern (FachverfahrenShell/FachverfahrenStore bleiben unangetastet).
    [`senticor-app-${from}`, `senticor-app-${domain}`],
    [`@senticor/${from}`, `@senticor/${domain}`],
    [`apps/${from}`, `apps/${domain}`],
    [`deploy/helm/${from}`, `deploy/helm/${domain}`],
    [`senticor/${from}`, `senticor/${domain}`],
    // Punkt-Identitäten, die NICHT von der quotierten `"${from}.`-Regel erfasst werden: die
    // Agent-Discovery-ID (`senticor.<domain>`) und das UNquotierte k8s-Label `part-of: <domain>`
    // (im Helm-_helpers.tpl). Ohne diese blieben sie beim Re-Scaffold aus einem Konsumenten stale
    // (z.B. `senticor.beispiel` / `part-of: beispiel`), obwohl answers.json die neue Domain nennt.
    [`senticor.${from}`, `senticor.${domain}`],
    [
      `app.kubernetes.io/part-of: ${from}`,
      `app.kubernetes.io/part-of: ${domain}`,
    ],
    [`"${from}.`, `"${domain}.`],
    [`${from}.example.invalid`, `${domain}.example.invalid`],
    [`name: ${from}`, `name: ${domain}`],
    [`"${fromDisplay}"`, `"${displayName}"`],
    [`${fromDisplay} - Referenz-App`, `${displayName} - Referenz-App`],
    [`${fromDisplay} Referenz-App`, `${displayName} Referenz-App`],
    // Schutz wieder aufheben:
    [KIT_GUARD, "fachverfahren-kit"],
    [SKILL_GUARD, "fachverfahren-app"],
  ];
}

async function writeEnvExample(root: string) {
  await writeFile(
    join(root, ".env.local.example"),
    [
      "# Lokale Entwicklungswerte für Fastify und Vite.",
      "# Kopiere diese Datei nach .env.local und passe Werte bei Bedarf an.",
      "",
      "APP_PG_URL=postgres://app:app@127.0.0.1:5432/app",
      "APP_PG_DIRECT_URL=postgres://app:app@127.0.0.1:5432/app",
      "APP_ENABLE_MOCK_AUTH=true",
      "APP_ENABLE_SERVICE_WORKER=false",
      "APP_CSP_MODE=enforce",
      "APP_TRUST_PROXY=loopback",
      "APP_ALLOWED_HOSTS=127.0.0.1:8080,localhost:8080",
      "APP_MAX_BODY_BYTES=1048576",
      "APP_SHUTDOWN_TIMEOUT_MS=10000",
      "VITE_API_MOCKING=disabled",
      "VITE_API_PROXY_TARGET=http://127.0.0.1:8080",
      "",
    ].join("\n"),
  );
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredNames.has(entry.name)) {
        files.push(...(await collectFiles(path)));
      }
    } else {
      files.push(path);
    }
  }
  return files;
}

function shouldCopy(path: string, sourceRoot: string) {
  const relativePath = relative(sourceRoot, path).split("\\").join("/");
  if (relativePath === "") {
    return true;
  }
  if (
    repositoryOnlyPaths.has(relativePath) ||
    repositoryOnlyPrefixes.some(
      (prefix) =>
        relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix),
    )
  ) {
    return false;
  }
  // TypeScript-Inkrementell-State (`*.tsbuildinfo`, git-ignoriert, liegt NEBEN der tsconfig statt in
  // dist/) NIE mitkopieren: aus einem gebauten Arbeitsbaum (genau der Fall beim lokalen `scaffold`)
  // täuschte er `tsc -b` „schon gebaut" vor, dist/ fehlt aber -> TS6305 im generierten App.
  if (basename(relativePath).endsWith(".tsbuildinfo")) {
    return false;
  }
  return !relativePath.split("/").some((part) => ignoredNames.has(part));
}

function isTextFile(path: string) {
  return textExtensions.has(extname(path)) || textFileNames.has(basename(path));
}

function isSubstitutionExcluded(path: string, root: string) {
  const relativePath = relative(root, path).split("\\").join("/");
  return substitutionExcludedPrefixes.some((prefix) =>
    relativePath.startsWith(prefix),
  );
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function isEmptyDirectory(path: string) {
  try {
    const entry = await stat(path);
    return entry.isDirectory() && (await readdir(path)).length === 0;
  } catch {
    return false;
  }
}
