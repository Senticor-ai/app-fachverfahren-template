// fachverfahren-kit/lib/rank — REINE Fractional-Index-Ordnung für das Drag&Drop-Board.
//
// Eine manuelle Kartenreihenfolge wird als STRING-Rang (`Aufgabe.sortRank`) geführt, nicht als numerischer Index:
// so schreibt ein Drop NUR die eine verschobene Karte (`rankZwischen(vorher, nachher)`), statt N Nachbarn neu zu
// nummerieren. Die Ränge sind base-62-Brüche über einem ASCII-aufsteigenden Alphabet — lexikografischer
// String-Vergleich ist damit die Sortierordnung. Rein & deterministisch (kein `Date.now`/Random), damit die
// Ordnung testbar ist und DEV-Store wie Server bit-genau dasselbe Ergebnis liefern.
//
// GRENZE (bewusst): wiederholtes Einfügen zwischen denselben Nachbarn verlängert die Rang-Strings monoton — ein
// periodischer Rebalance-Job (Server, spätere Phase) normalisiert sie. Für die reine Ordnung ist das irrelevant.

/** Rang-Alphabet: base-62, STRIKT ASCII-aufsteigend ('0'<'9'<'A'<'Z'<'a'<'z'), damit `a < b` (String) ⇔ Rang-Ordnung. */
export const RANG_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASIS = RANG_DIGITS.length;

function ziffer(c: string): number {
  return RANG_DIGITS.indexOf(c);
}

function kodiere(ziffern: number[]): string {
  return ziffern.map((z) => RANG_DIGITS[z]).join("");
}

/**
 * Liefert einen Rang STRIKT zwischen `vorher` und `nachher` (lexikografisch): `vorher < ergebnis < nachher`.
 * `vorher` fehlt ⇒ Anfang (kleiner als jeder existierende Rang); `nachher` fehlt ⇒ Ende (größer als jeder).
 * Fehlen beide, ergibt sich ein mittlerer Anker-Rang. Wirft, wenn `vorher >= nachher` (kein Platz dazwischen —
 * ein Aufruferfehler, der sonst eine kollidierende Ordnung erzeugte).
 */
export function rankZwischen(vorher?: string, nachher?: string): string {
  const a = vorher ?? "";
  let b: string | null = nachher ?? null;
  if (b !== null && a >= b) {
    throw new Error(
      `rankZwischen: „${vorher}" ist nicht kleiner als „${nachher}" — kein Rang dazwischen möglich.`,
    );
  }
  const ergebnis: number[] = [];
  let i = 0;
  // Digit-für-Digit: gemeinsame Präfix-Ziffern übernehmen, an der ersten abweichenden Stelle die Mitte bilden.
  // `a` wird konzeptionell mit der kleinsten Ziffer (0) aufgefüllt, `b` (falls offen) mit der Obergrenze (BASIS).
  for (;;) {
    const x = i < a.length ? ziffer(a[i]!) : 0;
    // Oberes Ende: `b === null` ⇒ offen (BASIS). Ist `b` eine ENDLICHE Grenze und HIER erschöpft
    // (`i >= b.length`), dann stimmt das Ergebnis bereits mit GANZ `b` überein (alle Ziffern per x===y gematcht) —
    // jede weitere Ziffer würde `b` lexikografisch ÜBERSCHREITEN. Dann existiert kein Rang strikt zwischen `a` und
    // `b` (z. B. rankZwischen("1","10"): kein Rang > "1" und < "10"). Werfen statt still die Ordnung zu brechen
    // (früher lieferte der BASIS-Zweig hier ein LÄNGERES, also GRÖSSERES Ergebnis als `b`).
    if (b !== null && i >= b.length) {
      throw new Error(
        `rankZwischen: kein Rang strikt zwischen „${vorher}" und „${nachher}" möglich — die Nachbar-Ränge sind zu dicht (Rebalance nötig).`,
      );
    }
    const y = b !== null ? ziffer(b[i]!) : BASIS;
    if (x === y) {
      ergebnis.push(x);
      i++;
      continue;
    }
    const mitte = Math.floor((x + y) / 2);
    if (mitte !== x) {
      ergebnis.push(mitte);
      return kodiere(ergebnis);
    }
    // y === x+1: keine Ziffer dazwischen — `x` übernehmen (= a-Ziffer, eine unter b) und tiefer gehen. Ab hier
    // beschränkt `b` nicht mehr (das Ergebnis ist an dieser Stelle bereits strikt kleiner als b), untere Grenze
    // bleibt `a`.
    ergebnis.push(x);
    i++;
    b = null;
  }
}

/**
 * Vergleicht zwei Ränge per CODE-POINT (die Fractional-Index-Ordnung) — die EINE Wahrheit für die Rang-Sortierung.
 * NICHT `localeCompare` (Locale-Kollation ordnet Ziffern/Buchstaben abweichend und bräche die Ordnung). Rein.
 */
export function rangVergleich(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Berechnet die Nachbar-Ränge, um eine bewegte Karte in eine rang-sortierte Spaltenliste einzuordnen — die EINE
 * Wahrheit fürs Board-Neuordnen (Drop-auf-Karte, Drop-auf-Spaltenende, Tastatur „nach oben/unten").
 *
 * `sortierte` ist die rang-sortierte Liste und ENTHÄLT die bewegte Karte selbst; sie wird ZUERST entfernt, damit die
 * Nachbarn aus den TATSÄCHLICHEN künftigen Nachbarn stammen (nicht aus der Voll-Liste inkl. der bewegten Karte —
 * genau diese Index-Verschiebung war die Off-by-one-Wurzel: beim Abwärtsziehen rutschte das Ziel um 1). `vorZielId`
 * benennt die Karte, VOR die eingeordnet wird; `null` ⇒ ans Ende. Ist das Ziel nicht (mehr) vorhanden ⇒ ans Ende.
 * Rein. Das Ergebnis {vorher, nachher} geht direkt in `rankZwischen`.
 */
export function raengeFuerEinordnung(
  sortierte: readonly { id: string; sortRank: string }[],
  bewegteId: string,
  vorZielId: string | null,
): { vorher?: string; nachher?: string } {
  const ohneMich = sortierte.filter((k) => k.id !== bewegteId);
  const zielIndex =
    vorZielId === null
      ? ohneMich.length
      : ohneMich.findIndex((k) => k.id === vorZielId);
  const i = zielIndex < 0 ? ohneMich.length : zielIndex;
  const result: { vorher?: string; nachher?: string } = {};
  const vorher = ohneMich[i - 1]?.sortRank;
  const nachher = ohneMich[i]?.sortRank;
  if (vorher !== undefined) result.vorher = vorher;
  if (nachher !== undefined) result.nachher = nachher;
  return result;
}

/**
 * Erzeugt `anzahl` aufsteigend geordnete Ränge (z. B. um Seed-Aufgaben eine Startordnung zu geben). Rein.
 */
export function verteilteRaenge(anzahl: number): string[] {
  const out: string[] = [];
  let prev: string | undefined;
  for (let i = 0; i < anzahl; i++) {
    const r = rankZwischen(prev, undefined);
    out.push(r);
    prev = r;
  }
  return out;
}
