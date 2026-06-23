import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("neutral example module", () => {
  it("keeps a complete manifest without domain-specific validation content", () => {
    const manifest = readFileSync(
      "modules/neutral-example/domain.module.yaml",
      "utf8",
    );

    expect(manifest).toContain("id: neutral-example");
    expect(manifest).toContain("requiredCapabilities:");
    expect(manifest).not.toMatch(/hundesteuer/i);
  });
});
