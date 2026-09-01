// THE DECISIVE WITNESS FOR THE «SCANNER THAT CANNOT SEE» CLASS.
//
// A gate collects files, iterates them, and pushes failures. Over an EMPTY list it pushes nothing — and a
// gate with no failures is GREEN. So the exact moment a scanner loses its eyesight is the moment it starts
// approving everything. Before the cut of 2026-09-01, `validateModuleBoundaries` walked the tree through
// `readdir(root, …).catch(() => [])`: a directory it could not read became «no files here», and a real
// boundary violation hidden inside it was reported as compliant.
//
// ⚠️ THIS FIXTURE USES REAL PERMISSIONS ON A REAL DIRECTORY (chmod 000), not a stubbed return value. A test
// that only checks what a fake `readdir` returns proves that the fake was called; it cannot prove that an
// unreadable tree reaches the gate as a failure. That distinction is the whole point of this file.
//
// ⚠️ AND EVERY RED ASSERTION HERE IS PAIRED WITH A POSITIVE CONTROL that the same tree, readable, produces
// the EXACT violation planted in it. Without that pairing "the gate found nothing" and "the gate found
// nothing because it looked at nothing" are indistinguishable — which is the very defect under test.
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateModuleBoundaries } from "./agent-platform.ts";

let root: string | undefined;
let locked: string | undefined;

afterEach(async () => {
  // Restore before removing — a 000 directory cannot be recursed into by rm either.
  if (locked) await chmod(locked, 0o755).catch(() => undefined);
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
  locked = undefined;
});

/** A minimal tree with ONE planted boundary violation: a file under `packages/` that imports domain
 *  module code. The gate must report exactly that one, and nothing else. */
async function buildTree() {
  const dir = await mkdtemp(join(tmpdir(), "boundaries-"));
  await writeFile(
    join(dir, ".gitignore"),
    "node_modules/\ndist/\ndist-types/\n",
  );
  await mkdir(join(dir, "packages", "shared", "src"), { recursive: true });
  await writeFile(
    join(dir, "packages", "shared", "src", "leak.ts"),
    'import { x } from "../../../modules/hundesteuer/domain.ts";\nexport const y = x;\n',
  );
  await mkdir(join(dir, "modules", "hundesteuer"), { recursive: true });
  await writeFile(
    join(dir, "modules", "hundesteuer", "domain.ts"),
    "export const x = 1;\n",
  );
  return dir;
}

describe("validateModuleBoundaries fails closed on an unreadable tree", () => {
  it("POSITIVE CONTROL — the readable tree reports exactly the planted violation", async () => {
    root = await buildTree();
    const failures = await validateModuleBoundaries(root);
    // Not `toHaveLength(0)` and not `every(...)`: an assertion that passes over an empty set is the
    // tautology this whole file exists to rule out. The gate must NAME the file it found.
    expect(failures).toEqual([
      "packages/shared/src/leak.ts imports domain module code",
    ]);
  });

  it("an unreadable subdirectory makes the gate RED, not empty-and-green", async () => {
    root = await buildTree();
    locked = join(root, "packages", "sealed");
    await mkdir(locked, { recursive: true });
    await writeFile(
      join(locked, "hidden.ts"),
      'import "../../modules/x/y.ts";\n',
    );
    await chmod(locked, 0o000);

    await expect(validateModuleBoundaries(root)).rejects.toThrow(
      /cannot read .*sealed/,
    );
    await expect(validateModuleBoundaries(root)).rejects.toMatchObject({
      name: "TreeScanError",
      code: "EACCES",
    });
  });

  it("an unreadable ROOT makes the gate RED", async () => {
    root = await mkdtemp(join(tmpdir(), "boundaries-root-"));
    locked = root;
    await chmod(root, 0o000);
    await expect(validateModuleBoundaries(root)).rejects.toThrow(/cannot read/);
  });

  it("a MISSING optional directory is still an answer, not a failure", async () => {
    // The narrow part of fail-closed: ENOENT on a directory the caller declared optional stays empty, so
    // a tree that genuinely has no `docs/examples` does not turn the whole chain red. Anything else does.
    root = await buildTree();
    await rm(join(root, "modules"), { recursive: true, force: true });
    await expect(validateModuleBoundaries(root)).resolves.toEqual([
      "packages/shared/src/leak.ts imports domain module code",
    ]);
  });

  it("generated declaration output is not read as source", async () => {
    // `extname("index.d.ts") === ".ts"`. Measured on this repo before the cut: 232 generated `.d.ts`
    // (1.4 MB) under packages/fachverfahren-kit/dist-types went through this gate as source.
    root = await buildTree();
    await mkdir(join(root, "packages", "shared", "dist-types"), {
      recursive: true,
    });
    await writeFile(
      join(root, "packages", "shared", "dist-types", "index.d.ts"),
      'import type { A } from "../../../modules/hundesteuer/domain.ts";\nexport type B = A;\n',
    );
    const failures = await validateModuleBoundaries(root);
    expect(failures).toEqual([
      "packages/shared/src/leak.ts imports domain module code",
    ]);
    expect(failures.join("\n")).not.toContain("dist-types");
  });
});
