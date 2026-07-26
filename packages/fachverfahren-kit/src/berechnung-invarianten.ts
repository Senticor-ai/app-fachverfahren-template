// berechnung-invarianten — die GENERISCHEN, verfahrens-agnostischen Prüf-Prädikate der Berechnung (Phase 5, W4).
//
// WURZEL (adversariales Fachaudit): der mitgelieferte Berechnungs-Test prüfte nur „aufrufbar / deterministisch /
// nicht-negativ" — es wurde NIE ein Betrag assertiert. Unbemerkt blieb deshalb:
//   • eine gewährte Minderung senkte den festgesetzten Betrag NICHT (Begründung und Positionstabelle wiesen sie
//     aus, der Tenor setzte den vollen Betrag fest) — der Bescheid widersprach sich selbst;
//   • die Positionen summierten nicht auf die Festsetzung (238 vs. 231,2);
//   • ein Minderungsbetrag stand als `-9.999999999999998` im Bescheid.
// Ein Bescheid mit falschem Betrag ist ein materiell rechtswidriger, aber WIRKSAMER Verwaltungsakt — er nimmt
// echtes Geld. § 157 Abs. 1 Satz 2 AO verlangt einen bestimmten Tenor (Art, Betrag, Schuldner).
//
// WARUM HIER (Kit) UND NICHT IM TEST: die Prädikate sind ein standardisiertes MODUL, das jeder generierte
// `berechnung.test.ts` mountet — nicht Prosa, die jede App neu erfindet. Sie sind vollständig DOMÄNENFREI: sie
// kennen weder Minderungen noch §§, sondern nur die Vertragsform `Berechnung` (betrag/status/positionen).
// Rein, ohne fs/Netz/Zeit — dieselbe Eingabe ergibt dieselben Befunde.

/** Die (defensiv getippte) Berechnungs-Form, wie der Vertrag sie führt. */
export interface BerechnungsForm {
  betrag?: unknown;
  status?: unknown;
  positionen?:
    { label?: unknown; betrag?: unknown; norm?: unknown }[] | undefined;
}

/** Ein Befund einer verletzten Invariante — mit der RECHTSFOLGE, nicht nur mit einem Feldnamen. */
export interface InvariantenBefund {
  invariante: "summe" | "wirkung" | "cent-format";
  meldung: string;
}

const zahl = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

const aufCent = (n: number): number => Math.round(n * 100) / 100;

/**
 * Ist der Wert EXAKT ein Cent-Wert (kein Float-Artefakt)?
 *
 * Bewusst per Rundungs-ROUNDTRIP und exaktem Vergleich, NICHT per Epsilon-Toleranz: `-9.999999999999998`
 * liegt nur 2e-13 neben `-10` und rutschte durch jede sinnvolle Toleranz — genau dieser Wert stand aber real
 * im Bescheid, weil der Renderer `String(betrag)` schreibt. Ein echter Cent-Wert überlebt den Roundtrip
 * identisch (0.07, 1234.56, -35 …), ein Float-Artefakt nicht. Damit ist das Prädikat scharf und trotzdem
 * frei von Falsch-Positiven.
 */
export function istCentGerundet(n: number): boolean {
  return Math.round(n * 100) / 100 === n;
}

/** Summe der numerischen Positionsbeträge; `undefined`, wenn eine Position keinen Betrag trägt. */
export function positionsSumme(b: BerechnungsForm): number | undefined {
  const pos = Array.isArray(b.positionen) ? b.positionen : [];
  if (pos.length === 0) return undefined;
  let s = 0;
  for (const p of pos) {
    const n = zahl(p?.betrag);
    if (n === undefined) return undefined;
    s += n;
  }
  return aufCent(s);
}

/** Signatur der Positionen (Label + Betrag) — zum Vergleich zweier Eingabe-Varianten. */
export function positionsSignatur(b: BerechnungsForm): string {
  return JSON.stringify(
    (Array.isArray(b.positionen) ? b.positionen : []).map((p) => [
      String(p?.label ?? ""),
      zahl(p?.betrag) ?? null,
    ]),
  );
}

/**
 * INVARIANTE 1 — SUMME: die ausgewiesenen Positionen führen auf den festgesetzten Betrag.
 *
 * ÜBERBLOCKUNGS-SCHUTZ (jede Bedingung bewusst): nur bei `status: "final"` (ein vorläufiges Ergebnis darf
 * unvollständig sein), nur bei ≥ 2 Positionen (eine einzeilige Zusammenfassung ist keine Aufschlüsselung),
 * nur wenn ALLE Positionen numerisch sind, und mit 1-Cent-Toleranz.
 */
export function pruefeSumme(b: BerechnungsForm): InvariantenBefund[] {
  if (b.status !== "final") return [];
  const betrag = zahl(b.betrag);
  const summe = positionsSumme(b);
  if (betrag === undefined || summe === undefined) return [];
  if ((b.positionen?.length ?? 0) < 2) return [];
  if (Math.abs(summe - betrag) <= 0.01) return [];
  return [
    {
      invariante: "summe",
      meldung:
        `Positionssumme ${summe} weicht vom festgesetzten Betrag ${betrag} ab — die Aufschlüsselung im Bescheid ` +
        `führt nicht auf den Tenor (§ 157 Abs. 1 S. 2 AO: Art, Betrag, Schuldner müssen bestimmt sein). ` +
        `Positionen: ${positionsSignatur(b)}`,
    },
  ];
}

/**
 * INVARIANTE 2 — WIRKUNG: unterscheiden sich zwei Varianten (EIN Feld verändert) in den Positionen WERTMÄSSIG,
 * muss sich auch der festgesetzte Betrag unterscheiden.
 *
 * Das ist der domänenfreie Kern des schwersten Befundes: die Berechnung wies eine Minderungsposition aus und
 * setzte trotzdem den vollen Betrag fest. Entweder die Position oder der Tenor ist dann falsch — beides macht
 * den Verwaltungsakt materiell rechtswidrig, und er wirkt trotzdem.
 *
 * ÜBERBLOCKUNGS-SCHUTZ: identische Positions-Signatur ⇒ keine Aussage; reine Label-Änderungen ohne
 * Summen-Unterschied ⇒ keine Aussage; nicht-finale Ergebnisse ⇒ keine Aussage.
 */
export function pruefeWirkung(
  a: BerechnungsForm,
  b: BerechnungsForm,
  kontext = "",
): InvariantenBefund[] {
  if (a.status !== "final" || b.status !== "final") return [];
  if (positionsSignatur(a) === positionsSignatur(b)) return [];
  const summeA = positionsSumme(a);
  const summeB = positionsSumme(b);
  if (summeA === undefined || summeB === undefined) return [];
  if (Math.abs(summeA - summeB) <= 0.01) return [];
  const betragA = zahl(a.betrag);
  const betragB = zahl(b.betrag);
  if (betragA === undefined || betragB === undefined) return [];
  if (betragA !== betragB) return [];
  return [
    {
      invariante: "wirkung",
      meldung:
        `${kontext ? kontext + ": " : ""}die Rechenpositionen unterscheiden sich wertmäßig um ` +
        `${aufCent(Math.abs(summeB - summeA))}, der festgesetzte Betrag bleibt aber identisch (${betragA}). ` +
        "Entweder die ausgewiesene Position oder der Tenor ist falsch — der Bescheid widerspricht sich selbst " +
        "(ausgewiesene Rechtsfolge ohne Wirkung auf die Festsetzung).",
    },
  ];
}

/** INVARIANTE 3 — CENT-FORMAT: Betrag und Positionen sind auf Cent gerundet (keine Float-Artefakte). */
export function pruefeCentFormat(b: BerechnungsForm): InvariantenBefund[] {
  const out: InvariantenBefund[] = [];
  const betrag = zahl(b.betrag);
  if (betrag !== undefined && !istCentGerundet(betrag))
    out.push({
      invariante: "cent-format",
      meldung: `Festgesetzter Betrag ${betrag} ist nicht auf Cent gerundet — ein Bescheid weist keine Float-Artefakte aus.`,
    });
  for (const p of b.positionen ?? []) {
    const n = zahl(p?.betrag);
    if (n === undefined || istCentGerundet(n)) continue;
    out.push({
      invariante: "cent-format",
      meldung: `Position „${String(p?.label ?? "")}" trägt ${n} — nicht auf Cent gerundet (Float-Artefakt im Bescheid).`,
    });
  }
  return out;
}
