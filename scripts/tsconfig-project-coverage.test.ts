// tsconfig-project-coverage.test — THE RATCHET AGAINST «AN EXTENSION WITHOUT COVERAGE IS WORTHLESS».
//
// ⛔ MEASURED 2026-09-09: `packages/fachverfahren-kit` carried `composite: true`, its own `typecheck`
// script and SIX type errors — and stood in NO reference of the root `tsconfig.json`. `pnpm typecheck`
// (link 1: `tsc -b`) reported green because it never looked at the package. Seventeen of eighteen
// composite projects were referenced; the eighteenth was the broken one.
//
// The effect was not limited to the template: the boot precondition of every GENERATED application runs
// `pnpm exec tsc -b <all 18 packages>` and wrote the six errors as line 1 of its `_devserver.log` — on
// every start, in every project. The template was green, the product red.
//
// THIS RATCHET ASKS FOR THE PROPERTY, NOT FOR A LIST OF NAMES: whoever declares `composite: true` promises
// to be part of a project build graph. So the root must know them. An exception list would not have found
// the very error it would have been written against — «a list only ever knows the names somebody wrote
// into it». For the same reason the scan roots are READ from `pnpm-workspace.yaml` rather than typed out
// here: the first version listed four roots where the workspace declares three, so the ratchet was already
// scanning a root the package manager does not know about.
//
// Four mandatory parts, so the ratchet does not stand silently green itself:
//   1. POSITIVE CONTROL of the search form — does the scan find composite projects at all? An empty set
//      would otherwise be an acquittal out of blindness.
//   2. Every scan root read from the workspace file must EXIST — a root that silently disappears shrinks
//      the scan without anybody noticing.
//   3. The references of the root must EXIST — a dead address falls here, not at the next `tsc -b`.
//   4. Both directions are checked: no composite project without a reference AND no reference without a
//      project.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The roots under which pnpm workspace packages live — READ from `pnpm-workspace.yaml`, the one truth
 * about what belongs to this workspace.
 *
 * FAIL-CLOSED: a glob shape this reader does not cover raises instead of being skipped. Skipping it would
 * shrink the scan silently, and a ratchet that scans less than it believes is the failure it exists
 * against.
 */
function workspaceRoots(): string[] {
  const workspaceFile = path.join(repoRoot, "pnpm-workspace.yaml");
  const declared = parseYaml(readFileSync(workspaceFile, "utf8")) as {
    packages?: unknown;
  };
  const globs = declared.packages;
  if (!Array.isArray(globs) || globs.length === 0)
    throw new Error(
      `${workspaceFile} declares no \`packages:\` globs — this ratchet would then scan nothing and acquit out of blindness.`,
    );
  return globs.map((glob) => {
    if (typeof glob !== "string" || !/^[A-Za-z0-9._-]+\/\*$/.test(glob))
      throw new Error(
        `${workspaceFile} declares the glob «${String(glob)}», which this reader does not cover (expected «<dir>/*»). Extend the reader deliberately instead of guessing.`,
      );
    return glob.slice(0, -"/*".length);
  });
}

const scanRoots = workspaceRoots();

interface Tsconfig {
  compilerOptions?: { composite?: boolean };
  references?: { path?: string }[];
}

/** tsconfig files of this tree carry comments (JSONC). TypeScript's own parser is the ONE truth about how
 *  `tsc` reads them — `JSON.parse` would be a second, stricter one. */
function readTsconfig(absolutePath: string): Tsconfig {
  const text = readFileSync(absolutePath, "utf8");
  const parsed = ts.parseConfigFileTextToJson(absolutePath, text);
  if (parsed.error) {
    throw new Error(
      `tsconfig not readable: ${absolutePath} — ${ts.flattenDiagnosticMessageText(parsed.error.messageText, " ")}`,
    );
  }
  return (parsed.config ?? {}) as Tsconfig;
}

/** Every workspace package with its own `tsconfig.json`, relative to the repo root and with `/` as separator. */
function workspaceProjects(): string[] {
  const found: string[] = [];
  for (const root of scanRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!existsSync(absoluteRoot)) continue;
    for (const entry of readdirSync(absoluteRoot).sort()) {
      const relative = `${root}/${entry}`;
      const absolute = path.join(repoRoot, relative);
      if (!statSync(absolute).isDirectory()) continue;
      if (!existsSync(path.join(absolute, "tsconfig.json"))) continue;
      found.push(relative);
    }
  }
  return found;
}

const rootReferences = (
  readTsconfig(path.join(repoRoot, "tsconfig.json")).references ?? []
)
  .map((reference) => reference.path)
  .filter((value): value is string => typeof value === "string");

const compositeProjects = workspaceProjects().filter(
  (project) =>
    readTsconfig(path.join(repoRoot, project, "tsconfig.json")).compilerOptions
      ?.composite === true,
);

describe("tsconfig project coverage — `tsc -b` at the root sees EVERY composite package", () => {
  it("POSITIVE CONTROL: the scan finds composite projects at all (otherwise every assertion below is blind)", () => {
    // On 2026-09-09 there were 18 composite projects in the tree. The lower bound keeps the assertion
    // honest without breaking on every new package.
    expect(compositeProjects.length).toBeGreaterThanOrEqual(10);
    expect(rootReferences.length).toBeGreaterThanOrEqual(10);
  });

  it("every scan root declared by pnpm-workspace.yaml exists — a vanished root shrinks the scan silently", () => {
    expect(scanRoots.length).toBeGreaterThanOrEqual(1);
    expect(
      scanRoots.filter((root) => !existsSync(path.join(repoRoot, root))),
    ).toEqual([]);
  });

  it("no composite package stands outside the root references — otherwise `tsc -b` NEVER checks it", () => {
    const uncovered = compositeProjects.filter(
      (project) => !rootReferences.includes(project),
    );
    expect(uncovered).toEqual([]);
  });

  it("no reference of the root points at a project that does not exist (dead address)", () => {
    const dead = rootReferences.filter(
      (reference) =>
        !existsSync(path.join(repoRoot, reference, "tsconfig.json")),
    );
    expect(dead).toEqual([]);
  });
});
