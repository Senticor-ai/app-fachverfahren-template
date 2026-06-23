import type { PublicRuntimeConfig } from "@senticor/public-sector-sdk";
import {
  deJurisdictionConfig,
  germanDStackCapabilityMap,
} from "@senticor/jurisdiction-de";

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
  jurisdiction: deJurisdictionConfig,
  tenant: {
    tenantId: "tenant.local",
    authorityId: "authority.local",
    jurisdictionId: "de",
    isolationMode: "dedicated",
  },
  localization: {
    defaultLocale: "de-DE",
    supportedLocales: ["de-DE"],
    plainLanguageLocales: ["de-DE"],
    signLanguageLocales: ["de-DE"],
  },
  features: {
    citizenPortal: true,
    caseworkerWorkspace: true,
    complianceEvidence: true,
  },
  capabilities: Object.fromEntries(
    Object.entries(germanDStackCapabilityMap).map(([displayName, id]) => [
      id,
      {
        id,
        displayName,
        available: false,
        schemaVersions: [],
      },
    ]),
  ),
};
