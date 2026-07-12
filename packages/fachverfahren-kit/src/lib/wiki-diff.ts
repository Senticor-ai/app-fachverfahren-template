// lib/wiki-diff — ein REINER, dependency-freier ZEILEN-DIFF (#20 Phase 4) für die Wiki-Revisionshistorie. Vergleicht
// zwei Markdown-Fassungen über die klassische LCS (Longest Common Subsequence) und liefert eine Hunk-Liste, aus der
// die UI einen Zeilen-Diff (unverändert / hinzugefügt / entfernt) rendert. Rein & deterministisch (kein Date/Random/
// DOM/Netz) — testbar wie interpreter/rank. Keine externe Diff-Bibliothek: LCS ist für Artikel-Größen völlig ausreichend.

export type DiffTyp = "gleich" | "hinzu" | "weg";

export interface DiffZeile {
  typ: DiffTyp;
  zeile: string;
  /** 1-basierte Zeilennummer in der ALTEN Fassung („gleich"/„weg"), sonst null. */
  alt: number | null;
  /** 1-basierte Zeilennummer in der NEUEN Fassung („gleich"/„hinzu"), sonst null. */
  neu: number | null;
}

/** Zerlegt zwei Texte zeilenweise und liefert den LCS-Zeilen-Diff. Reihenfolge = Lese-Reihenfolge der neuen Fassung,
 *  entfernte Zeilen an ihrer ursprünglichen Position. `alt`/`neu` tragen die jeweilige Zeilennummer (für Gutter/Anker). */
export function wikiDiff(altText: string, neuText: string): DiffZeile[] {
  const a = altText.split("\n");
  const b = neuText.split("\n");
  const m = a.length;
  const n = b.length;

  // LCS-Längentabelle: dp[i][j] = Länge der LCS von a[i..] und b[j..]. (m+1)×(n+1), von hinten gefüllt.
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: DiffZeile[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ typ: "gleich", zeile: a[i]!, alt: i + 1, neu: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      // Eine Entfernung führt (nicht schlechter) zur LCS → alte Zeile ist weg.
      out.push({ typ: "weg", zeile: a[i]!, alt: i + 1, neu: null });
      i++;
    } else {
      out.push({ typ: "hinzu", zeile: b[j]!, alt: null, neu: j + 1 });
      j++;
    }
  }
  while (i < m) {
    out.push({ typ: "weg", zeile: a[i]!, alt: i + 1, neu: null });
    i++;
  }
  while (j < n) {
    out.push({ typ: "hinzu", zeile: b[j]!, alt: null, neu: j + 1 });
    j++;
  }
  return out;
}

/** Kurz-Bilanz eines Diffs: Anzahl hinzugefügter/entfernter Zeilen (für ein „+3 −1"-Label). */
export function diffBilanz(diff: DiffZeile[]): { hinzu: number; weg: number } {
  let hinzu = 0;
  let weg = 0;
  for (const d of diff) {
    if (d.typ === "hinzu") hinzu++;
    else if (d.typ === "weg") weg++;
  }
  return { hinzu, weg };
}
