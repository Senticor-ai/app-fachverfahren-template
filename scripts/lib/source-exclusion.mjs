// source-exclusion — THE ONE TRUTH "what is not a source, but build output?"
//
// ══ THE MEASUREMENT THAT FORCED THIS MODULE (2026-09-01, this repo) ═══════════════════════════════════
//
// The same question — «is this directory a source?» — was answered SEVEN times, by hand, and the seven
// answers had drifted apart:
//
//     scripts/check-motion-tokens.mjs:20       9 names   ← .git .turbo .vite coverage dist dist-server
//     scripts/check-css-token-aliases.mjs:7    9 names      dist-types node_modules storybook-static
//     scripts/check-typescript-policy.mjs:6    9 names
//     scripts/check-esm-policy.mjs:5           7 names   ⛔ no dist-types, no storybook-static
//     tooling/template/cli.ts:1871             4 names   ⛔ no dist-server, dist-types, coverage
//     tooling/template/lib/agent-platform.ts:2005  5 names  ⛔ no dist-server, dist-types, coverage
//     tooling/template/lib/render.ts:34       17 names   ← its own, wider truth (scaffold copy list)
//     ──────────────────────────────────────────────────────────────────────────────────────────────
//     UNION 20                                  INTERSECTION 4
//
// ⭐ AND THE DRIFT WAS NOT COSMETIC. `validateModuleBoundaries`
// (tooling/template/lib/agent-platform.ts:469, part of `agent:preflight`) collects every `.ts`/`.tsx`
// from the repo root through the 5-name list — and `extname("index.d.ts") === ".ts"`. Measured on this
// tree: **232 generated `.d.ts` files, 1.4 MB, under packages/fachverfahren-kit/dist-types**, all of them
// read and pattern-matched AS SOURCE by a boundary gate. They are in `.gitignore`. git has known they are
// output since the day someone wrote the line.
//
// ⭐ SO THE RULE IS NOT A LONGER LIST. A list only ever knows the names somebody typed into it — that is
// exactly how `dist-types` got into four lists and not the other three. The class is:
//
//     ⭐ WHAT GIT IGNORES IS NOT A SOURCE.
//
// The generated Fachverfahren already maintains that answer in its own `.gitignore`, because the scaffold
// writes it there. Reading it beats guessing it a second time — and it keeps working for the next output
// directory nobody has invented yet.
//
// ══ WHAT THIS MODULE DELIBERATELY IS NOT ═════════════════════════════════════════════════════════════
//
// Not a `.gitignore` interpreter. It derives ONLY the plain DIRECTORY NAMES a tree walk can reject by
// basename. The boundary is drawn tight, and it is drawn in one direction: **over-exclusion is the more
// expensive mistake.**
//
//   · Excluding too LITTLE costs noise. It is measurable (the numbers above) and everybody notices.
//   · Excluding too MUCH silently deletes real sources from a gate's input — and a gate that runs over an
//     empty set is GREEN. That is this house's leading defect class in its most expensive form.
//
// So every doubtful pattern falls back to KEEPING, each rejected with the damage its admission would do,
// measured against this repo's actual `.gitignore`:
//
//   NEGATION   `!foo`          `!` TAKES BACK. Read as an exclusion, the one pattern whose whole purpose
//                              is "keep this" becomes a delete order — exactly inverted.
//   GLOB       `*.tsbuildinfo` `*`/`?`/`[` are not directory names. Harmless today; a future `*` or `**`
//                              would match EVERYTHING.
//   MULTI-PART `apps/x/dist`   A path has a PLACE. Shortened to its basename it would drop that name at
//   / ANCHORED `/modules/x/`   every depth, including the copy git deliberately keeps.
//
// ⚠️ WHY A FILE NAME IN THE SET IS STILL HARMLESS: this repo's `.gitignore` contributes `.env`,
// `governance.yaml`, `.deployed-sha`, `.DS_Store`. They are git-ignored PATHS; rejecting them by name is
// git-conformant whether they turn up as a file or as a directory. No caller has to filter them out.
//
// ══ PURE ON PURPOSE ══════════════════════════════════════════════════════════════════════════════════
//
// No IO here. The caller reads the file and hands in the TEXT (scripts/lib/source-scan.mjs does that, and
// its failure behaviour is fail-CLOSED). That keeps the witness testable at the seam without putting a
// tree on disk, and it makes "the file is missing or unreadable" a property of the SIGNATURE
// (`null`/`undefined` allowed, built-in set returned) rather than a `catch` hidden in some caller.

/** THE BUILT-IN FLOOR — it holds even with no `.gitignore` at all.
 *
 *  ⛔ IT IS THE FLOOR, NOT THE TRUTH. Adding a name here because some new generator writes some new output
 *  misses the lesson of this module: the name belongs in the `.gitignore` of the repo that produces it,
 *  where git enforces it anyway. What stands here is only what applies when there is no `.gitignore`, or
 *  when it cannot be read.
 *
 *  ⭐ THE SHAPE AGAINST DRIFT IS NOT "A LONGER LIST" BUT **ONE PLACE**: a caller needing more hangs its
 *  own extra onto this floor (`new Set([...BUILT_IN_EXCLUSIONS, "only-here"])`) instead of rewriting the
 *  set. That is what tooling/template/lib/render.ts does with its scaffold-only names. */
export const BUILT_IN_EXCLUSIONS = Object.freeze(
  new Set([
    // Foreign code and tool caches
    "node_modules",
    ".git",
    ".pnpm",
    ".pnpm-tools",
    ".pnpm-store",
    ".turbo",
    ".vite",
    ".cache",
    // Compiler and bundler output (plus the `dist` PREFIX below, which covers dist-server/dist-types)
    "build",
    "out",
    ".next",
    ".output",
    "storybook-static",
    // Output of checking tools
    "coverage",
    "playwright-report",
    "test-results",
    // This house's own spoil heaps
    ".chos",
    ".opencode",
    ".agent",
  ]),
);

/** BUILD OUTPUT IS RECOGNISED BY ITS PREFIX, NOT BY A LIST OF NAMES.
 *
 *  This repo's `.gitignore` names `dist/`, `dist-server/` and `dist-types/` — so the derivation below
 *  already covers today. The prefix covers the sibling nobody has created yet (`dist-esm`, `dist-cjs`),
 *  and it covers a generated app whose `.gitignore` has drifted from the template's. */
export const OUTPUT_PREFIXES = Object.freeze(["dist"]);

/** Characters whose presence makes a pattern a GLOB. A glob is not a directory name. */
const GLOB_CHARACTERS = /[*?[\]]/;

/**
 * The plain directory names derivable from a `.gitignore` text — the deliberately incomplete derivation.
 *
 * What gets through and what does not is argued, with its damage case, at the head of this file. The order
 * of the tests is deliberate: NEGATION FIRST, so that a `!foo/` can never slip in through the
 * "directory with a trailing slash" branch.
 *
 * @param {string | null | undefined} text raw `.gitignore` content. Empty/missing is allowed and yields an
 *   empty set — never an error, because "there is no .gitignore" is a real and ordinary answer.
 * @returns {Set<string>}
 */
export function directoryNamesFromGitignore(text) {
  const names = new Set();
  if (!text) return names;
  for (const raw of text.split("\n")) {
    // Trailing whitespace is meaningless in `.gitignore` (unless escaped); this drops CR too.
    const line = raw.replace(/\s+$/u, "");
    if (!line) continue;
    if (line.startsWith("#")) continue; // comment
    if (line.startsWith("!")) continue; // NEGATION — read as exclusion it would invert exactly
    // `foo/**` means "everything below foo"; the directory itself is unambiguously `foo`.
    let name = line.endsWith("/**") ? line.slice(0, -3) : line;
    if (name.endsWith("/")) name = name.slice(0, -1); // `foo/` -> `foo`
    if (!name) continue; // bare `/` or `/**` — would hit the ROOT
    if (GLOB_CHARACTERS.test(name)) continue; // glob
    if (name.includes("/")) continue; // multi-part OR anchored (`/foo`) — it has a PLACE
    if (name === "." || name === "..") continue;
    names.add(name);
  }
  return names;
}

/**
 * The exclusion set for one tree — the built-in floor UNIONED with what git ignores there.
 *
 * ⛔ A FAILURE MUST NEVER BECOME AN EMPTY VALUE. If the `.gitignore` is missing or unreadable the caller
 * hands in `null` and gets the BUILT-IN set back, not the empty one. A union can never weaken: the result
 * is always a superset of {@link BUILT_IN_EXCLUSIONS}, and the witness pins exactly that.
 *
 * @param {string | null | undefined} gitignoreText
 * @returns {Set<string>}
 */
export function sourceExclusions(gitignoreText) {
  const set = new Set(BUILT_IN_EXCLUSIONS);
  for (const name of directoryNamesFromGitignore(gitignoreText)) set.add(name);
  return set;
}

/**
 * Is this entry NOT a source? — the ONE question every tree walk in this repo asks.
 *
 * The prefix branch carries the `dist` FAMILY (`dist-server`, `dist-types`, `dist-esm` …); the set carries
 * everything that is named. Kept apart because only the first means a family and the second means names.
 *
 * @param {string} name a single path segment (basename), never a path
 * @param {ReadonlySet<string>} [exclusions]
 * @returns {boolean}
 */
export function isNotSource(name, exclusions = BUILT_IN_EXCLUSIONS) {
  return (
    exclusions.has(name) ||
    OUTPUT_PREFIXES.some(
      (prefix) => name === prefix || name.startsWith(prefix + "-"),
    )
  );
}
