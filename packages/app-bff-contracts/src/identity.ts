// Wire-Verträge der Identitäts-/Vertrauens-Naht (IdentityAndTrustPort → BundID/DeutschlandID/eIDAS). Der Server
// liest das Subjekt AUS DER SITZUNG (nie aus dem Body) und fragt den (per Env gewählten, austauschbaren) Port.
// Alle Felder VOLLSTÄNDIG deklariert, sonst würfe Fastifys `removeAdditional` sie still weg.
import { Type, type Static } from "@sinclair/typebox";

/** Das Identitätsprofil des angemeldeten Subjekts — die serverseitig autoritative Sicht (BundID/eID). */
export const IdentityProfileDtoSchema = Type.Object(
  {
    subjectId: Type.String({ minLength: 1 }),
    displayName: Type.String(),
    /** Vertrauensniveau (eIDAS: niedrig/substanziell/hoch bzw. lokaler Demo-Wert). */
    assuranceLevel: Type.String(),
    identityProvider: Type.String(),
    identifiers: Type.Record(Type.String(), Type.String()),
    representedOrganizationId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type IdentityProfileDto = Static<typeof IdentityProfileDtoSchema>;

/** Ein Mindest-Vertrauensniveau (eIDAS/BundID) für eine Handlung verlangen (Step-up). */
export const AssuranceRequestSchema = Type.Object(
  { minimumAssuranceLevel: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type AssuranceRequestDto = Static<typeof AssuranceRequestSchema>;

/** Das Ergebnis der Vertrauensniveau-Prüfung — akzeptiert, oder ein Step-up-Link (höheres Niveau nötig). */
export const AssuranceResultDtoSchema = Type.Object(
  {
    accepted: Type.Boolean(),
    stepUpUrl: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type AssuranceResultDto = Static<typeof AssuranceResultDtoSchema>;
