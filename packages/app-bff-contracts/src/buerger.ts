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
    /** Die SERVER-vergebene Eingangs-/Vorgangsnummer (Format = Verfahrens-DATEN). Sie ist die lesbare
     *  Projektion von Aktenzeichen + Server-Eingangszeit — der Browser vergibt sie NICHT mehr: ein
     *  client-gestempelter Eingangsnachweis trägt die Uhr des Antragstellers und ist als Fristnachweis
     *  wertlos. Ohne dieses Feld im Schema würfe Fastifys `removeAdditional` sie still weg. */
    eingangsnummer: Type.String({ minLength: 1 }),
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

/** Die Art des Rechtsbehelfs — regime-neutral (Widerspruch/Einspruch/Klage). Eine Wahrheit für das
 *  eingefrorene Regime im Bescheid UND für den eingelegten Rechtsbehelf. */
export const RechtsbehelfArtSchema = Type.Union([
  Type.Literal("widerspruch"),
  Type.Literal("einspruch"),
  Type.Literal("klage"),
]);

/** Einen Rechtsbehelf (Widerspruch/Einspruch/Klage) gegen den EIGENEN Bescheid einlegen. Die Begründung
 *  ist optional (ein fristwahrender Widerspruch darf zunächst unbegründet sein). */
export const WiderspruchRequestSchema = Type.Object(
  { begruendung: Type.Optional(Type.String({ maxLength: 5000 })) },
  { additionalProperties: false },
);
export type WiderspruchRequestDto = Static<typeof WiderspruchRequestSchema>;

/** Bestätigung des eingelegten Rechtsbehelfs: Aktenzeichen, Art (aus dem eingefrorenen Regime) und der
 *  Zeitpunkt des Eingangs (Fristwahrungs-Nachweis für die/den Bürger:in).
 *
 *  `verfristet` FLAGGT den regulären Fristablauf (§§ 187/188 BGB, aus dem eingefrorenen Regime + Bekanntgabe-
 *  Anker berechnet) — es weist den Rechtsbehelf NICHT zurück (die Zulässigkeit inkl. § 58 Abs. 2 VwGO /
 *  Wiedereinsetzung entscheidet die Behörde). `null`, wenn keine Bekanntgabe verankert ist (Frist nicht
 *  angelaufen). `fristAblaufIso` ist der berechnete Fristablauf (nur gesetzt, wenn bestimmbar). */
export const WiderspruchDtoSchema = Type.Object(
  {
    aktenzeichen: Type.String({ minLength: 1 }),
    art: RechtsbehelfArtSchema,
    eingelegtAm: Type.String({ minLength: 1 }),
    verfristet: Type.Union([Type.Boolean(), Type.Null()]),
    fristAblaufIso: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export type WiderspruchDto = Static<typeof WiderspruchDtoSchema>;

/** Das Rechtsbehelfs-Regime, wie es beim Erlass EINGEFROREN wurde (regime-neutral). */
export const RechtsbehelfDtoSchema = Type.Object(
  {
    art: RechtsbehelfArtSchema,
    fristWert: Type.Integer({ minimum: 1 }),
    fristEinheit: Type.Union([
      Type.Literal("monat"),
      Type.Literal("woche"),
      Type.Literal("tag"),
    ]),
    stelle: Type.String({ minLength: 1 }),
    norm: Type.String({ minLength: 1 }),
    /** SITZ (Anschrift) der Stelle — § 356 Abs. 1 AO / § 58 Abs. 1 VwGO verlangen ihn AUSDRÜCKLICH.
     *  MUSS im Schema stehen: `additionalProperties:false` + Fastifys `removeAdditional` würfen ihn sonst
     *  STILL weg, und der Bescheid belehrte wieder unvollständig (Frist ein Jahr, § 356 Abs. 2 AO).
     *  Optional deklariert, damit VOR W1 eingefrorene Verwaltungsakte lesbar bleiben (Bestandsschutz);
     *  am ERLASS ist er Pflicht (cases.ts fail-closed). */
    sitz: Type.Optional(Type.String({ minLength: 1 })),
    /** FORM des Rechtsbehelfs (§ 357 Abs. 1 AO / § 70 Abs. 1 VwGO) — gleiche Begründung wie beim Sitz. */
    form: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

/**
 * Der eingefrorene VERWALTUNGSAKT, wie ihn der Bürger abruft — die selbsttragenden Bytes + das
 * Integritäts-Token. VOLLSTÄNDIG deklariert: fehlte `checksumSha256` im Schema, würfe Fastifys
 * `removeAdditional` den Hash STILL weg und der Beweiswert ginge lautlos verloren.
 */
export const VerwaltungsaktDtoSchema = Type.Object(
  {
    aktenzeichen: Type.String({ minLength: 1 }),
    /** ISO-Zeitpunkt des Erlasses (Server-Uhr). */
    issuedAt: Type.String({ minLength: 1 }),
    /** Akteur-Kennung des Festsetzenden (Server-Session, nicht aus dem Body). */
    issuedBy: Type.String({ minLength: 1 }),
    /** Der eingefrorene Tenor (die client-gerechnete Berechnung) — opak, deshalb frei-formig. */
    tenor: Type.Union([
      Type.Record(Type.String(), Type.Unknown()),
      Type.Null(),
    ]),
    rechtsbehelf: RechtsbehelfDtoSchema,
    fiktionTage: Type.Integer({ minimum: 0 }),
    fiktionNorm: Type.String({ minLength: 1 }),
    /** HERKUNFT des Tenor-Betrags: „client-berechnet" (server NICHT nachgerechnet, `berechne`-Escape-Hatch)
     *  vs. „server-nachgerechnet" (deklarativer Tarif server-verifiziert). Ehrliche Provenienz statt
     *  falscher Sicherheit — der Betrag ist eingefroren + hash-beweisbar-unverändert, aber die Herkunft
     *  ist transparent. */
    tenorHerkunft: Type.Union([
      Type.Literal("client-berechnet"),
      Type.Literal("server-nachgerechnet"),
    ]),
    // ── PFLICHTANGABEN DES VERWALTUNGSAKTS (Phase 5, Wurzel W5) ────────────────────────────────────────────
    // WARUM ADDITIV IM DTO: der Bescheid-Renderer kann nur zeigen, was der eingefrorene VA TRÄGT. Vor Phase 5
    // kannte weder der DTO noch das Renderer-Template einen Inhaltsadressaten, einen Erhebungszeitraum, ein
    // Leistungsgebot oder eine erlassende Behörde mit Namen — deshalb konnte KEINE Generierung sie füllen.
    // Rechtsfolge dieser Lücke: fehlender Inhaltsadressat und eine nicht erkennbare Behörde führen zur
    // NICHTIGKEIT (§ 125 Abs. 1, Abs. 2 Nr. 1 AO), ein fehlendes Leistungsgebot macht den Zahlungsanspruch
    // nicht vollstreckbar (§ 254 Abs. 1 AO), ein fehlender Zeitraum ist ein Bestimmtheitsmangel (§ 119 Abs. 1 AO).
    // Alle Felder OPTIONAL im Schema (VOR Phase 5 eingefrorene Akte bleiben lesbar); die PFLICHT erzwingt die
    // Verfassung (`verwaltungsakt.pflichtangaben`) über das Gate — nicht der Typ.
    /** INHALTSADRESSAT: an wen sich die Regelung richtet (§ 119 Abs. 1, § 157 Abs. 1 S. 2 AO / § 37 Abs. 1 VwVfG). */
    adressat: Type.Optional(
      Type.Object(
        {
          name: Type.String({ minLength: 1 }),
          anschrift: Type.Optional(Type.String()),
          /** Gesetzlicher Vertreter/Bevollmächtigter, falls die Bekanntgabe an ihn erfolgt. */
          vertreter: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    /** ERLASSENDE BEHÖRDE mit ANZEIGE-Identität — NIE die technische authorityId (§ 119 Abs. 3 S. 1 AO). */
    behoerde: Type.Optional(
      Type.Object(
        {
          name: Type.String({ minLength: 1 }),
          anschrift: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    /** REGELUNGS-/ERHEBUNGSZEITRAUM („für das Kalenderjahr 2026") — bei zeitraumbezogenen Regelungen Pflicht. */
    zeitraum: Type.Optional(Type.String({ minLength: 1 })),
    /** LEISTUNGSGEBOT bei einem Zahlungs-VA (§ 254 Abs. 1 AO): Betrag, Fälligkeiten MIT Jahr, Zahlweg. */
    leistungsgebot: Type.Optional(
      Type.Object(
        {
          betrag: Type.Number(),
          waehrung: Type.Optional(Type.String()),
          faelligkeiten: Type.Optional(
            Type.Array(
              Type.Object(
                {
                  /** Vollständiges Datum INKLUSIVE Jahr — „15.02." allein ist keine Fälligkeit. */
                  datum: Type.String({ minLength: 1 }),
                  betrag: Type.Number(),
                },
                { additionalProperties: false },
              ),
            ),
          ),
          zahlungsempfaenger: Type.Optional(Type.String()),
          iban: Type.Optional(Type.String()),
          kassenzeichen: Type.Optional(Type.String()),
          verwendungszweck: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    /** UNTERSCHRIFT oder AUTOMATIONS-VERMERK (§ 119 Abs. 3 S. 2 AO / § 37 Abs. 5 VwVfG). */
    unterschrift: Type.Optional(
      Type.Object(
        {
          /** Namenswiedergabe des/der Verantwortlichen — leer, wenn maschinell erlassen. */
          name: Type.Optional(Type.String()),
          /** true ⇒ maschinell erlassen; dann MUSS der Vermerk im Bescheid stehen. */
          maschinell: Type.Boolean(),
          vermerk: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
    ),
    /** ENTWURFS-KENNZEICHNUNG: true ⇒ das Dokument ist NICHT erlassen (Demo/Vorschau) und sagt das sichtbar.
     *  Der SHA-256-Nachweis belegt Unverändertheit — NICHT den Erlass; die Trennung wird jetzt gerendert. */
    entwurf: Type.Optional(Type.Boolean()),
    /** SHA-256 über die kanonisch serialisierten Bytes — das portable Beweis-Token. */
    checksumSha256: Type.String({ minLength: 64, maxLength: 64 }),
  },
  { additionalProperties: false },
);
export type VerwaltungsaktDto = Static<typeof VerwaltungsaktDtoSchema>;
