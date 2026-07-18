// Wire-Verträge des AKTENVERMERKS — der unveränderliche, attribuierbare Fall-Vermerk (append-only im
// Fall-Audit), verfasst von MENSCH oder KI. Ein KI-Vermerk trägt Modell + `ki-vorschlag`-Provenienz und
// ist prüfpflichtig (reviewStatus "offen") — die rechtsnahe Bewertung bleibt beim Menschen.
import { Type, type Static } from "@sinclair/typebox";

/** Wer den Vermerk verfasst hat. */
export const VermerkQuelleSchema = Type.Union([
  Type.Literal("mensch"),
  Type.Literal("ki"),
]);

/** Prüfstatus: menschliche Vermerke sind „nicht-erforderlich"; KI-Entwürfe starten „offen". */
export const VermerkReviewStatusSchema = Type.Union([
  Type.Literal("nicht-erforderlich"),
  Type.Literal("offen"),
  Type.Literal("bestaetigt"),
  Type.Literal("verworfen"),
]);

/** Einen menschlichen Aktenvermerk schreiben. Autor kommt server-seitig aus der Sitzung. */
export const VermerkRequestSchema = Type.Object(
  { text: Type.String({ minLength: 1, maxLength: 20000 }) },
  { additionalProperties: false },
);
export type VermerkRequestDto = Static<typeof VermerkRequestSchema>;

/** Einen KI-Vermerk-ENTWURF anfordern: die KI erzeugt den Text aus Aufgabe + (PII-armem) Kontext. */
export const KiVermerkRequestSchema = Type.Object(
  {
    task: Type.String({ minLength: 1 }),
    input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type KiVermerkRequestDto = Static<typeof KiVermerkRequestSchema>;

/** Einen KI-Vermerk-Entwurf prüfen: bestätigen (in die Akte übernehmen) oder verwerfen. */
export const VermerkReviewRequestSchema = Type.Object(
  {
    entscheidung: Type.Union([
      Type.Literal("bestaetigt"),
      Type.Literal("verworfen"),
    ]),
  },
  { additionalProperties: false },
);
export type VermerkReviewRequestDto = Static<typeof VermerkReviewRequestSchema>;

/** Route-Parameter für die Prüfung EINES Vermerks (Fall + Vermerk). */
export const VermerkIdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    vermerkId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type VermerkIdParamsDto = Static<typeof VermerkIdParamsSchema>;

/** Ein Aktenvermerk aus dem append-only Fall-Audit. */
export const VermerkDtoSchema = Type.Object(
  {
    vermerkId: Type.String({ minLength: 1 }),
    caseId: Type.String({ minLength: 1 }),
    text: Type.String(),
    quelle: VermerkQuelleSchema,
    /** Akteurs-Kennung des/der Verantwortlichen (bei KI: wer den Entwurf angefordert hat). */
    autorActorId: Type.String({ minLength: 1 }),
    /** Modell-Kennung bei KI-Vermerken (z.B. „ollama:qwen3"), sonst null. */
    modelId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    reviewStatus: VermerkReviewStatusSchema,
    erstelltAm: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type VermerkDto = Static<typeof VermerkDtoSchema>;

export const VermerkListDtoSchema = Type.Object(
  { vermerke: Type.Array(VermerkDtoSchema) },
  { additionalProperties: false },
);
export type VermerkListDto = Static<typeof VermerkListDtoSchema>;
