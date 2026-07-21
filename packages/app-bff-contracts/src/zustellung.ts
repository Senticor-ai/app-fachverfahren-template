// Wire-Verträge der Bescheid-Zustellung (MailboxPort → De-Mail/eBO). Die Zustellung ist eine hoheitliche
// Außenwirkung (VwZG · Zustellfiktion): die Sachbearbeitung stellt einen Bescheid an eine:n Empfänger:in zu.
// Der Server ergänzt den Kontext AUS DER SITZUNG. Alle Felder VOLLSTÄNDIG deklariert, sonst würfe Fastifys
// `removeAdditional` sie still weg.
import { Type, type Static } from "@sinclair/typebox";

/** Referenz auf einen (bereits abgelegten) Anhang — der Bescheid als Dokument wird nicht inline übertragen. */
export const AttachmentRefSchema = Type.Object(
  {
    attachmentId: Type.String({ minLength: 1 }),
    fileName: Type.String(),
    mimeType: Type.String(),
    sizeBytes: Type.Integer({ minimum: 0 }),
    checksumSha256: Type.String(),
  },
  { additionalProperties: false },
);

/** Einen Bescheid rechtssicher zustellen (De-Mail/eBO). messageId = Bescheid-/Vorgangs-Referenz. */
export const BescheidVersandRequestSchema = Type.Object(
  {
    messageId: Type.String({ minLength: 1 }),
    recipientId: Type.String({ minLength: 1 }),
    subject: Type.String({ minLength: 1 }),
    bodyText: Type.String({ minLength: 1 }),
    attachments: Type.Optional(Type.Array(AttachmentRefSchema)),
  },
  { additionalProperties: false },
);
export type BescheidVersandRequestDto = Static<
  typeof BescheidVersandRequestSchema
>;

/** Die Zustell-Quittung — die Referenz, über die der Zustellstatus geprüft wird. */
export const ZustellQuittungDtoSchema = Type.Object(
  { deliveryId: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type ZustellQuittungDto = Static<typeof ZustellQuittungDtoSchema>;

/** Der Zustellstatus (Zustellnachweis) — der einzige serverseitig autoritative Zustell-Zustand. */
export const ZustellStatusDtoSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("queued"),
      Type.Literal("delivered"),
      Type.Literal("failed"),
    ]),
  },
  { additionalProperties: false },
);
export type ZustellStatusDto = Static<typeof ZustellStatusDtoSchema>;
