import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAnswers,
  createLock,
  defaultOwnership,
  explainOwnership,
  formatOwnershipYaml,
  loadSourceOwnershipDefaults,
  mergeOwnershipDefaults,
  parseOwnershipYaml,
  validateOwnership,
} from "./manifest.ts";

describe("template manifest metadata", () => {
  it("creates stable answers without timestamps or machine paths", () => {
    expect(
      createAnswers({
        domain: "fachverfahren",
        displayName: "Fachverfahren",
      }),
    ).toEqual({
      domain: "fachverfahren",
      displayName: "Fachverfahren",
      features: {
        postgres: true,
        mockAuth: true,
      },
    });
  });

  it("creates a reproducible lock with a migration ledger", () => {
    expect(
      createLock({
        templateSource: "opencode.de/example/next-app-template",
        templateVersion: "2.4.0",
        templateCommit: "abc123",
        generatorVersion: "2.4.0",
        appliedMigrations: ["2026-06-add-kaniko"],
      }),
    ).toEqual({
      schemaVersion: 1,
      templateSource: "opencode.de/example/next-app-template",
      templateVersion: "2.4.0",
      templateCommit: "abc123",
      generatorVersion: "2.4.0",
      appliedMigrations: ["2026-06-add-kaniko"],
    });
  });

  it("round-trips ownership rules and explains path ownership", () => {
    const parsed = parseOwnershipYaml(formatOwnershipYaml(defaultOwnership));
    expect(validateOwnership(parsed)).toEqual([]);
    expect(explainOwnership(parsed, ".gitlab-ci.yml")).toMatchObject({
      strategy: "replace",
    });
    expect(
      explainOwnership(parsed, "apps/fachverfahren/src/domain/example.ts"),
    ).toMatchObject({
      strategy: "consumer",
    });
  });

  it("merges new default ownership entries while preserving consumer overrides", () => {
    const persistedPaths = Object.fromEntries(
      Object.entries(defaultOwnership.paths).filter(
        ([path]) => path !== "ci.yml",
      ),
    );
    persistedPaths["README.md"] = "consumer";
    persistedPaths["modules/custom/**"] = "consumer";
    const persisted = { paths: persistedPaths };
    const persistedSnapshot = structuredClone(persisted);

    const { ownership, added } = mergeOwnershipDefaults(persisted);

    expect(added).toEqual([{ path: "ci.yml", strategy: "replace" }]);
    expect(ownership.paths["ci.yml"]).toBe("replace");
    expect(ownership.paths["README.md"]).toBe("consumer");
    expect(ownership.paths["modules/custom/**"]).toBe("consumer");
    expect(Object.keys(ownership.paths).at(-1)).toBe("ci.yml");
    expect(persisted).toEqual(persistedSnapshot);
  });

  it("is idempotent when defaults are already present", () => {
    const first = mergeOwnershipDefaults({ paths: {} });
    const second = mergeOwnershipDefaults(first.ownership);
    expect(second.added).toEqual([]);
    expect(second.ownership.paths).toEqual(first.ownership.paths);
  });

  it("adds all defaults for empty persisted ownership", () => {
    const { ownership, added } = mergeOwnershipDefaults({ paths: {} });
    expect(added).toHaveLength(Object.keys(defaultOwnership.paths).length);
    expect(ownership.paths).toEqual(defaultOwnership.paths);
  });

  it("skips new defaults covered by a broader persisted pattern", () => {
    // Codex-Finding PR #26: ein breites Konsumenten-Opt-out (docs/**: consumer) darf nicht durch
    // einen später ergänzten, SPEZIFISCHEREN Default (docs/reference/**: replace) ausgehebelt
    // werden — explainOwnership wählt sonst das längste Pattern und das Template überschriebe
    // Pfade, die der Konsument explizit ausgenommen hat.
    const persisted = { paths: { "docs/**": "consumer" as const } };
    const defaults = {
      paths: {
        "docs/reference/**": "replace" as const,
        "ci.yml": "replace" as const,
      },
    };

    const { ownership, added } = mergeOwnershipDefaults(persisted, defaults);

    expect(added).toEqual([{ path: "ci.yml", strategy: "replace" }]);
    expect(ownership.paths["docs/reference/**"]).toBeUndefined();
    expect(
      explainOwnership(ownership, "docs/reference/example.md"),
    ).toMatchObject({ strategy: "consumer" });
  });

  it("does not treat narrower globs as covering a broader default", () => {
    // Codex-Finding PR #26 (Runde 2): apps/*/server/* (eine Ebene) matcht den LITERALEN
    // Default-Key apps/*/server/** als Text, deckt aber verschachtelte Pfade nicht ab —
    // der breitere Default muss trotzdem ergänzt werden, sonst werden tiefe Dateien zu
    // falschen merge-Konflikten.
    const persisted = { paths: { "apps/*/server/*": "consumer" as const } };
    const defaults = { paths: { "apps/*/server/**": "replace" as const } };

    const { ownership, added } = mergeOwnershipDefaults(persisted, defaults);

    expect(added).toEqual([{ path: "apps/*/server/**", strategy: "replace" }]);
    expect(
      explainOwnership(ownership, "apps/foo/server/routes/index.ts"),
    ).toMatchObject({ strategy: "replace" });
  });

  it("keeps narrower consumer globs winning over broader added defaults", () => {
    // Codex-Finding PR #26 (Runde 3): der breitere Default wird zwar ergänzt (Runde 2),
    // darf aber für Pfade, die das ENGERE persistierte Konsumenten-Muster matcht, nicht
    // per Längen-Tie-Break gewinnen — "persistiert gewinnt" gilt pro Pfad.
    const persisted = { paths: { "apps/*/server/*": "consumer" as const } };
    const defaults = { paths: { "apps/*/server/**": "replace" as const } };

    const { ownership, added } = mergeOwnershipDefaults(persisted, defaults);

    expect(added).toEqual([{ path: "apps/*/server/**", strategy: "replace" }]);
    // Direkte Kinder: das engere Konsumenten-Muster behält Vorrang …
    expect(
      explainOwnership(ownership, "apps/foo/server/index.ts"),
    ).toMatchObject({ strategy: "consumer", pattern: "apps/*/server/*" });
    // … verschachtelte Pfade (die es nie abdeckte) verwaltet der neue Default.
    expect(
      explainOwnership(ownership, "apps/foo/server/routes/index.ts"),
    ).toMatchObject({ strategy: "replace" });
  });

  it("still adds broader defaults when only a more specific override exists", () => {
    const persisted = {
      paths: { "docs/reference/api.md": "consumer" as const },
    };
    const defaults = { paths: { "docs/reference/**": "replace" as const } };

    const { ownership, added } = mergeOwnershipDefaults(persisted, defaults);

    expect(added).toEqual([{ path: "docs/reference/**", strategy: "replace" }]);
    // Der spezifischere Konsumenten-Eintrag gewinnt weiterhin (längstes Pattern).
    expect(explainOwnership(ownership, "docs/reference/api.md")).toMatchObject({
      strategy: "consumer",
    });
    expect(
      explainOwnership(ownership, "docs/reference/other.md"),
    ).toMatchObject({ strategy: "replace" });
  });

  it("loads ownership defaults from the target template source", async () => {
    const root = await mkdtemp(join(tmpdir(), "manifest-source-defaults-"));
    try {
      const libDir = join(root, "tooling", "template", "lib");
      await mkdir(libDir, { recursive: true });
      // Simuliert eine NEUERE Template-Quelle, deren defaultOwnership einen Eintrag trägt,
      // den die laufende (ältere) CLI noch nicht kennt (Codex-Finding PR #26).
      await writeFile(
        join(libDir, "manifest.ts"),
        [
          "export const defaultOwnership = {",
          '  paths: { "EXTRA-SOURCE-ONLY.md": "replace" },',
          "};",
          "",
        ].join("\n"),
      );

      const defaults = await loadSourceOwnershipDefaults(root);
      expect(defaults.paths["EXTRA-SOURCE-ONLY.md"]).toBe("replace");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to the running CLI defaults when the source has no manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "manifest-source-missing-"));
    try {
      expect(await loadSourceOwnershipDefaults(root)).toBe(defaultOwnership);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
