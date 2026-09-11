// THE BADGE ON THE RESULT — pure, so that a witness can measure it.
//
// ⛔ THE FINDING (measured 2026-09-09 on a generated application). The citizen screen showed, above the amount,
// «VORLÄUFIG · §-BELEGT» — while the very same run listed, in `lauf-abschluss.md`, EVERY one of its 29 legal bases as
// «(Annahme)», the relevant statute as a knowledge gap in the curation graph, and — explicitly, in the seam —
// `SAETZE_BELEGT = false`. So the application certified exactly what the run denies about itself.
//
// ⭐ THE CAUSE IS ONE WORD WITH TWO MEANINGS, and the type says so itself: `herkunft: "deterministisch"`
// means, per its own comment, an evidence-driven, §-backed check/calculation schema — that is,
// (a) no AI guessed AND (b) it is legally backed. The first statement always holds, the second only
// when the TARIFF VALUES are backed. A citizen does not read the badge as a statement about the SCHEMA, but
// about the NUMBER right next to it.
//
// ⛔ THE SPLIT IS ADDITIVE AND FAIL-OPEN: if `Berechnung.saetzeBelegt` is missing, everything stays as before. Only an
// application that KNOWS about the uncertainty and reports it gets the more honest badge — an application that
// knows nothing does not suddenly claim more because of it.

/** What the badge may say about a result — derived, never set. */
export interface ResultBadgeInput {
  /** Did an AI assistant propose the value? Then it is a suggestion, not a check schema. */
  aiSuggestion: boolean;
  /** Are inputs still missing? Then the amount is an interim state. */
  provisional: boolean;
  /** Do the TARIFF VALUES (rates, amounts) come from a backed source? `undefined` = the application does not know. */
  ratesBacked?: boolean | undefined;
}

export interface ResultBadge {
  /** The short text on the badge. */
  text: string;
  /** The line above the amount. */
  heading: string;
  /** Does this badge claim legal backing? This is exactly what the witness measures. */
  claimsBacked: boolean;
}

/**
 * Derives the badge and the heading from the input.
 *
 * The load-bearing rule: **`§-belegt` appears ONLY where the rates are not explicitly reported as unbacked.**
 * If the application reports `saetzeBelegt: false`, it is replaced by what actually holds — the schema is
 * checked, the values are assumptions. That is no downgrade of the product but its own statement.
 */
export function resultBadge(input: ResultBadgeInput): ResultBadge {
  if (input.aiSuggestion) {
    return {
      text: "KI-Vorschlag",
      heading: input.provisional
        ? "Live-Einschätzung · KI-Vorschlag (Mensch entscheidet)"
        : "KI-Vorschlag · durch Mensch zu prüfen",
      claimsBacked: false,
    };
  }
  // ⛔ Only an EXPLICIT `false` withdraws the certification — `undefined` means «not measured» and
  // leaves the previous behaviour untouched (fail-open, no silent tightening for existing applications).
  if (input.ratesBacked === false) {
    return {
      text: input.provisional
        ? "vorläufig · Sätze ANNAHME"
        : "Prüfschema · Sätze ANNAHME",
      heading: input.provisional
        ? "Live-Berechnung nach Prüfschema · die Sätze sind noch nicht belegt"
        : "Ergebnis nach Prüfschema — die zugrunde liegenden Sätze sind ANNAHMEN, nicht belegt",
      claimsBacked: false,
    };
  }
  return {
    text: input.provisional ? "vorläufig · §-belegt" : "§-belegt · Prüfschema",
    heading: input.provisional
      ? "Live-Berechnung nach Prüfschema · aktueller Stand"
      : "Ergebnis nach Prüfschema (§-belegt, deterministisch)",
    claimsBacked: true,
  };
}
