import { describe, expect, it } from "vitest";
import {
  createAnswers,
  createLock,
  defaultOwnership,
  explainOwnership,
  formatOwnershipYaml,
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
});
