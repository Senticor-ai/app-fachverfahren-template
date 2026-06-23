import type { CapabilityId } from "@senticor/platform-contracts";
import type {
  JurisdictionConfig,
  LocaleCode,
} from "@senticor/public-sector-sdk";

export interface JurisdictionPack {
  packId: string;
  displayName: string;
  baselineJurisdiction: JurisdictionConfig;
  languages: LocaleCode[];
  identityAssuranceMapping: string[];
  requiredCapabilities: CapabilityId[];
  semanticModels: string[];
  evidenceArtifacts: string[];
}

export const euJurisdictionPack: JurisdictionPack = {
  packId: "eu",
  displayName: "European Union baseline",
  baselineJurisdiction: {
    countryCode: "EU",
    jurisdictionId: "eu",
    competentAuthorities: [],
    localeCodes: ["en-EU"],
    timeZone: "Europe/Brussels",
    legalProfile: "eu-baseline",
  },
  languages: ["en-EU"],
  identityAssuranceMapping: ["eIDAS", "EUDI Wallet"],
  requiredCapabilities: [
    "identity-and-trust",
    "evidence-retrieval",
    "data-exchange",
    "signature-seal",
  ],
  semanticModels: ["CPSV-AP", "DCAT-AP", "EU-OOTS", "eDelivery/AS4"],
  evidenceArtifacts: ["interoperability-assessment"],
};
