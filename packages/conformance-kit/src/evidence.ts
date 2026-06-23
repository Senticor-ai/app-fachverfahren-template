import type { ComplianceProfile } from "./profile.js";

export interface EvidenceItem {
  evidenceId: string;
  title: string;
  source: "repository" | "runtime" | "manual-review" | "provider";
  required: boolean;
}

export interface EvidenceBundlePlan {
  profile: ComplianceProfile;
  generatedAt: string;
  items: EvidenceItem[];
  disclaimer: string;
}

export function buildEvidenceBundlePlan(
  profile: ComplianceProfile,
): EvidenceBundlePlan {
  return {
    profile,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Dieses Bundle ist prueffaehige Evidenz, keine automatische Compliance-Zusage.",
    items: [
      {
        evidenceId: "system-data-flow-diagrams",
        title: "System- und Datenflussdiagramme",
        source: "repository",
        required: true,
      },
      {
        evidenceId: "threat-model",
        title: "Threat Model",
        source: "manual-review",
        required: true,
      },
      {
        evidenceId: "processing-inventory",
        title: "Verzeichnis der Verarbeitungstaetigkeiten Entwurf",
        source: "repository",
        required: true,
      },
      {
        evidenceId: "dpia-precheck",
        title: "DSFA Vorpruefung",
        source: "manual-review",
        required: true,
      },
      {
        evidenceId: "tom-control-matrix",
        title: "TOM- und Kontrollmatrix",
        source: "repository",
        required: true,
      },
      {
        evidenceId: "retention-deletion-concept",
        title: "Aufbewahrungs- und Loeschkonzept",
        source: "repository",
        required: true,
      },
      {
        evidenceId: "bsi-grundschutz-map",
        title: "BSI IT-Grundschutz Mapping",
        source: "repository",
        required: true,
      },
      {
        evidenceId: "c5-provider-references",
        title: "Cloud-Provider C5 Evidenzverweise",
        source: "provider",
        required: true,
      },
      {
        evidenceId: "sbom-license-provenance",
        title: "SBOM, Lizenzbericht und Build Provenance",
        source: "runtime",
        required: true,
      },
      {
        evidenceId: "kubernetes-policy-results",
        title: "Container- und Kubernetes-Policy-Ergebnisse",
        source: "runtime",
        required: true,
      },
      {
        evidenceId: "api-event-catalogue",
        title: "API- und Event-Katalog",
        source: "repository",
        required: true,
      },
      {
        evidenceId: "accessibility-report",
        title: "Barrierefreiheitsbericht und Erklaerungsentwurf",
        source: "runtime",
        required: true,
      },
      {
        evidenceId: "restore-test-result",
        title: "Backup- und Restore-Test",
        source: "runtime",
        required: true,
      },
      {
        evidenceId: "migration-rollback-records",
        title: "Migrations- und Rollback-Nachweise",
        source: "manual-review",
        required: false,
      },
    ],
  };
}
