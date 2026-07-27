// composables — DTOs für GET /api/composables (Agentic Composables, CHOS Blueprint v5.0). Read-only
// Discovery-Naht: Lesen ist Data Plane und braucht keinen Token (Blueprint §15). Die Enum-Werte (klasse/
// status/assurance/autonomy/aufgabe) sind als String transportiert; der Server validiert sie autoritativ
// über assertComposable (public-sector-sdk).
import { Type, type Static } from "@sinclair/typebox";
import { AiSuggestionDtoSchema } from "./ai-assist.js";

/** Der Spine-Agent in der DTO — Rolle, Autonomie (AAL), Aufgaben-Achse, geerdet auf Skills + Knowledge. */
export const SpineAgentDtoSchema = Type.Object(
  {
    role: Type.String({ minLength: 1 }),
    autonomy: Type.String({ minLength: 1 }),
    aufgaben: Type.Array(Type.String({ minLength: 1 })),
    skills: Type.Array(Type.String({ minLength: 1 })),
    knowledgeDomains: Type.Array(Type.String({ minLength: 1 })),
    /** Fasst der Spine eine rechtsnahe (HITL-pflichtige) Aufgabe an? (server-abgeleitet) */
    rechtsnah: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type SpineAgentDto = Static<typeof SpineAgentDtoSchema>;

/** Eine publizierende Quelle der Reuse-Herkunft (Provenienz) — Verbund/Tenant/Zeitpunkt. */
export const ComposableHerkunftQuelleDtoSchema = Type.Object(
  {
    verbundId: Type.String(),
    tenant: Type.String(),
    publishedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type ComposableHerkunftQuelleDto = Static<
  typeof ComposableHerkunftQuelleDtoSchema
>;

/** Reuse-Herkunft (Blueprint §18 „ERP-Reuse"): aus der geteilten Mesh-Registry GEMOUNTET (registry-mount, mit
 *  Quell-Provenienz) vs. im Verfahren LOKAL abgeleitet (lokal-abgeleitet). Die EINE Wahrheit ist die neben dem
 *  Manifest liegende Mount-Provenienz (`<id>.mount.json`) — absent ⇒ lokal (server-abgeleitet, nie geraten). */
export const ComposableHerkunftDtoSchema = Type.Object(
  {
    art: Type.Union([
      Type.Literal("registry-mount"),
      Type.Literal("lokal-abgeleitet"),
    ]),
    /** Nur bei registry-mount: die publizierenden Quellen (kann leer sein). */
    quelle: Type.Optional(Type.Array(ComposableHerkunftQuelleDtoSchema)),
    version: Type.Optional(Type.String()),
    recordHash: Type.Optional(Type.String()),
    mountedAt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type ComposableHerkunftDto = Static<typeof ComposableHerkunftDtoSchema>;

/** Kurzfassung eines Composables für die Liste (Discovery). */
export const ComposableSummaryDtoSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    displayName: Type.String({ minLength: 1 }),
    klasse: Type.String({ minLength: 1 }),
    status: Type.String({ minLength: 1 }),
    assurance: Type.String({ minLength: 1 }),
    /** enabled = certified/active (produktiv nutzbar). */
    enabled: Type.Boolean(),
    hasSpine: Type.Boolean(),
    /** Reuse-Herkunft (server-abgeleitet aus der Mount-Provenienz): registry-mount vs. lokal-abgeleitet. */
    herkunft: ComposableHerkunftDtoSchema,
  },
  { additionalProperties: false },
);
export type ComposableSummaryDto = Static<typeof ComposableSummaryDtoSchema>;

export const ComposableListDtoSchema = Type.Object(
  { composables: Type.Array(ComposableSummaryDtoSchema) },
  { additionalProperties: false },
);
export type ComposableListDto = Static<typeof ComposableListDtoSchema>;

/** Volldetail eines Composables inkl. Zertifizierungsreife (nennt fehlende Ebenen). */
export const ComposableDetailDtoSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    version: Type.String({ minLength: 1 }),
    displayName: Type.String({ minLength: 1 }),
    klasse: Type.String({ minLength: 1 }),
    status: Type.String({ minLength: 1 }),
    assurance: Type.String({ minLength: 1 }),
    enabled: Type.Boolean(),
    outcome: Type.Object(
      {
        fuerWen: Type.String(),
        ergebnis: Type.String(),
        messung: Type.String(),
        nichtScope: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    owners: Type.Record(Type.String(), Type.String()),
    moduleId: Type.Optional(Type.String({ minLength: 1 })),
    spine: Type.Optional(SpineAgentDtoSchema),
    evals: Type.Array(Type.String()),
    replaceableBy: Type.Array(Type.String()),
    /** Reuse-Herkunft (server-abgeleitet aus der Mount-Provenienz): registry-mount vs. lokal-abgeleitet. */
    herkunft: ComposableHerkunftDtoSchema,
    /** Zertifizierungsreife (Blueprint §19): certifiable + konkret fehlende Ebenen. */
    certification: Type.Object(
      {
        certifiable: Type.Boolean(),
        fehlend: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    /** DIE STRUKTURIERTE FAEHIGKEITS-SEITE — gleichrangig zur Wissensseite (`spine.skills`).
     *
     *  MUSS HIER STEHEN: dieses Schema traegt `additionalProperties: false`, und Fastify wirft Undeklariertes
     *  STILL weg. Ein Feld, das der Mapper korrekt setzt und der Serializer schweigend entfernt, sieht auf der
     *  Flaeche exakt so aus wie „gibt es nicht" — nur dass niemand den Unterschied bemerkt.
     *
     *  ES REIST DER ANSPRUCH: `programm` ist eine Kennung, nie der Koerper. Die Darstellung (Tarif-Tabelle,
     *  DMN, Formel, Code) bleibt beim Herausgeber; dieses Kit hat sie nicht und soll sie nicht haben. */
    strukturiert: Type.Optional(
      Type.Array(
        Type.Object(
          {
            id: Type.String({ minLength: 1 }),
            ergebnis: Type.String(),
            klasse: Type.Optional(Type.String()),
            programm: Type.Optional(Type.String()),
            grundlagen: Type.Optional(Type.Array(Type.String())),
            evalSuite: Type.Optional(Type.String()),
            /** Erzeugt, aber nicht freigegeben ⇒ der Betreiber betriebe eine ungelesene Regel. Sichtbar. */
            erzeugtVon: Type.Optional(Type.String()),
            freigegebenVon: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
      ),
    ),
    /** WERKZEUG-KANTEN: welche Wissens-Faehigkeit welches Programm aufruft. */
    benutzt: Type.Optional(
      Type.Array(
        Type.Object(
          { wissen: Type.String({ minLength: 1 }), werkzeug: Type.String({ minLength: 1 }) },
          { additionalProperties: false },
        ),
      ),
    ),
  },
  { additionalProperties: false },
);
export type ComposableDetailDto = Static<typeof ComposableDetailDtoSchema>;

// SPINE-RUN (Nutzer-Mandat): eine Aufgabe des Spine-Agenten ausführen — von Assistenz bis Prüfung/Subsumtion/
// Review/Strukturierung. Läuft über den AiAssistPort (AAL-2 „Advise"): das Ergebnis ist IMMER ein Vorschlag
// mit reviewRequired=true — nie eine Entscheidung. Die KI ist nie eines der zwei Augen.
export const ComposableSpineParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    /** Die Spine-Aufgabe: assistenz|strukturierung|pruefung|subsumtion|review (server-validiert). */
    aufgabe: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type ComposableSpineParamsDto = Static<
  typeof ComposableSpineParamsSchema
>;

export const SpineRunRequestSchema = Type.Object(
  {
    /** Strukturierter, PII-armer Kontext für den Vorschlag (synthetisch im Demo-Betrieb). */
    input: Type.Record(Type.String(), Type.Unknown()),
    /** Optionaler Fallbezug (nur Referenz fürs Audit — der Kontext kommt aus der Sitzung). */
    caseId: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type SpineRunRequestDto = Static<typeof SpineRunRequestSchema>;

export const SpineRunResultDtoSchema = Type.Object(
  {
    composableId: Type.String({ minLength: 1 }),
    aufgabe: Type.String({ minLength: 1 }),
    /** Ist die Aufgabe rechtsnah (HITL-pflichtig)? Dann bleibt die Entscheidung zwingend menschlich. */
    rechtsnah: Type.Boolean(),
    autonomy: Type.String({ minLength: 1 }),
    /** Der KI-Vorschlag — NIE eine Entscheidung (reviewRequired immer true). */
    suggestion: AiSuggestionDtoSchema,
  },
  { additionalProperties: false },
);
export type SpineRunResultDto = Static<typeof SpineRunResultDtoSchema>;

// COMPOSABLE-CHAT (Ziel-1 S5): das Composable als LINGUISTISCHER Agent — eine governed Konversations-Runde
// mit dem Spine-Agent. Jede Runde ist GEERDET (Verfahrens-Wissen der knowledgeDomains reist als Kontext,
// die Quellen sind server-abgeleitet — nie erfunden), HITL (die Antwort ist ein AiSuggestion-Vorschlag mit
// reviewRequired=true) und EVIDENZIERT (chat.turn im hash-verketteten Ledger, nur Metadaten). Datei rein/raus
// läuft base64 über den BlobStoragePort (dasselbe Muster wie der Nachweis-Upload).

/** Ein Zug des Chat-Verlaufs (Kit-Vokabular nutzer/assistent — EINE UX-Sprache). */
export const ComposableChatTurnDtoSchema = Type.Object(
  {
    rolle: Type.Union([Type.Literal("nutzer"), Type.Literal("assistent")]),
    text: Type.String({ minLength: 1, maxLength: 20_000 }),
  },
  { additionalProperties: false },
);
export type ComposableChatTurnDto = Static<typeof ComposableChatTurnDtoSchema>;

/** Datei-IN: Dateiname + MIME + base64 (Muster NachweisUploadRequestSchema; Server rechnet Größe+SHA-256). */
export const ComposableChatDateiUploadSchema = Type.Object(
  {
    fileName: Type.String({ minLength: 1, maxLength: 255 }),
    mimeType: Type.String({ minLength: 1, maxLength: 255 }),
    contentBase64: Type.String({ minLength: 1, maxLength: 14_000_000 }),
  },
  { additionalProperties: false },
);
export type ComposableChatDateiUploadDto = Static<
  typeof ComposableChatDateiUploadSchema
>;

/** Die Referenz einer Chat-Datei (BlobStorage-AttachmentRef, ohne Inhalt). */
export const ComposableChatDateiRefDtoSchema = Type.Object(
  {
    attachmentId: Type.String({ minLength: 1 }),
    fileName: Type.String({ minLength: 1 }),
    mimeType: Type.String({ minLength: 1 }),
    sizeBytes: Type.Integer({ minimum: 0 }),
    checksumSha256: Type.String({ minLength: 64, maxLength: 64 }),
  },
  { additionalProperties: false },
);
export type ComposableChatDateiRefDto = Static<
  typeof ComposableChatDateiRefDtoSchema
>;

/** Eine Chat-Runde anfordern: neue Nachricht + bisheriger Verlauf (+ optional Dateien rein / Antwort als Datei). */
export const ComposableChatRequestSchema = Type.Object(
  {
    nachricht: Type.String({ minLength: 1, maxLength: 20_000 }),
    verlauf: Type.Optional(
      Type.Array(ComposableChatTurnDtoSchema, { maxItems: 50 }),
    ),
    /** Optionaler Fallbezug (nur Referenz für Audit/Evidence — der Kontext kommt aus der Sitzung). */
    caseId: Type.Optional(Type.String({ minLength: 1 })),
    /** Datei-IN: wird im BlobStorage abgelegt; textartige Inhalte erden zusätzlich die Antwort. */
    dateien: Type.Optional(
      Type.Array(ComposableChatDateiUploadSchema, { maxItems: 8 }),
    ),
    /** Datei-OUT: die Antwort zusätzlich als Markdown-Datei im BlobStorage ablegen + zurückgeben. */
    antwortAlsDatei: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ComposableChatRequestDto = Static<
  typeof ComposableChatRequestSchema
>;

export const ComposableChatReplyDtoSchema = Type.Object(
  {
    composableId: Type.String({ minLength: 1 }),
    autonomy: Type.String({ minLength: 1 }),
    /** Fasst der Spine eine rechtsnahe (HITL-pflichtige) Aufgabe an? Die Entscheidung bleibt menschlich. */
    rechtsnah: Type.Boolean(),
    /** Die Antwort als transparenter KI-Vorschlag — NIE eine Entscheidung (reviewRequired immer true). */
    antwort: AiSuggestionDtoSchema,
    /** ERDUNG (server-abgeleitet, nie aus der Modell-Antwort): worauf die Runde geerdet wurde. */
    erdung: Type.Object(
      {
        /** true ⇔ mindestens ein kuratierter Wissenseintrag hat die Runde geerdet (fail-closed ehrlich). */
        geerdet: Type.Boolean(),
        wissensEintraege: Type.Integer({ minimum: 0 }),
        /** Zitierfähige Quellen: `wissen:<eintragId>` + `domain:<knowledgeDomain>` — nie erfundene Normen. */
        quellen: Type.Array(Type.String()),
      },
      { additionalProperties: false },
    ),
    /** Die im BlobStorage abgelegten Eingangs-Dateien dieser Runde. */
    dateienRein: Type.Array(ComposableChatDateiRefDtoSchema),
    /** Datei-OUT (nur wenn `antwortAlsDatei`): Referenz + Inhalt der abgelegten Antwort-Datei. */
    datei: Type.Optional(
      Type.Object(
        {
          ref: ComposableChatDateiRefDtoSchema,
          contentBase64: Type.String({ minLength: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type ComposableChatReplyDto = Static<
  typeof ComposableChatReplyDtoSchema
>;

// EVIDENCE-LEDGER (Blueprint §15.3 / §27): der hash-verkettete, tamper-evidente Nachweis agentischer
// Governance-Handlungen (Spine-Vorschläge). Nur Metadaten — nie der Vorschlagsinhalt (kein PII).
export const EvidenceEntryDtoSchema = Type.Object(
  {
    evidenceId: Type.String({ minLength: 1 }),
    entryType: Type.String({ minLength: 1 }),
    actorId: Type.String({ minLength: 1 }),
    summary: Type.String(),
    refs: Type.Record(Type.String(), Type.String()),
    occurredAt: Type.String({ minLength: 1 }),
    prevHash: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    entryHash: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type EvidenceEntryDto = Static<typeof EvidenceEntryDtoSchema>;

export const EvidenceLedgerDtoSchema = Type.Object(
  {
    ledgerId: Type.String({ minLength: 1 }),
    entries: Type.Array(EvidenceEntryDtoSchema),
    /** Verifikation der Hash-Kette: valid + Länge + optional der Index des ersten Bruchs. */
    chain: Type.Object(
      {
        valid: Type.Boolean(),
        length: Type.Integer({ minimum: 0 }),
        brokenAt: Type.Optional(Type.Integer({ minimum: 0 })),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type EvidenceLedgerDto = Static<typeof EvidenceLedgerDtoSchema>;
