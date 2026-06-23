export interface ProtectionNeeds {
  confidentiality: "normal" | "high" | "very-high";
  integrity: "normal" | "high" | "very-high";
  availability: "normal" | "high" | "very-high";
}

export interface ProcessingProfile {
  purposes: string[];
  legalBases: string[];
  dataCategories: string[];
  recipients: string[];
  retentionRules: string[];
}

export interface OperationsProfile {
  dataResidency: string;
  rto: string;
  rpo: string;
}

export interface AccessibilityProfile {
  profile: "BITV-2" | "WCAG-2.2-AA" | "custom";
  target: string;
}

export interface ComplianceProfile {
  jurisdiction: string;
  authorityType: string;
  protectionNeeds: ProtectionNeeds;
  processing: ProcessingProfile;
  operations: OperationsProfile;
  accessibility: AccessibilityProfile;
}

export function validateComplianceProfile(
  profile: ComplianceProfile,
): string[] {
  const findings: string[] = [];
  if (profile.processing.purposes.length === 0) {
    findings.push("processing.purposes is empty");
  }
  if (profile.processing.legalBases.length === 0) {
    findings.push("processing.legalBases is empty");
  }
  if (!profile.operations.dataResidency) {
    findings.push("operations.dataResidency is required");
  }
  return findings;
}
