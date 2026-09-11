#!/usr/bin/env node
// run-checks — run the pre-commit chain CONCURRENTLY and report every failure, not just the first.
//
// ══ WHY THIS EXISTS (measured 2026-08-31 on this repo) ═════════════════════════════════════════════
//
// `precommit:check` is 23 entries joined by `&&`. Serial wall clock: 37.0 s. It runs on every commit
// in this repo AND in every generated Fachverfahren, so it is the single largest fixed cost of a build.
//
//     18 validators   5.2 s total, avg 306 ms — of which ~180 ms is bare `node` startup, i.e. ~60 %
//                     of that lane is process spawn, not work. Seven of them pay it TWICE because
//                     they go through `pnpm run template -- <cmd>`.
//     format:check    4.1 s   ·   lint 3.7 s   ·   typecheck 5.0 s   ·   test 11.0 s
//
// The entries are independent validators. Running them concurrently turns 37.0 s into roughly the
// length of the serial lane (typecheck -> test), i.e. ~16 s. That factor is the whole point.
//
// ⛔ WHAT THIS IS NOT: a second list of checks. `package.json.scripts["precommit:check"]` stays the
// ONE truth about WHAT runs. This runner parses that chain; adding a check there is enough. The only
// thing declared separately is which entries may NOT overlap (tooling/check/lanes.json), and that
// file carries the measured reason for each.
//
// ⛔ AND IT DOES NOT STOP AT THE FIRST FAILURE. `&&` hides every failure after the first, which is why
// a red chain used to need several runs to diagnose. Here every entry runs, and the summary names all
// of them — plus it writes a machine-readable report so a build harness can consume the outcome
// instead of parsing prose.
//
// EXIT CODE: 0 only if every entry exited 0. Any failure, any unreadable declaration ⇒ non-zero.

import { spawn } from "node:child_process";
import { availableParallelism } from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const REPORT_PATH = path.join(repoRoot, "reports", "checks.json");

/** The chain is the one truth about WHAT runs. `pnpm run X && pnpm run Y` -> ["X", "Y"]. */
function chainEntries(chainName) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const chain = pkg.scripts?.[chainName];
  if (typeof chain !== "string" || !chain.trim()) {
    throw new Error(
      `package.json has no script "${chainName}" — nothing to run. Fix the name or the chain.`,
    );
  }
  const ids = [];
  for (const part of chain.split("&&")) {
    const m = /^\s*pnpm\s+run\s+([A-Za-z0-9:_-]+)\s*$/.exec(part);
    // FAIL-CLOSED: an entry this parser does not understand is NOT silently dropped. Silently running
    // 22 of 23 checks and reporting green is exactly the failure mode this runner exists to remove.
    if (!m)
      throw new Error(
        `chain "${chainName}" contains an entry this runner cannot parse: «${part.trim()}». Add it as a plain \`pnpm run <id>\` or extend the parser deliberately.`,
      );
    ids.push(m[1]);
  }
  return ids;
}

function lanes() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(here, "lanes.json"), "utf8"),
  );
  const serial = Array.isArray(raw.serial) ? raw.serial : [];
  const mustFollow = new Map(); // id -> Set of ids that must finish first
  for (const rule of serial) {
    for (const after of rule.before ?? []) {
      if (!mustFollow.has(after)) mustFollow.set(after, new Set());
      mustFollow.get(after).add(rule.id);
    }
  }
  return mustFollow;
}

function runOne(id) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("pnpm", ["run", id], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      out += d;
    });
    child.on("error", (e) =>
      resolve({
        id,
        ok: false,
        code: null,
        ms: Date.now() - started,
        output: String(e?.message ?? e),
      }),
    );
    child.on("close", (code) =>
      resolve({
        id,
        ok: code === 0,
        code,
        ms: Date.now() - started,
        output: out,
      }),
    );
  });
}

async function main() {
  const chainName = process.argv[2] ?? "precommit:check";
  const ids = chainEntries(chainName);
  const mustFollow = lanes();
  const limit = Math.max(1, availableParallelism() - 1);

  const done = new Map();
  const pending = new Set(ids);
  const running = new Map();
  const started = Date.now();

  const ready = () =>
    [...pending].filter((id) =>
      [...(mustFollow.get(id) ?? [])].every(
        (dep) => done.has(dep) || !ids.includes(dep),
      ),
    );

  process.stdout.write(
    `▸ ${chainName}: ${ids.length} entries, up to ${limit} at a time\n`,
  );

  while (pending.size || running.size) {
    for (const id of ready()) {
      if (running.size >= limit) break;
      pending.delete(id);
      running.set(
        id,
        runOne(id).then((r) => {
          running.delete(id);
          done.set(id, r);
          return r;
        }),
      );
    }
    if (!running.size && pending.size) {
      // A cycle in the declaration would otherwise spin here forever — say so instead.
      throw new Error(
        `lanes.json declares a dependency cycle or an unreachable entry: ${[...pending].join(", ")}`,
      );
    }
    const r = await Promise.race(running.values());
    process.stdout.write(
      `  ${r.ok ? "✓" : "✗"} ${r.id} (${(r.ms / 1000).toFixed(1)} s)\n`,
    );
  }

  const results = ids.map((id) => done.get(id)).filter(Boolean);
  const failed = results.filter((r) => !r.ok);
  const wall = Date.now() - started;
  const serialSum = results.reduce((s, r) => s + r.ms, 0);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(
    REPORT_PATH,
    `${JSON.stringify(
      {
        chain: chainName,
        ok: failed.length === 0,
        wallMs: wall,
        serialMs: serialSum,
        concurrency: limit,
        entries: results.map((r) => ({
          id: r.id,
          ok: r.ok,
          code: r.code,
          ms: r.ms,
        })),
        failures: failed.map((r) => ({
          id: r.id,
          code: r.code,
          output: r.output.slice(-4000),
        })),
      },
      null,
      2,
    )}\n`,
  );

  process.stdout.write(
    `\n  wall ${(wall / 1000).toFixed(1)} s · serial would be ${(serialSum / 1000).toFixed(1)} s · report ${path.relative(repoRoot, REPORT_PATH)}\n`,
  );
  if (failed.length) {
    // EVERY failure, never only the first — the output of each is right here, not one run away.
    process.stdout.write(`\n✗ ${failed.length} of ${results.length} failed:\n`);
    for (const f of failed) {
      process.stdout.write(
        `\n─── ${f.id} (exit ${f.code}) ───\n${f.output.trimEnd().split("\n").slice(-25).join("\n")}\n`,
      );
    }
    process.exit(1);
  }
  process.stdout.write(`✓ all ${results.length} green\n`);
}

main().catch((e) => {
  process.stderr.write(`✗ ${e?.message ?? e}\n`);
  process.exit(1);
});
