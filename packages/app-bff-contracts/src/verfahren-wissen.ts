// Wire-Verträge des VERFAHRENS-WIKIS — das generelle, KI-gestützte Wissen EINES Fachverfahrens
// (verfahrens-scoped statt fall-scoped). Dieselbe typisierte Zellform wie der Fall-Aktenvermerk
// (Zwei-Ebenen-Symmetrie); Mensch UND Agent hinterlassen hier Wissen/Fähigkeiten/Reflexionen mit
// strukturierten, agenten-konsumierbaren Metadaten. Append-only, behörden-scoped.
import { Type, type Static } from "@sinclair/typebox";
import { VermerkKindSchema, VermerkQuelleSchema } from "./vermerke.js";

/** Einen Wissens-Eintrag schreiben (Mensch). Urheber/Peer kommt server-seitig aus der Sitzung. */
export const WissenEintragRequestSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 20000 }),
    /** Zell-Typ (Default `wissen` — der verfahrens-weite Default ist generelles Wissen). */
    kind: Type.Optional(VermerkKindSchema),
    metadaten: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);
export type WissenEintragRequestDto = Static<typeof WissenEintragRequestSchema>;

/** Einen KI-Wissens-Eintrag (ENTWURF) anfordern: die KI erzeugt Wissen aus Aufgabe + Kontext. */
export const KiWissenRequestSchema = Type.Object(
  {
    task: Type.String({ minLength: 1 }),
    input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    kind: Type.Optional(VermerkKindSchema),
  },
  { additionalProperties: false },
);
export type KiWissenRequestDto = Static<typeof KiWissenRequestSchema>;

/** Ein Wissens-Eintrag des Verfahrens (Ansicht). */
export const WissenViewDtoSchema = Type.Object(
  {
    eintragId: Type.String({ minLength: 1 }),
    procedureId: Type.String({ minLength: 1 }),
    procedureVersion: Type.String({ minLength: 1 }),
    kind: VermerkKindSchema,
    quelle: VermerkQuelleSchema,
    /** Peer-Kennung: `human:<rolle>` ODER Modell/Agent. */
    urheber: Type.String({ minLength: 1 }),
    text: Type.String(),
    metadaten: Type.Record(Type.String(), Type.Unknown()),
    /** true = möglicher Prompt-Injektions-Inhalt (Heuristik); beim Agenten-Konsum neutralisiert. */
    verdacht: Type.Boolean(),
    erstelltAm: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type WissenViewDto = Static<typeof WissenViewDtoSchema>;

export const WissenViewListDtoSchema = Type.Object(
  { eintraege: Type.Array(WissenViewDtoSchema) },
  { additionalProperties: false },
);
export type WissenViewListDto = Static<typeof WissenViewListDtoSchema>;

// ── Verfahrens-Wissens-EXPORT — die Brücke fürs verfahrens-weite Wiki (Symmetrie zum Fall-Export) ──────
// Der stabile, agenten-konsumierbare Kontext-Bundle EINES Verfahrens: chos-code liest ihn und übersetzt das
// generelle Wissen + die Fähigkeiten in Skills + Kontext. Der Text ist injektions-NEUTRALISIERT.
export const WissenExportEintragSchema = Type.Object(
  {
    eintragId: Type.String({ minLength: 1 }),
    kind: VermerkKindSchema,
    quelle: VermerkQuelleSchema,
    urheber: Type.String({ minLength: 1 }),
    text: Type.String(),
    metadaten: Type.Record(Type.String(), Type.Unknown()),
    erstelltAm: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type WissenExportEintragDto = Static<typeof WissenExportEintragSchema>;

export const WissenVerfahrenExportDtoSchema = Type.Object(
  {
    procedureId: Type.String({ minLength: 1 }),
    procedureVersion: Type.String({ minLength: 1 }),
    eintraege: Type.Array(WissenExportEintragSchema),
  },
  { additionalProperties: false },
);
export type WissenVerfahrenExportDto = Static<
  typeof WissenVerfahrenExportDtoSchema
>;

/** Route-Parameter: Verfahren + Version. */
export const VerfahrenWissenParamsSchema = Type.Object(
  {
    procedureId: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type VerfahrenWissenParamsDto = Static<
  typeof VerfahrenWissenParamsSchema
>;
