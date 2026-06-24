import { describe, expect, it } from "vitest";
import {
  PUBLIC_SECTOR_MANDATE_IDS,
  validateMandateCoverage,
  type ComplianceProfile,
} from "./profile.js";
import { buildEvidenceBundlePlan } from "./evidence.js";

function baseProfile(
  overrides: Partial<ComplianceProfile> = {},
): ComplianceProfile {
  return {
    jurisdiction: "DE",
    authorityType: "municipality",
    protectionNeeds: {
      confidentiality: "high",
      integrity: "high",
      availability: "normal",
    },
    processing: {
      purposes: ["steuererhebung"],
      legalBases: ["satzung"],
      dataCategories: ["identity-data"],
      recipients: [],
      retentionRules: ["6y"],
    },
    operations: { dataResidency: "DE", rto: "PT4H", rpo: "PT1H" },
    accessibility: { profile: "BITV-2", target: "WCAG-2.2-AA" },
    ...overrides,
  };
}

describe("public-sector mandate coverage", () => {
  it("flags all 11 mandates when mandateMapping is missing", () => {
    expect(validateMandateCoverage(baseProfile())).toHaveLength(11);
    expect(PUBLIC_SECTOR_MANDATE_IDS).toHaveLength(11);
  });

  it("is satisfied when every mandate has evidence", () => {
    const mandateMapping = Object.fromEntries(
      PUBLIC_SECTOR_MANDATE_IDS.map((id) => [id, [`docs/${id}.md`]]),
    );
    expect(validateMandateCoverage(baseProfile({ mandateMapping }))).toEqual(
      [],
    );
  });

  it("flags a mandate with an empty evidence list", () => {
    const mandateMapping = Object.fromEntries(
      PUBLIC_SECTOR_MANDATE_IDS.map((id) => [id, [`docs/${id}.md`]]),
    );
    mandateMapping["dsfa"] = [];
    expect(validateMandateCoverage(baseProfile({ mandateMapping }))).toEqual([
      "dsfa",
    ]);
  });
});

describe("EU-AI-Act evidence", () => {
  it("adds an AI evaluation summary when KI is used (limited-risk)", () => {
    const plan = buildEvidenceBundlePlan(
      baseProfile({ euAiActClass: "limited-risk" }),
    );
    expect(plan.items.map((i) => i.evidenceId)).toContain(
      "ai-evaluation-summary",
    );
  });

  it("omits the AI evaluation summary when no KI is used", () => {
    const plan = buildEvidenceBundlePlan(baseProfile());
    expect(plan.items.map((i) => i.evidenceId)).not.toContain(
      "ai-evaluation-summary",
    );
  });
});
