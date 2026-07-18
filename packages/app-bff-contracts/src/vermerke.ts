// Wire-Verträge des AKTENVERMERKS — die geteilte Fall-Akte als BLACKBOARD (Agentic Composable Mesh,
// KOORDINATIONS-Ebene): ein unveränderlicher, attribuierbarer Beitrag (append-only im Fall-Audit), verfasst
// von MENSCH ODER Agent als gleichrangige PEERS. Jeder Beitrag ist eine typisierte Zelle (`kind`), trägt
// eine Peer-Kennung (`urheber` = `human:<rolle>` ODER Modell/Agent), eine Sichtbarkeit (`sichtbarkeit`) und
// kann sich auf einen anderen Beitrag beziehen (`bezugVermerkId` = Threading). Ein KI-Beitrag trägt Modell
// + `ki-vorschlag`-Provenienz und ist prüfpflichtig (reviewStatus "offen") — die rechtsnahe Bewertung bleibt
// beim Menschen. So dokumentieren Mensch und Agent DASSELBE, für beide les- und nutzbar.
import { Type, type Static } from "@sinclair/typebox";

/** Wer den Vermerk verfasst hat. */
export const VermerkQuelleSchema = Type.Union([
  Type.Literal("mensch"),
  Type.Literal("ki"),
]);

/** Die Art einer Blackboard-Zelle (typisierter Beitrag zur gemeinsamen Akte) — nicht jeder Beitrag ist eine
 *  „Notiz": eine Hypothese, ein Teilergebnis, eine Rückfrage, ein Befund oder eine Entscheidung sind
 *  eigenständige, für Mensch UND Agent verständliche Zell-Typen. */
export const VermerkKindSchema = Type.Union([
  Type.Literal("hypothese"),
  Type.Literal("teilergebnis"),
  Type.Literal("frage"),
  Type.Literal("befund"),
  Type.Literal("entscheidung"),
  Type.Literal("notiz"),
]);
export type VermerkKind = Static<typeof VermerkKindSchema>;

/** Sichtbarkeit einer Zelle: `public` = Teil der geteilten Akte; `private` = interner Entwurf/Vorüberlegung. */
export const VermerkSichtbarkeitSchema = Type.Union([
  Type.Literal("public"),
  Type.Literal("private"),
]);

/** Prüfstatus: menschliche Vermerke sind „nicht-erforderlich"; KI-Entwürfe starten „offen". */
export const VermerkReviewStatusSchema = Type.Union([
  Type.Literal("nicht-erforderlich"),
  Type.Literal("offen"),
  Type.Literal("bestaetigt"),
  Type.Literal("verworfen"),
]);

/** Einen menschlichen Blackboard-Beitrag schreiben. Urheber/Peer kommt server-seitig aus der Sitzung. */
export const VermerkRequestSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 20000 }),
    /** Zell-Typ (Default `notiz`). */
    kind: Type.Optional(VermerkKindSchema),
    /** Sichtbarkeit (Default `public` = Teil der geteilten Akte). */
    sichtbarkeit: Type.Optional(VermerkSichtbarkeitSchema),
    /** Bezug auf einen anderen Beitrag (Threading `re:`) — z.B. Antwort auf eine `frage`. */
    bezugVermerkId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type VermerkRequestDto = Static<typeof VermerkRequestSchema>;

/** Einen KI-Beitrag (ENTWURF) anfordern: die KI erzeugt den Text aus Aufgabe + (PII-armem) Kontext.
 *  `kind` steuert den Zell-Typ (Default `teilergebnis` — ein KI-Beitrag ist typischerweise ein Zwischen-
 *  ergebnis); `bezugVermerkId` lässt die KI auf eine offene Zelle (z.B. `frage`) antworten. */
export const KiVermerkRequestSchema = Type.Object(
  {
    task: Type.String({ minLength: 1 }),
    input: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    kind: Type.Optional(VermerkKindSchema),
    bezugVermerkId: Type.Optional(Type.String({ minLength: 1 })),
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

/** Eine Blackboard-Zelle (Aktenvermerk-Beitrag) aus dem append-only Fall-Audit. */
export const VermerkDtoSchema = Type.Object(
  {
    vermerkId: Type.String({ minLength: 1 }),
    caseId: Type.String({ minLength: 1 }),
    text: Type.String(),
    /** Zell-Typ (hypothese/teilergebnis/frage/befund/entscheidung/notiz). */
    kind: VermerkKindSchema,
    quelle: VermerkQuelleSchema,
    /** Peer-Kennung des Urhebers: `human:<rolle>` (Mensch) ODER die Modell-/Agent-Kennung (KI) — Mensch und
     *  Agent sind gleichrangige Knoten der geteilten Akte. */
    urheber: Type.String({ minLength: 1 }),
    /** Akteurs-Kennung des/der Verantwortlichen (bei KI: wer den Entwurf angefordert hat). */
    autorActorId: Type.String({ minLength: 1 }),
    /** Modell-Kennung bei KI-Vermerken (z.B. „ollama:qwen3"), sonst null. */
    modelId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    /** Sichtbarkeit (`public` = geteilte Akte, `private` = interner Entwurf). */
    sichtbarkeit: VermerkSichtbarkeitSchema,
    /** Bezug auf einen anderen Beitrag (Threading), sonst null. */
    bezugVermerkId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    reviewStatus: VermerkReviewStatusSchema,
    /** true = der Text trägt ein mögliches Prompt-Injektions-Muster (Heuristik) — für Prüfer sichtbar
     *  markiert; beim Lesen durch einen Agenten wird die Zelle ohnehin neutralisiert. */
    verdacht: Type.Boolean(),
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
