import { describe, expect, it } from "vitest";
import { buildEvidenceBundlePlan } from "./evidence.js";
import type { ComplianceProfile } from "./profile.js";

const profile: ComplianceProfile = {
  jurisdiction: "DE",
  authorityType: "municipality",
  protectionNeeds: {
    confidentiality: "high",
    integrity: "high",
    availability: "normal",
  },
  processing: {
    purposes: ["test"],
    legalBases: ["test-law"],
    dataCategories: ["identity-data"],
    recipients: [],
    retentionRules: ["test-retention"],
  },
  operations: {
    dataResidency: "DE",
    rto: "PT4H",
    rpo: "PT1H",
  },
  accessibility: {
    profile: "BITV-2",
    target: "WCAG-2.2-AA",
  },
};

describe("evidence bundle plan", () => {
  it("contains restore evidence", () => {
    const plan = buildEvidenceBundlePlan(profile);
    expect(plan.items.map((item) => item.evidenceId)).toContain(
      "restore-test-result",
    );
  });
});
