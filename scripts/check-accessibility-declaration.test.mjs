import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkAccessibilityDeclaration } from "./check-accessibility-declaration.mjs";

const roots = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture({ generated = true, source } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "accessibility-release-"));
  roots.push(root);
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: generated
        ? "generated-fachverfahren"
        : "senticor-app-fachverfahren-template",
    }),
  );
  if (generated) {
    await mkdir(path.join(root, ".template"));
    await writeFile(path.join(root, ".template", "lock.json"), "{}");
  }
  if (source !== undefined) {
    const target = path.join(root, "apps", "fachverfahren", "src");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "barrierefreiheit.config.ts"), source);
  }
  return root;
}

const provisional = `
export const barrierefreiheitConfig = {
  provisional: true,
  feedbackEmail: "barrierefreiheit@example.org",
  schlichtungsstelle: {
    name: "Zuständige Schlichtungsstelle — im Deployment zu ersetzen",
    url: "https://example.org/schlichtungsstelle",
  },
};
`;

describe("PUB-LEGAL-001", () => {
  it("allows the visible sample in the canonical template checkout", async () => {
    const root = await fixture({ generated: false, source: provisional });
    expect(checkAccessibilityDeclaration({ root, env: {} })).toEqual({
      checked: false,
      reason: "canonical-template",
    });
  });

  it("fails a generated consumer with provisional or known placeholder values", async () => {
    const root = await fixture({ source: provisional });
    expect(() => checkAccessibilityDeclaration({ root, env: {} })).toThrow(
      /provisional|example\.org|platzhalter/i,
    );
  });

  it("accepts the explicit override only together with demo mode", async () => {
    const root = await fixture({ source: provisional });
    expect(() =>
      checkAccessibilityDeclaration({
        root,
        env: { ALLOW_PROVISIONAL_ACCESSIBILITY_DECLARATION: "1" },
      }),
    ).toThrow(/demo/i);
    expect(
      checkAccessibilityDeclaration({
        root,
        env: {
          ALLOW_PROVISIONAL_ACCESSIBILITY_DECLARATION: "1",
          DEMO_MODE: "true",
        },
      }),
    ).toEqual({ checked: false, reason: "documented-demo-override" });
    await expect(
      readFile(
        path.join(
          root,
          "apps",
          "fachverfahren",
          "src",
          "barrierefreiheit.config.ts",
        ),
        "utf8",
      ),
    ).resolves.toContain("provisional: true");
  });

  it("passes an approved consumer declaration and ignores legacy consumers without config", async () => {
    const approvedRoot = await fixture({
      source: `export const barrierefreiheitConfig = {
        provisional: false,
        feedbackEmail: "barrierefreiheit@stadt.test",
        schlichtungsstelle: { name: "Schlichtungsstelle BGG", url: "https://stadt.test/schlichtung" },
      };`,
    });
    const legacyRoot = await fixture();
    expect(
      checkAccessibilityDeclaration({ root: approvedRoot, env: {} }),
    ).toEqual({
      checked: true,
      reason: "approved",
    });
    expect(
      checkAccessibilityDeclaration({ root: legacyRoot, env: {} }),
    ).toEqual({
      checked: false,
      reason: "legacy-no-config",
    });
  });
});
