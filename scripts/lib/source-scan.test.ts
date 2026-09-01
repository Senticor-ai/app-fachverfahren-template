// Witness for scripts/lib/source-scan.mjs — «a tree that cannot be read is a FAILURE, not an empty report».
//
// ⚠️ REAL PERMISSIONS, NOT A STUB. Every red case below makes a real directory or file unreadable with
// chmod and then asks the scanner. A test that only inspects what a fake `readdir` returned proves the fake
// was called; it cannot prove that an unreadable tree reaches the caller as a failure.
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  TreeScanError,
  collectSourceFiles,
  loadSourceExclusions,
  readDirectoryEntries,
  readTextFile,
} from "./source-scan.mjs";
import { BUILT_IN_EXCLUSIONS } from "./source-exclusion.mjs";

const locked: string[] = [];
let root: string | undefined;

afterEach(async () => {
  for (const path of locked.splice(0))
    await chmod(path, 0o755).catch(() => undefined);
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function lock(path: string) {
  locked.push(path);
  await chmod(path, 0o000);
}

describe("readDirectoryEntries", () => {
  it("POSITIVE CONTROL — a readable directory yields its entries", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    await writeFile(join(root, "a.ts"), "");
    const entries = await readDirectoryEntries(root);
    expect(entries.map((e) => e.name)).toEqual(["a.ts"]);
  });

  it("EACCES throws — even when the caller declared the directory optional", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const dir = join(root, "sealed");
    await mkdir(dir);
    await lock(dir);
    await expect(readDirectoryEntries(dir)).rejects.toBeInstanceOf(
      TreeScanError,
    );
    // `optional` forgives ENOENT and NOTHING else — otherwise it would be a loophole big enough to
    // reintroduce the whole defect class.
    await expect(
      readDirectoryEntries(dir, { optional: true }),
    ).rejects.toMatchObject({
      code: "EACCES",
    });
  });

  it("ENOENT throws unless the caller declared the directory optional", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const missing = join(root, "not-here");
    await expect(readDirectoryEntries(missing)).rejects.toBeInstanceOf(
      TreeScanError,
    );
    await expect(
      readDirectoryEntries(missing, { optional: true }),
    ).resolves.toEqual([]);
  });

  it("names the path and the errno, so the halt carries a REMEDY", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const dir = join(root, "sealed");
    await mkdir(dir);
    await lock(dir);
    await expect(readDirectoryEntries(dir)).rejects.toThrow(/sealed.*EACCES/s);
  });
});

describe("readTextFile — the empty string is CONTENT, never a failure", () => {
  it("POSITIVE CONTROL — reads a genuinely empty file as an empty string", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const file = join(root, "empty.ts");
    await writeFile(file, "");
    await expect(readTextFile(file)).resolves.toBe("");
  });

  it("an unreadable file throws instead of returning that same empty string", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const file = join(root, "sealed.ts");
    await writeFile(file, "secret");
    await lock(file);
    await expect(readTextFile(file)).rejects.toMatchObject({
      name: "TreeScanError",
      code: "EACCES",
    });
  });
});

describe("loadSourceExclusions", () => {
  it("a MISSING .gitignore is an answer — the built-in floor comes back, never the empty set", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const set = await loadSourceExclusions(root);
    expect([...set].sort()).toEqual([...BUILT_IN_EXCLUSIONS].sort());
    expect(set.size).toBeGreaterThan(0);
  });

  it("an UNREADABLE .gitignore is a failure", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    const file = join(root, ".gitignore");
    await writeFile(file, "dist/\n");
    await lock(file);
    await expect(loadSourceExclusions(root)).rejects.toBeInstanceOf(
      TreeScanError,
    );
  });

  it("unions the tree's own .gitignore onto the floor", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    await writeFile(join(root, ".gitignore"), "generated-here/\n");
    const set = await loadSourceExclusions(root);
    expect(set.has("generated-here")).toBe(true);
    expect(set.has("node_modules")).toBe(true);
  });
});

describe("collectSourceFiles", () => {
  it("POSITIVE CONTROL — collects real sources and skips git-ignored build output", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    await writeFile(join(root, ".gitignore"), "dist-types/\n");
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "dist-types"), { recursive: true });
    await mkdir(join(root, "node_modules", "dep"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "");
    await writeFile(join(root, "src", "b.md"), "");
    await writeFile(join(root, "dist-types", "a.d.ts"), "");
    await writeFile(join(root, "node_modules", "dep", "c.ts"), "");
    const files = await collectSourceFiles(root, { extensions: [".ts"] });
    expect(files).toEqual([join(root, "src", "a.ts")]);
  });

  it("an unreadable subdirectory throws — it does NOT shorten the result silently", async () => {
    root = await mkdtemp(join(tmpdir(), "scan-"));
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "a.ts"), "");
    const dir = join(root, "sealed");
    await mkdir(dir);
    await lock(dir);
    await expect(
      collectSourceFiles(root, { extensions: [".ts"] }),
    ).rejects.toBeInstanceOf(TreeScanError);
  });
});
