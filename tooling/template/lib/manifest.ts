import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readJson, writeFileAtomic, writeJson } from "./structured-edit.ts";

export const templateDirectory = ".template";
export const templateSchemaVersion = 1;
export const defaultTemplateSource = "senticor-app-fachverfahren-template";
export const defaultTemplateVersion = "0.1.0-rc.1";

export interface TemplateAnswers {
  domain: string;
  displayName: string;
  features: {
    postgres: boolean;
    mockAuth: boolean;
  };
}

export interface TemplateLock {
  schemaVersion: number;
  templateSource: string;
  templateVersion: string;
  templateCommit: string;
  templateDirty?: boolean;
  templateDiffHash?: string;
  generatorVersion: string;
  appliedMigrations: string[];
}

export interface TemplateOwnership {
  paths: Record<string, "replace" | "merge" | "structured-merge" | "consumer">;
}

export const defaultOwnership: TemplateOwnership = {
  paths: {
    "README.md": "merge",
    "SECURITY.md": "merge",
    "CHANGELOG.md": "merge",
    "CODE_OF_CONDUCT.md": "replace",
    "ADOPTERS.md": "consumer",
    ".gitlab-ci.yml": "replace",
    "ci.yml": "replace",
    "scripts/codesphere-toolchain.sh": "replace",
    ".gitlab/CODEOWNERS": "consumer",
    ".gitlab/issue_templates/**": "replace",
    ".gitlab/merge_request_templates/**": "replace",
    Dockerfile: "merge",
    "package.json": "structured-merge",
    "pnpm-workspace.yaml": "structured-merge",
    "agent.discovery.json": "replace",
    ".agents/skills/**": "replace",
    "docs/README.md": "replace",
    "docs/agents/**": "replace",
    "docs/assets/**": "replace",
    "docs/compliance/**": "replace",
    "docs/reference/**": "replace",
    "docs/ux-ui/**": "replace",
    "policy/**": "replace",
    "schemas/**": "replace",
    "platform/capabilities.json": "replace",
    "docs/capabilities/**": "replace",
    "sources/registry.yaml": "replace",
    "sources/source-lock.json": "structured-merge",
    "tooling/template/**": "replace",
    "scripts/check-template-*.mjs": "replace",
    "scripts/check-openapi.mjs": "replace",
    "scripts/smoke-runtime.mjs": "replace",
    "scripts/check-web-delivery.mjs": "replace",
    "scripts/check-k8s-delivery.mjs": "replace",
    "scripts/check-supply-chain.sh": "replace",
    "scripts/validate-k8s-render.sh": "replace",
    "scripts/scaffold-*.mjs": "replace",
    "apps/*/deploy/helm/**": "replace",
    "apps/*/public/**": "replace",
    "apps/*/server/**": "replace",
    // Die geteilten Runtime-Pakete sind Vorlagen-Fundament, kein Konsumenten-Code: Vorlagen-PRs
    // ändern Server-Code und Paket-API im Gleichschritt (z.B. app-store-postgres). Ohne diesen
    // Eintrag aktualisierte template:update nur apps/*/server/** und ließ die Pakete stehen —
    // der Konsument brach mit TS-Fehlern gegen die alte Paket-API (Deploy-Run 29241279544).
    "packages/*/**": "replace",
    "apps/*/src/domain/**": "consumer",
    "docs/domain/**": "consumer",
    "modules/*/**": "consumer",
  },
};

export function createAnswers({
  domain,
  displayName,
  features = { postgres: true, mockAuth: true },
}: {
  domain: string;
  displayName: string;
  features?: Partial<TemplateAnswers["features"]>;
}): TemplateAnswers {
  return {
    domain,
    displayName,
    features: {
      postgres: features.postgres !== false,
      mockAuth: features.mockAuth !== false,
    },
  };
}

export function createLock({
  templateSource = defaultTemplateSource,
  templateVersion = defaultTemplateVersion,
  templateCommit = "working-tree",
  templateDirty,
  templateDiffHash,
  generatorVersion = defaultTemplateVersion,
  appliedMigrations = [],
}: Partial<TemplateLock> = {}): TemplateLock {
  const lock: TemplateLock = {
    schemaVersion: templateSchemaVersion,
    templateSource,
    templateVersion,
    templateCommit,
    generatorVersion,
    appliedMigrations,
  };
  if (templateDirty !== undefined) {
    lock.templateDirty = templateDirty;
  }
  if (templateDiffHash) {
    lock.templateDiffHash = templateDiffHash;
  }
  return lock;
}

export async function readTemplateAnswers(
  root = process.cwd(),
): Promise<TemplateAnswers> {
  return readJson(join(root, templateDirectory, "answers.json"));
}

export async function readTemplateLock(
  root = process.cwd(),
): Promise<TemplateLock> {
  return readJson(join(root, templateDirectory, "lock.json"));
}

export async function readOwnership(
  root = process.cwd(),
): Promise<TemplateOwnership> {
  const path = join(root, templateDirectory, "ownership.yaml");
  const text = await readFile(path, "utf8");
  return parseOwnershipYaml(text);
}

export async function hasTemplateMetadata(root = process.cwd()) {
  try {
    await access(join(root, templateDirectory, "lock.json"));
    return true;
  } catch {
    return false;
  }
}

export async function writeTemplateMetadata(
  root: string,
  {
    answers,
    lock,
    ownership,
  }: {
    answers: TemplateAnswers;
    lock: TemplateLock;
    ownership: TemplateOwnership;
  },
) {
  const directory = join(root, templateDirectory);
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, "answers.json"), answers);
  await writeJson(join(directory, "lock.json"), lock);
  await writeFileAtomic(
    join(directory, "ownership.yaml"),
    formatOwnershipYaml(ownership ?? defaultOwnership),
  );
  await writeFileAtomic(
    join(directory, "README.md"),
    [
      "# Template Provenance",
      "",
      "Diese Dateien verbinden das Repository mit dem Fachverfahren-Template.",
      "",
      "- `answers.json` enthält stabile Scaffold-Eingaben.",
      "- `lock.json` enthält Template-Version, Commit und angewandte Migrationen.",
      "- `ownership.yaml` steuert, welche Pfade vom Template aktualisiert werden.",
      "  Neue Template-Defaults werden bei `template:update` automatisch ergänzt",
      "  (eigene Einträge gewinnen); Opt-out = Strategie `consumer` setzen statt",
      "  die Zeile zu löschen.",
      "",
      "Diese Dateien enthalten keine Zeitstempel oder lokalen Maschinenpfade.",
      "",
    ].join("\n"),
  );
}

export function parseOwnershipYaml(text: string): TemplateOwnership {
  const paths: TemplateOwnership["paths"] = {};
  let inPaths = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths || line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const match = line.match(/^\s{2}"?([^":]+)"?:\s*([a-z-]+)\s*$/);
    if (match) {
      const strategy = match[2] as TemplateOwnership["paths"][string];
      paths[match[1]] = strategy;
    }
  }
  return { paths };
}

export function formatOwnershipYaml(ownership: TemplateOwnership): string {
  const entries = Object.entries(ownership.paths ?? {});
  return [
    "paths:",
    ...entries.map(([path, strategy]) => `  "${path}": ${strategy}`),
    "",
  ].join("\n");
}

/** Ergänzt Default-Einträge, die im persistierten ownership.yaml eines Konsumenten fehlen (Set-Differenz,
 *  neue Keys hinten angehängt → append-only-Diff). Persistierte Einträge gewinnen IMMER: Konsumenten-Overrides
 *  werden nie zurückgesetzt, und Strategie-ÄNDERUNGEN an bestehenden Defaults propagieren bewusst nicht
 *  (dafür gibt es Template-Migrationen — es existiert keine Provenienz, um Override von veraltetem Snapshot
 *  zu unterscheiden). Das gilt auch für BREITERE persistierte Muster: deckt z.B. `docs/**: consumer` einen
 *  neuen, spezifischeren Default `docs/reference/**` ab, wird dieser NICHT ergänzt — sonst gewönne er als
 *  spezifischeres Pattern in explainOwnership und hebelte das Konsumenten-Opt-out aus (Codex-Review PR #26).
 *  Umgekehrt werden BREITERE Defaults trotz engerer persistierter Muster ergänzt (verschachtelte Pfade
 *  brauchen Verwaltung); für die vom engeren Muster gematchten Pfade behält dieses Vorrang, weil
 *  explainOwnership nach Spezifizität statt roher Länge entscheidet (isMoreSpecificOwnershipPattern).
 *  Gelöschte Einträge werden beim nächsten Update wieder ergänzt; dauerhaftes Opt-out = Strategie auf
 *  `consumer` setzen statt die Zeile zu löschen. */
export function mergeOwnershipDefaults(
  persisted: TemplateOwnership,
  defaults: TemplateOwnership = defaultOwnership,
): {
  ownership: TemplateOwnership;
  added: Array<{ path: string; strategy: TemplateOwnership["paths"][string] }>;
} {
  const persistedPaths = persisted.paths ?? {};
  const persistedPatterns = Object.keys(persistedPaths);
  const added = Object.entries(defaults.paths ?? {})
    .filter(
      ([path]) =>
        !persistedPatterns.some((pattern) =>
          ownershipPatternCovers(pattern, path),
        ),
    )
    .map(([path, strategy]) => ({ path, strategy }));
  return {
    ownership: {
      paths: {
        ...persistedPaths,
        ...Object.fromEntries(
          added.map(({ path, strategy }) => [path, strategy]),
        ),
      },
    },
    added,
  };
}

/** Deckt das persistierte Muster den (ggf. selbst wildcard-haltigen) Default-Pfad vollständig ab?
 *  Ein naives matchesOwnershipPattern(persistiert, defaultKey) prüft den Default-Key als LITERALEN
 *  Text: `apps/{star}/server/{star}` matchte so den Key `apps/{star}/server/{star}{star}`, deckt
 *  verschachtelte Pfade aber nicht ab (Codex-Review PR #26, Runde 2). Stattdessen wird der
 *  Default-Pfad zu konkreten Beispielpfaden expandiert (ein Stern → ein Segment; Doppelstern →
 *  ein UND zwei Segmente) — nur ein Muster, das ALLE Beispiele matcht, gilt als deckend.
 *  Das Sample-Segment `~cov~` kommt in echten Mustern nicht vor (keine False-Positives). */
export function ownershipPatternCovers(
  pattern: string,
  defaultPath: string,
): boolean {
  if (pattern === defaultPath) {
    return true;
  }
  return expandOwnershipPatternSamples(defaultPath).every((sample) =>
    matchesOwnershipPattern(pattern, sample),
  );
}

function expandOwnershipPatternSamples(pattern: string): string[] {
  let variants = [pattern];
  while (variants.some((variant) => variant.includes("**"))) {
    variants = variants.flatMap((variant) => {
      const index = variant.indexOf("**");
      if (index === -1) {
        return [variant];
      }
      const prefix = variant.slice(0, index);
      const suffix = variant.slice(index + 2);
      return [`${prefix}~cov~${suffix}`, `${prefix}~cov~/~cov~${suffix}`];
    });
  }
  return variants.map((variant) => variant.replaceAll("*", "~cov~"));
}

/** Lädt die `defaultOwnership` der ZIEL-Template-Quelle (per dynamischem Import ihres manifest.ts).
 *  Nötig, weil beim Update eines Konsumenten dessen INSTALLIERTE (ältere) CLI läuft: ein Default,
 *  den erst die neuere Quelle kennt, fehlt sowohl im persistierten ownership.yaml als auch in der
 *  kompilierten defaultOwnership der laufenden CLI — der Merge bliebe leer und die Datei fiele
 *  weiter auf merge/Konflikt zurück (Codex-Review PR #26). Vertrauensmodell wie bei Migrationen:
 *  template:update führt ohnehin Code aus der Quelle aus. Fallback auf die eigenen Defaults, wenn
 *  die Quelle kein importierbares Manifest trägt. */
export async function loadSourceOwnershipDefaults(
  sourceRoot: string,
): Promise<TemplateOwnership> {
  const manifestPath = join(
    sourceRoot,
    "tooling",
    "template",
    "lib",
    "manifest.ts",
  );
  try {
    await access(manifestPath);
    const module = await import(
      /* @vite-ignore */ pathToFileURL(manifestPath).href
    );
    const sourceDefaults = module.defaultOwnership as
      TemplateOwnership | undefined;
    if (
      sourceDefaults &&
      Object.keys(sourceDefaults.paths ?? {}).length > 0 &&
      validateOwnership(sourceDefaults).length === 0
    ) {
      return sourceDefaults;
    }
  } catch {
    // Quelle ohne (importierbares) Manifest → Defaults der laufenden CLI.
  }
  return defaultOwnership;
}

export function validateOwnership(ownership: TemplateOwnership): string[] {
  const allowed = new Set(["replace", "merge", "structured-merge", "consumer"]);
  const failures = [];
  for (const [path, strategy] of Object.entries(ownership.paths ?? {})) {
    if (!allowed.has(strategy)) {
      failures.push(`${path} uses unsupported ownership strategy ${strategy}`);
    }
  }
  return failures;
}

export function explainOwnership(
  ownership: TemplateOwnership,
  path: string,
): { pattern: string; strategy: TemplateOwnership["paths"][string] } {
  let bestMatch = undefined;
  for (const [pattern, strategy] of Object.entries(ownership.paths ?? {})) {
    if (matchesOwnershipPattern(pattern, path)) {
      if (
        !bestMatch ||
        isMoreSpecificOwnershipPattern(pattern, bestMatch.pattern)
      ) {
        bestMatch = { pattern, strategy };
      }
    }
  }
  return (
    bestMatch ?? {
      pattern: "(default)",
      strategy: "merge" as const,
    }
  );
}

/** Spezifizität statt roher Länge: erst mehr LITERALE Zeichen, dann weniger `**`-Wildcards,
 *  dann Länge (bisheriger Tie-Break). Reine Längenwertung ließe einen ergänzten breiteren
 *  Default (`apps/{star}/server/{star}{star}`, 16 Zeichen) das engere persistierte
 *  Konsumenten-Muster (`apps/{star}/server/{star}`, 15 Zeichen) auch für dessen EIGENE
 *  Pfade schlagen — "persistiert gewinnt" gilt aber pro Pfad (Codex-Review PR #26, Runde 3). */
function isMoreSpecificOwnershipPattern(a: string, b: string): boolean {
  const literalsA = a.replaceAll("*", "").length;
  const literalsB = b.replaceAll("*", "").length;
  if (literalsA !== literalsB) {
    return literalsA > literalsB;
  }
  const doubleStarsA = (a.match(/\*\*/g) ?? []).length;
  const doubleStarsB = (b.match(/\*\*/g) ?? []).length;
  if (doubleStarsA !== doubleStarsB) {
    return doubleStarsA < doubleStarsB;
  }
  return a.length > b.length;
}

export function matchesOwnershipPattern(
  pattern: string,
  path: string,
): boolean {
  if (pattern === path) {
    return true;
  }
  const segments = pattern.split(/(\*\*|\*)/g).map((segment) => {
    if (segment === "**") {
      return ".*";
    }
    if (segment === "*") {
      return "[^/]+";
    }
    return segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  });
  return new RegExp(`^${segments.join("")}$`).test(path);
}
