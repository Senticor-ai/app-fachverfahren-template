// Wire-Verträge des NACHWEIS-Uploads (Bürger-Sicht). Der Byte-Transfer läuft base64-kodiert über JSON —
// der BlobStoragePort ist transport-agnostisch; Multipart bleibt ein späteres Hardening. Der Server
// berechnet Größe + SHA-256 über die dekodierten Bytes (das Integritäts-Token), NIE aus Client-Angaben.
import { Type, type Static } from "@sinclair/typebox";

/** Einen Nachweis hochladen: Dateiname + MIME-Typ + base64-Inhalt. */
export const NachweisUploadRequestSchema = Type.Object(
  {
    fileName: Type.String({ minLength: 1, maxLength: 255 }),
    mimeType: Type.String({ minLength: 1, maxLength: 255 }),
    /** Roh-Inhalt base64-kodiert (server-seitig dekodiert; ~10 MB Deckel via Route-bodyLimit). */
    contentBase64: Type.String({ minLength: 1, maxLength: 14_000_000 }),
  },
  { additionalProperties: false },
);
export type NachweisUploadRequestDto = Static<
  typeof NachweisUploadRequestSchema
>;

/** Die Referenz eines hochgeladenen Nachweises (Metadaten + Integritäts-Token, ohne Inhalt). */
export const NachweisRefDtoSchema = Type.Object(
  {
    attachmentId: Type.String({ minLength: 1 }),
    fileName: Type.String({ minLength: 1 }),
    mimeType: Type.String({ minLength: 1 }),
    sizeBytes: Type.Integer({ minimum: 0 }),
    checksumSha256: Type.String({ minLength: 64, maxLength: 64 }),
    hochgeladenAm: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type NachweisRefDto = Static<typeof NachweisRefDtoSchema>;

export const NachweisListDtoSchema = Type.Object(
  { nachweise: Type.Array(NachweisRefDtoSchema) },
  { additionalProperties: false },
);
export type NachweisListDto = Static<typeof NachweisListDtoSchema>;

/** Der Download eines Nachweises: Metadaten + der base64-kodierte Inhalt. */
export const NachweisDownloadDtoSchema = Type.Object(
  {
    fileName: Type.String({ minLength: 1 }),
    mimeType: Type.String({ minLength: 1 }),
    sizeBytes: Type.Integer({ minimum: 0 }),
    checksumSha256: Type.String({ minLength: 64, maxLength: 64 }),
    contentBase64: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type NachweisDownloadDto = Static<typeof NachweisDownloadDtoSchema>;

/** Route-Parameter für den Einzel-Nachweis (Antrag + Anlage). */
export const NachweisIdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    attachmentId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type NachweisIdParamsDto = Static<typeof NachweisIdParamsSchema>;
