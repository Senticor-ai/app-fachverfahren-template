// Wire-Verträge der BÜRGER-Sicht auf die EIGENEN Anträge.
//
// EIGENE FAMILIE, EIGENES DTO — bewusst nicht `CaseDto` mit einem `scope`-Feld auf /api/cases:
//  1. `scopeOf` (route-auth.ts) läse den Scope aus QUERY/BODY (Default „own"), und der Handler leitete
//     ihn unabhängig davon nochmal ab. Divergieren die beiden, prüft die Policy „own" und der Handler
//     holt Behörden-Daten. Verschärfend: ein nicht im Schema deklariertes `scope` wirft Fastify STILL
//     weg (removeAdditional) — der Fallback wäre lautlos.
//     Bei einer eigenen Route ist der Scope durch die ROUTE impliziert und kommt gar nicht mehr von der
//     Leitung: der Vektor existiert nicht, statt bewacht zu werden.
//  2. Der Bürger braucht eine ANDERE Projektion als die Sachbearbeitung: `subjectIds` (interne
//     Zuordnungs-Kennungen) und die Server-Topologie gehen ihn nichts an.
import { Type, type Static } from "@sinclair/typebox";

/** Ein eigener Antrag aus Bürger-Sicht. Bewusst OHNE subjectIds/authority/tenant — interne Zuordnung. */
export const AntragDtoSchema = Type.Object(
  {
    antragId: Type.String({ minLength: 1 }),
    procedureId: Type.String({ minLength: 1 }),
    procedureVersion: Type.String({ minLength: 1 }),
    /** Fachlicher Zustand (ein Schlüssel der Zustandsmaschine des Verfahrens). */
    state: Type.String({ minLength: 1 }),
    version: Type.Integer({ minimum: 1 }),
    eingereichtAm: Type.String({ minLength: 1 }),
    abgeschlossenAm: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    /** Die eigenen Antragsdaten + die Berechnung — für den Server opak, für den Bürger sein Antrag. */
    data: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export type AntragDto = Static<typeof AntragDtoSchema>;

export const AntragListDtoSchema = Type.Object(
  { antraege: Type.Array(AntragDtoSchema) },
  { additionalProperties: false },
);
export type AntragListDto = Static<typeof AntragListDtoSchema>;

/** Antrag einreichen. Der Server setzt Kennung/Version/Zeit/EIGENTÜMER — der Client liefert nur Fachliches.
 *  KEIN `ownerActorId`, KEIN `subjectIds`, KEIN `scope` im Body: Eigentümerschaft kommt AUSSCHLIESSLICH
 *  aus der Sitzung, sonst liesse sie sich erschleichen. */
export const AntragEinreichenRequestSchema = Type.Object(
  {
    procedureId: Type.String({ minLength: 1 }),
    procedureVersion: Type.String({ minLength: 1 }),
    /** Antragsdaten + Berechnung, wie der Client sie ermittelt hat (Server interpretiert sie nicht). */
    data: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);
export type AntragEinreichenRequestDto = Static<
  typeof AntragEinreichenRequestSchema
>;

export const AntragIdParamsSchema = Type.Object(
  { id: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export type AntragIdParamsDto = Static<typeof AntragIdParamsSchema>;
