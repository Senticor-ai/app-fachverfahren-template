import type { ServiceBinding } from "@senticor/public-sector-sdk";

export interface DvcProviderRequirements {
  providerId: "dvc-generic";
  requiresOpenStandards: true;
  bindings: ServiceBinding[];
  conformance: string[];
}

export function createDvcGenericRequirements(): DvcProviderRequirements {
  return {
    providerId: "dvc-generic",
    requiresOpenStandards: true,
    bindings: [],
    conformance: [
      "Kubernetes workload portability",
      "OpenAPI for synchronous APIs",
      "AsyncAPI for events",
      "IaC and Policy as Code evidence",
      "SBOM and license evidence",
      "backup and restore evidence",
    ],
  };
}
