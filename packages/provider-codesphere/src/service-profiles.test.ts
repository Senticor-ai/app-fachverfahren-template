import { describe, expect, it } from "vitest";
import { codesphereServiceProfiles } from "./service-profiles.js";

describe("Codesphere service profiles", () => {
  it("marks Babelfish as a migration bridge", () => {
    const babelfish = codesphereServiceProfiles.find(
      (profile) => profile.service === "babelfish",
    );
    expect(babelfish?.profile).toBe("sql-server-migration-bridge");
    expect(babelfish?.guardrails).toContain("not a greenfield default");
  });
});
