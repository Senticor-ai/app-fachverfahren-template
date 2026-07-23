// Wire-Verträge des Register-/Nachweis-Abrufs (EvidenceRetrievalPort → NOOTS/Once-Only). Die Behörde ruft einen
// Nachweis zweckgebunden aus einem Register ab, damit die Bürger:in ihn NICHT erneut einreichen muss (Once-Only).
// Der Server ergänzt den Kontext aus der Sitzung. Alle Felder VOLLSTÄNDIG deklariert (Fastify `removeAdditional`).
import { Type, type Static } from "@sinclair/typebox";
import { AttachmentRefSchema } from "./zustellung.js";

/** Einen Nachweis abrufen. purpose = Zweckbindung (DSGVO); subjectId = die betroffene Person; consentRef optional. */
export const EvidenceRequestDtoSchema = Type.Object(
  {
    evidenceType: Type.String({ minLength: 1 }),
    subjectId: Type.String({ minLength: 1 }),
    purpose: Type.String({ minLength: 1 }),
    consentRef: Type.Optional(Type.String()),
    acceptedSchemaVersions: Type.Array(Type.String({ minLength: 1 }), {
      minItems: 1,
    }),
  },
  { additionalProperties: false },
);
export type EvidenceRequestDto = Static<typeof EvidenceRequestDtoSchema>;

/** Der abgerufene Nachweis inkl. Provenienz (Aussteller · Zeitpunkt · Schema) — die autoritative Register-Antwort. */
export const EvidenceRecordDtoSchema = Type.Object(
  {
    evidenceId: Type.String({ minLength: 1 }),
    evidenceType: Type.String(),
    schemaVersion: Type.String(),
    issuedAt: Type.String(),
    issuerAuthorityId: Type.String(),
    documentRef: Type.Optional(AttachmentRefSchema),
    attributes: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type EvidenceRecordDto = Static<typeof EvidenceRecordDtoSchema>;
