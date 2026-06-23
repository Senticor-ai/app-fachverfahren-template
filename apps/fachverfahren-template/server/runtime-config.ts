import type { PublicRuntimeConfig } from "@senticor/public-sector-sdk";

export const defaultPublicRuntimeConfig: PublicRuntimeConfig = {
  schemaVersion: "public-runtime.v1",
  application: {
    applicationId: "fachverfahren-template",
    displayName: "Fachverfahren Template",
    version: "0.1.0-rc.1",
    procedureIds: [],
  },
  authority: {
    authorityId: "authority.local",
    authorityType: "municipality",
    displayName: "Beispielbehörde",
    organizationalUnits: [],
    contact: {
      email: "kontakt@example.invalid",
      url: "https://example.invalid",
    },
  },
  jurisdiction: {
    countryCode: "DE",
    jurisdictionId: "de",
    competentAuthorities: [],
    localeCodes: ["de-DE"],
    timeZone: "Europe/Berlin",
    legalProfile: "de-public-administration",
  },
  tenant: {
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    isolationMode: "dedicated",
  },
  localization: {
    defaultLocale: "de-DE",
    supportedLocales: ["de-DE"],
  },
  features: {
    citizenPortal: true,
    caseworkerWorkspace: true,
    complianceEvidence: true,
  },
  capabilities: {},
};

export function buildPublicRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PublicRuntimeConfig {
  return {
    ...defaultPublicRuntimeConfig,
    application: {
      ...defaultPublicRuntimeConfig.application,
      displayName:
        env["PUBLIC_APP_NAME"] ??
        defaultPublicRuntimeConfig.application.displayName,
    },
    authority: {
      ...defaultPublicRuntimeConfig.authority,
      authorityId:
        env["PUBLIC_AUTHORITY_ID"] ??
        defaultPublicRuntimeConfig.authority.authorityId,
      displayName:
        env["PUBLIC_AUTHORITY_NAME"] ??
        defaultPublicRuntimeConfig.authority.displayName,
    },
    tenant: {
      ...defaultPublicRuntimeConfig.tenant,
      tenantId:
        env["PUBLIC_TENANT_ID"] ?? defaultPublicRuntimeConfig.tenant.tenantId,
    },
  };
}
