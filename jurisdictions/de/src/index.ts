import type { CapabilityId } from "@senticor/platform-contracts";
import type {
  JurisdictionConfig,
  LocaleCode,
} from "@senticor/public-sector-sdk";
import type { JurisdictionPack } from "@senticor/jurisdiction-eu";

export const germanDStackCapabilityMap: Record<string, CapabilityId> = {
  "OIDC/BundID/DeutschlandID/EUDI": "identity-and-trust",
  "FIT-Connect": "data-exchange",
  "NOOTS/EU-OOTS": "evidence-retrieval",
  XBezahldienste: "payment",
  "ZaPuK-compatible mailbox": "mailbox",
  "DVDV/authority directory": "authority-directory",
  "eIDAS signature/seal validation": "signature-seal",
  "DMS/eAkte/archive": "records-management",
};

export const deJurisdictionConfig: JurisdictionConfig = {
  countryCode: "DE",
  jurisdictionId: "de",
  competentAuthorities: [],
  localeCodes: ["de-DE"],
  timeZone: "Europe/Berlin",
  legalProfile: "de-public-administration",
};

export const deJurisdictionPack: JurisdictionPack = {
  packId: "de",
  displayName: "Deutschland baseline",
  baselineJurisdiction: deJurisdictionConfig,
  languages: ["de-DE"] satisfies LocaleCode[],
  identityAssuranceMapping: ["OIDC", "BundID", "DeutschlandID", "EUDI Wallet"],
  requiredCapabilities: [
    "identity-and-trust",
    "data-exchange",
    "evidence-retrieval",
    "payment",
    "mailbox",
    "authority-directory",
    "signature-seal",
    "records-management",
  ],
  semanticModels: [
    "FIM",
    "XDatenfelder",
    "XÖV",
    "FIT-Connect envelopes",
    "NOOTS",
    "PDF/UA",
  ],
  evidenceArtifacts: [
    "BITV accessibility declaration draft",
    "BSI IT-Grundschutz mapping",
    "C5 provider evidence references",
    "interoperability-assessment",
  ],
};
