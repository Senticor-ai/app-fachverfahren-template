import { describe, expect, it } from "vitest";
import { replaceExactlyOnce } from "./structured-edit.ts";

describe("structured edit helpers", () => {
  it("replaces exactly one occurrence", () => {
    expect(replaceExactlyOnce("alpha beta", "beta", "gamma")).toBe(
      "alpha gamma",
    );
  });

  it("fails when an expected replacement is absent or ambiguous", () => {
    expect(() => replaceExactlyOnce("alpha", "beta", "gamma")).toThrow(
      "found 0",
    );
    expect(() => replaceExactlyOnce("beta beta", "beta", "gamma")).toThrow(
      "found 2",
    );
  });
});
