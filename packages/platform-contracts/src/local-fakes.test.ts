import { describe, expect, it } from "vitest";
import { platformContractScenarios } from "./contract-tests.js";
import { createLocalPlatformPorts } from "./local-fakes.js";

describe("local platform ports", () => {
  for (const scenario of platformContractScenarios(
    createLocalPlatformPorts(),
  )) {
    it(scenario.name, async () => {
      await expect(scenario.run()).resolves.toBeUndefined();
    });
  }
});
