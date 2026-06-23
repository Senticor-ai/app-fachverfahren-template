import { describe, expect, it } from "vitest";
import { migrationProfiles } from "./index.js";

describe("migration profiles", () => {
  it("prevents Babelfish without native PostgreSQL exit criteria", () => {
    const profile = migrationProfiles.find(
      (candidate) => candidate.profileId === "sql-server-babelfish",
    );
    expect(profile?.exitCriteria.join(" ")).toContain("native PostgreSQL");
  });
});
