import type {
  CapabilityId,
  DataClassification,
} from "@senticor/platform-contracts";

export type LocaleCode = `${string}-${string}`;

export interface ContactDetails {
  email?: string;
  phone?: string;
  url?: string;
  addressLines?: string[];
}

export interface OrganizationalUnit {
  organizationalUnitId: string;
  displayName: string;
  parentUnitId?: string;
}

export interface AuthorityConfig {
  authorityId: string;
  authorityType:
    | "municipality"
    | "county"
    | "state"
    | "federal"
    | "chamber"
    | "delegated-operator"
    | "other";
  displayName: string;
  organizationalUnits: OrganizationalUnit[];
  contact: ContactDetails;
}

export interface JurisdictionConfig {
  countryCode: string;
  subdivisionCode?: string;
  jurisdictionId: string;
  competentAuthorities: string[];
  localeCodes: LocaleCode[];
  timeZone: string;
  legalProfile: string;
}

export interface TenantConfig {
  tenantId: string;
  authorityId: string;
  jurisdictionId: string;
  isolationMode: "dedicated" | "schema" | "row";
}

export interface ApplicationDescriptor {
  applicationId: string;
  displayName: string;
  version: string;
  procedureIds: string[];
}

export interface LocalizationConfig {
  defaultLocale: LocaleCode;
  supportedLocales: LocaleCode[];
  plainLanguageLocales?: LocaleCode[];
  signLanguageLocales?: LocaleCode[];
}

export interface PublicCapabilityDescriptor {
  id: CapabilityId;
  displayName: string;
  available: boolean;
  schemaVersions: string[];
}

export interface PublicRuntimeConfig {
  schemaVersion: "public-runtime.v1";
  application: ApplicationDescriptor;
  authority: AuthorityConfig;
  jurisdiction: JurisdictionConfig;
  tenant: TenantConfig;
  localization: LocalizationConfig;
  features: Record<string, boolean>;
  capabilities: Record<string, PublicCapabilityDescriptor>;
}

export interface ServiceBinding {
  bindingId: string;
  service:
    | "postgresql"
    | "babelfish"
    | "object-storage"
    | "valkey"
    | "rabbitmq"
    | "opensearch"
    | "external-api";
  provider: string;
  classification: DataClassification;
  secretRef?: string;
  endpointRef?: string;
  profile: string;
}

export interface ServerRuntimeConfig {
  schemaVersion: "server-runtime.v1";
  bindings: ServiceBinding[];
  identity: {
    issuerUrl: string;
    clientId: string;
    sessionCookieName: string;
    tokenStorage: "server-session";
  };
  policy: {
    policySetId: string;
    defaultDecision: "deny";
  };
  upstreams: {
    upstreamId: string;
    capabilityId: CapabilityId;
    baseUrl: string;
    timeoutMs: number;
  }[];
  observability: {
    metricsPath: "/internal/metrics";
    logLevel: "debug" | "info" | "warn" | "error";
    tracePropagation: "w3c";
  };
}

export function assertPublicRuntimeConfig(
  value: PublicRuntimeConfig,
): PublicRuntimeConfig {
  if (value.schemaVersion !== "public-runtime.v1") {
    throw new Error("unsupported public runtime config schema");
  }
  if (!value.application.applicationId || !value.tenant.tenantId) {
    throw new Error("public runtime config requires application and tenant");
  }
  return value;
}
