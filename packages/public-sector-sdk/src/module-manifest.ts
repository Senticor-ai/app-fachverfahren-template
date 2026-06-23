import type {
  CapabilityId,
  DataClassification,
} from "@senticor/platform-contracts";

export interface DomainRoute {
  path: string;
  surface: "citizen" | "caseworker" | "admin";
}

export interface DomainPermission {
  permission: string;
  description: string;
}

export interface DomainEventBinding {
  eventType: string;
  version: string;
}

export interface DomainMigrationConfig {
  database?: string;
  documents?: string;
  externalSystems?: string[];
}

export interface DomainModuleManifest {
  id: string;
  version: string;
  displayName: string;
  routes: DomainRoute[];
  requiredCapabilities: CapabilityId[];
  permissions: DomainPermission[];
  events: {
    publishes: DomainEventBinding[];
    consumes: DomainEventBinding[];
  };
  dataCategories: DataClassification[];
  retentionPolicies: string[];
  migrations: DomainMigrationConfig;
}

export function assertDomainModuleManifest(
  manifest: DomainModuleManifest,
): DomainModuleManifest {
  if (!manifest.id || !manifest.version) {
    throw new Error("domain module manifest requires id and version");
  }
  if (manifest.routes.length === 0) {
    throw new Error("domain module manifest requires at least one route");
  }
  return manifest;
}
