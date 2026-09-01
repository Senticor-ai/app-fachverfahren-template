// Witness for scripts/lib/source-exclusion.mjs — the ONE answer to «is this build output?».
//
// Two jobs here. The unit tests pin the derivation's DELIBERATE limits (each rejection in the module head
// has a damage case; each one gets an assertion). The last block is the ANTI-DRIFT RATCHET: it counts the
// hand-written exclusion lists left in the tree and lets that number only fall. Seven such lists existed on
// 2026-09-01 and four of them had drifted; a longer list would not have prevented the eighth.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_EXCLUSIONS,
  OUTPUT_PREFIXES,
  directoryNamesFromGitignore,
  isNotSource,
  sourceExclusions,
} from "./source-exclusion.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("directoryNamesFromGitignore — the deliberately narrow derivation", () => {
  it("takes plain directory names, with or without a trailing slash or /**", () => {
    expect(
      [...directoryNamesFromGitignore("dist/\ncoverage\nout/**\n")].sort(),
    ).toEqual(["coverage", "dist", "out"]);
  });

  it("REFUSES a negation — read as an exclusion it would invert exactly", () => {
    expect([...directoryNamesFromGitignore("!keep-me/\n")]).toEqual([]);
  });

  it("REFUSES a glob — a glob is not a directory name", () => {
    expect([
      ...directoryNamesFromGitignore("*.tsbuildinfo\nlogs-*/\n"),
    ]).toEqual([]);
  });

  it("REFUSES a multi-part or anchored path — a path has a PLACE", () => {
    expect([
      ...directoryNamesFromGitignore("/modules/hundesteuer/\napps/x/dist/\n"),
    ]).toEqual([]);
  });

  it("REFUSES a bare slash — it would hit the ROOT", () => {
    expect([...directoryNamesFromGitignore("/\n/**\n")]).toEqual([]);
  });

  it("skips comments and blank lines, and tolerates CRLF", () => {
    expect([
      ...directoryNamesFromGitignore("# a comment\r\n\r\ncoverage/\r\n"),
    ]).toEqual(["coverage"]);
  });

  it("a missing or empty file is an ANSWER (empty set), never an error", () => {
    expect([...directoryNamesFromGitignore(null)]).toEqual([]);
    expect([...directoryNamesFromGitignore(undefined)]).toEqual([]);
    expect([...directoryNamesFromGitignore("")]).toEqual([]);
  });
});

describe("sourceExclusions — a union can never weaken", () => {
  it("returns the built-in FLOOR when there is no .gitignore text", () => {
    expect([...sourceExclusions(null)].sort()).toEqual(
      [...BUILT_IN_EXCLUSIONS].sort(),
    );
  });

  it("is always a superset of the floor, whatever the .gitignore says", () => {
    const set = sourceExclusions("!node_modules\n!coverage\nsomething-else/\n");
    for (const name of BUILT_IN_EXCLUSIONS) expect(set.has(name)).toBe(true);
    expect(set.has("something-else")).toBe(true);
  });

  it("picks up THIS repo's real .gitignore, dist-types included", () => {
    const set = sourceExclusions(
      readFileSync(join(repoRoot, ".gitignore"), "utf8"),
    );
    // dist-types is the name whose absence made a boundary gate read 232 generated .d.ts as source.
    expect(set.has("dist-types")).toBe(true);
    expect(set.has("storybook-static")).toBe(true);
    expect(set.has("dist-server")).toBe(true);
  });
});

describe("isNotSource — the prefix carries the family, the set carries the names", () => {
  it("rejects the dist family even when nobody named the sibling", () => {
    expect(OUTPUT_PREFIXES).toContain("dist");
    for (const name of ["dist", "dist-server", "dist-types", "dist-esm"]) {
      expect(isNotSource(name)).toBe(true);
    }
  });

  it("POSITIVE CONTROL — real source directory names survive", () => {
    // Without this, a predicate that answered `true` to everything would pass every assertion above.
    for (const name of [
      "src",
      "apps",
      "packages",
      "modules",
      "distribution",
      "outbox",
      "buildings",
    ]) {
      expect(isNotSource(name)).toBe(false);
    }
  });
});

describe("ANTI-DRIFT RATCHET — how many hand-written exclusion lists are left?", () => {
  // A Set/array literal that names `node_modules` is somebody answering «is this a source?» by hand.
  const HANDWRITTEN = /(new Set\(|\[)[^)\]]{0,400}["']node_modules["']/s;

  /** The ONE place the answer is allowed to be written out, plus the config files that must repeat it in a
   *  syntax that cannot import (ignore files are plain text; vitest's `exclude` is glob, not basename). */
  const ALLOWED = new Set([
    "scripts/lib/source-exclusion.mjs",
    "scripts/lib/source-exclusion.test.ts",
    // ⛔ OUT OF REACH, AND THE REASON IS MEASURED — not an exemption of convenience.
    // `packages/fachverfahren-kit/tsconfig.json` is `strict: true` with `allowJs` off (repo policy,
    // enforced by scripts/check-typescript-policy.mjs) and it EMITS declarations to dist-types. Importing
    // this `.mjs` from there produces `TS7016: Could not find a declaration file for module
    // '../../../scripts/lib/source-exclusion.mjs'` — verified 2026-09-01 by running
    // `tsc --noEmit -p packages/fachverfahren-kit/tsconfig.json` with the import in place.
    // The remedy is a decision this cut does not get to make on its own: either the shared truth moves
    // into a real workspace package, or a hand-written `.d.mts` is added (a second declaration surface,
    // i.e. the same drift class one level down). Until then this ONE list stays hand-written, and it
    // stays NAMED here so it cannot be forgotten or quietly joined by a second.
    "packages/fachverfahren-kit/src/lauf-lebenszyklus-grenze.test.ts",
  ]);

  const trackedText = () =>
    execFileSync(
      "git",
      ["ls-files", "-z", "*.ts", "*.tsx", "*.mjs", "*.mts", "*.js"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    )
      .split("\0")
      .filter(Boolean);

  it("POSITIVE CONTROL — the detector actually fires on the shape it hunts", () => {
    // A ratchet whose detector matches nothing counts zero forever and ratchets nothing.
    expect(
      HANDWRITTEN.test(
        'const ignored = new Set([".git", "node_modules", "dist"]);',
      ),
    ).toBe(true);
    expect(HANDWRITTEN.test('const roots = ["apps", "packages"];')).toBe(false);
  });

  it("finds the tracked files at all (the scan is not empty)", () => {
    expect(trackedText().length).toBeGreaterThan(200);
  });

  it("no hand-written exclusion list outside the one source — the number may only FALL", () => {
    const offenders = trackedText().filter((rel) => {
      if (ALLOWED.has(rel)) return false;
      return HANDWRITTEN.test(readFileSync(join(repoRoot, rel), "utf8"));
    });
    // 2026-09-01: TEN such lists existed (this ratchet found three the manual audit had missed:
    // scripts/scaffold-standalone-app.mjs, tooling/template/lib/render.contract.test.ts and the one
    // allowlisted above). Nine are gone. Raising this number re-introduces the defect; the remedy for
    // "I need more" is `new Set([...BUILT_IN_EXCLUSIONS, "only-here"])`, never a fresh list.
    expect(offenders).toEqual([]);
  });
});
