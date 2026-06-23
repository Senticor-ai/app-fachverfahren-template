import { describe, expect, it } from "vitest";
import {
  createAnswers,
  createLock,
  defaultOwnership,
  explainOwnership,
  formatOwnershipYaml,
  parseOwnershipYaml,
  validateOwnership,
} from "./manifest.ts";

describe("template manifest metadata", () => {
  it("creates stable answers without timestamps or machine paths", () => {
    expect(
      createAnswers({
        domain: "antragsservice",
        displayName: "Antragsservice",
      }),
    ).toEqual({
      domain: "antragsservice",
      displayName: "Antragsservice",
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
      explainOwnership(parsed, "apps/antragsservice/src/domain/example.ts"),
    ).toMatchObject({
      strategy: "consumer",
    });
  });
});
