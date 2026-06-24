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

export type EuAiActClass = "minimal" | "limited-risk" | "high-risk";

/** Die öffentlich-rechtlichen Pflichten (§3-Grounding-Blueprint) als Conformance-Anker. Spiegelt
 *  DEFAULT_PUBLIC_SECTOR_MANDATES im Orchestrator; hier template-lokal, damit das Conformance-Kit
 *  unabhängig prüfbar bleibt. Das mandateMapping eines Profils soll jede dieser Pflichten belegen. */
export const PUBLIC_SECTOR_MANDATE_IDS = [
  "rechtsgrundlage",
  "fim-leistung",
  "register-interop",
  "eid-zugang",
  "dsfa",
  "it-grundschutz",
  "barrierefreiheit",
  "saga-architektur",
  "vergabe-evb-it",
  "betrieb-nachweis",
  "vvt-art30",
] as const;
export type PublicSectorMandateId = (typeof PUBLIC_SECTOR_MANDATE_IDS)[number];

export interface ComplianceProfile {
  jurisdiction: string;
  authorityType: string;
  protectionNeeds: ProtectionNeeds;
  processing: ProcessingProfile;
  operations: OperationsProfile;
  accessibility: AccessibilityProfile;
  /** EU-AI-Act-Einordnung (KI-Assistenz = limited-risk; high-risk fordert eine AI-Eval-Evidenz). */
  euAiActClass?: EuAiActClass;
  /** FIM-Referenzen (Struktur-Provenienz, z.B. "99102013104000"). */
  fimReferences?: string[];
  /** Belegmatrix: öffentliche Pflicht-id → Nachweise (Doku/Code/Artefakt), die sie erfüllen. */
  mandateMapping?: Partial<Record<string, string[]>>;
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

/** Die öffentlichen Pflichten, die das Profil NICHT belegt (leeres/fehlendes mandateMapping-Eintrag).
 *  Leere Rückgabe = alle Pflichten belegt. Speist das blocking-Gate des Conformance-Kits. */
export function validateMandateCoverage(
  profile: ComplianceProfile,
  required: readonly string[] = PUBLIC_SECTOR_MANDATE_IDS,
): string[] {
  const mapping = profile.mandateMapping ?? {};
  return required.filter((id) => {
    const evidence = mapping[id];
    return !evidence || evidence.length === 0;
  });
}
