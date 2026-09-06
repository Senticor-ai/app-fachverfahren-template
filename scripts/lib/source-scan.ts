// source-scan — A TREE THAT CANNOT BE READ IS A FAILURE, NOT AN EMPTY REPORT.
//
// ══ THE MEASUREMENT (2026-09-01, this repo) ══════════════════════════════════════════════════════════
//
// Nine tree walks in the gate/tooling half of this repo turned an IO failure into an empty value:
//
//     tooling/template/cli.ts:1866                readdir(root).catch(() => [])     collectFiles
//     tooling/template/cli.ts:1848                readFile(f).catch(() => "")       snapshotDirectory
//     tooling/template/lib/agent-platform.ts:2000 readdir(root).catch(() => [])     collectFiles
//     tooling/template/lib/agent-platform.ts:1438 readdir(apps).catch(() => [])     collectDeclaredSeam
//     tooling/template/lib/agent-platform.ts:1387 readFile(f).catch(() => "")       leakage gate
//     tooling/template/lib/render.ts:437          readdir(root).catch(() => [])     collectFiles
//     scripts/check-motion-tokens.mjs             `directoryExists()` = catch -> false -> return []
//     scripts/check-css-token-aliases.mjs         (same construction)
//     scripts/check-typescript-policy.mjs         (same construction)
//     scripts/check-esm-policy.mjs                (same construction)
//
// The last four are the same defect wearing a friendlier name: `directoryExists` catches EVERY error and
// answers "no". An unreadable `apps/` is then indistinguishable from an absent one, and the gate reports
// zero files.
//
// ⛔ WHY THIS IS WORSE IN A GATE THAN IN A UI. `validateModuleBoundaries` and its siblings iterate the
// collected files and push failures. Over an empty list they push nothing — and a gate with no failures
// is GREEN. So the exact moment the scanner loses its eyesight is the moment it starts approving
// everything. `snapshotDirectory` is the same shape with a sharper edge: with `catch(() => "")` on both
// sides of a comparison, two unreadable files compare EQUAL, and `check:scaffold-reproducible` certifies
// byte-identity out of two failures.
//
// The doctrine already exists in this kit, one layer up, written for the citizen-facing half:
// apps/fachverfahren/src/app/ladelage.ts — «"not asked yet" and "asked, got nothing" and "asked, could
// not find out" are three states with three remedies». This module is that same distinction for scanners.
//
// ══ THE NARROW PART — WHAT STILL RETURNS EMPTY, AND WHY THAT IS NOT A LOOPHOLE ═══════════════════════
//
// Fail-closed has a cost of its own: a gate that goes red on any `EACCES` anywhere is a FALSE RED, and a
// false red gets switched off. So exactly ONE errno keeps the empty answer, and only where the caller
// declares the directory optional:
//
//     ENOENT + { optional: true }   ->  []      "there is genuinely no apps/ in this tree"
//     ENOENT without that           ->  THROW   a root the caller named must exist
//     EVERY other errno             ->  THROW   EACCES, ELOOP, ENOTDIR, EMFILE, EIO …
//
// ENOENT is the one error that is an ANSWER rather than a failure to look: the directory entry does not
// exist, and that is a fact the filesystem is certain about. Everything else means «I could not find out».
//
// ⚠️ MEASURED BLAST RADIUS in normal operation: `pnpm run check:fast` runs the validators concurrently
// while `typecheck` writes `dist/`/`*.tsbuildinfo` and vitest writes `coverage/` and `reports/`. All of
// those are in `.gitignore`, so {@link loadSourceExclusions} rejects them by name before any walk
// descends — the concurrent-write race that could produce a mid-scan ENOENT is excluded by construction,
// not by a catch. Sub-directories are therefore NOT optional: an ENOENT below a directory that readdir
// just listed means the tree moved under a gate, and a gate that read a moving tree must say so.
import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BUILT_IN_EXCLUSIONS,
  isNotSource,
  sourceExclusions,
} from "./source-exclusion.ts";

/** A tree walk that could not see. Carries the path and the errno so the halt names a REMEDY, not just a
 *  symptom — «EACCES on apps/x» is actionable, «0 files» is not. */
export class TreeScanError extends Error {
  readonly path: string;
  readonly code: string | undefined;
  constructor(path: string, cause: NodeJS.ErrnoException) {
    super(
      `cannot read ${path}: ${cause.code ?? cause.name} — a tree that cannot be read is a FAILURE, not an empty result. Fix the permissions or the path; do not silence this.`,
    );
    this.name = "TreeScanError";
    this.path = path;
    this.code = cause.code;
    this.cause = cause;
  }
}

/**
 * Directory entries, or a failure. Never a silently empty list.
 *
 * @param {string} directory
 * @param {{ optional?: boolean }} [options] `optional: true` means «this directory need not exist» — and
 *   ONLY ENOENT is forgiven by it. Anything else still throws.
 * @returns {Promise<import("node:fs").Dirent[]>}
 */
export async function readDirectoryEntries(
  directory: string,
  options: { optional?: boolean } = {},
): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      options.optional &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return [];
    }
    throw new TreeScanError(directory, error as NodeJS.ErrnoException);
  }
}

/**
 * File text, or a failure. Deliberately without a `catch`: the empty string is a legitimate FILE CONTENT
 * and must never double as "I could not read it".
 *
 * @param {string} file
 * @returns {Promise<string>}
 */
export async function readTextFile(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    throw new TreeScanError(file, error as NodeJS.ErrnoException);
  }
}

/**
 * The exclusion set for one tree, read from ITS `.gitignore`.
 *
 * A missing `.gitignore` is an ANSWER (built-in floor). An unreadable one is a FAILURE — because the
 * difference between the two is the difference between a gate that skips 232 generated `.d.ts` and a gate
 * that reads them as source.
 *
 * @param {string} root
 * @returns {Promise<Set<string>>}
 */
export async function loadSourceExclusions(root: string): Promise<Set<string>> {
  try {
    return sourceExclusions(await readFile(join(root, ".gitignore"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Set(BUILT_IN_EXCLUSIONS);
    }
    throw new TreeScanError(
      join(root, ".gitignore"),
      error as NodeJS.ErrnoException,
    );
  }
}

/**
 * Every source file below `root`, sorted, with build output rejected by {@link isNotSource}.
 *
 * @param {string} root
 * @param {{
 *   extensions?: readonly string[],
 *   exclusions?: ReadonlySet<string>,
 *   optional?: boolean,
 *   accept?: (path: string) => boolean,
 * }} [options] `extensions` are matched against the file's suffix; an empty/absent list takes every file.
 *   `optional` applies to `root` ONLY (see the header) — never to the directories found inside it.
 * @returns {Promise<string[]>}
 */
export async function collectSourceFiles(
  root: string,
  options: {
    extensions?: readonly string[];
    exclusions?: ReadonlySet<string>;
    optional?: boolean;
    accept?: (path: string) => boolean;
  } = {},
): Promise<string[]> {
  const exclusions = options.exclusions ?? (await loadSourceExclusions(root));
  const extensions = options.extensions ?? [];
  const accept = options.accept;
  const files: string[] = [];

  const walk = async (directory: string, optional: boolean): Promise<void> => {
    for (const entry of await readDirectoryEntries(directory, { optional })) {
      if (isNotSource(entry.name, exclusions)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path, false);
        continue;
      }
      if (
        extensions.length > 0 &&
        !extensions.some((e) => entry.name.endsWith(e))
      )
        continue;
      if (accept && !accept(path)) continue;
      files.push(path);
    }
  };

  await walk(root, options.optional === true);
  return files.sort();
}
