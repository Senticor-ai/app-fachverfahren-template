/**
 * DER UMFANG EINES COMMITS — EINE Wahrheit, von jedem Tor gefragt, das ueber ihn urteilt.
 *
 * ⛔ DER BEFUND, live bezahlt 2026-09-14: `prettier --check .` UND `eslint .` lesen beide den GANZEN
 * Arbeitsbaum. Ein Commit mit EINER geaenderten Datei wurde von zwei unformatierten Dateien eines fremden,
 * UNGESTAGTEN Strangs abgewiesen — zuerst am Prettier-Tor, nach dessen Schnitt am eslint-Tor, das dieselben
 * Dateien ueber die `prettier/prettier`-Regel erneut traf. Beide ehrlichen Auswege sind versperrt:
 * `--write`/`--fix` auf fremde Arbeit zieht ihre Zeilen in den eigenen Commit, `--no-verify` umgeht ein Tor.
 *
 * ⭐ WARUM EIN MODUL UND NICHT ZWEI ABSCHRIFTEN: die Frage «welche Pfade traegt dieser Commit, und mit
 * welchem Inhalt» ist EINE Frage. Zwei Tore, die sie getrennt beantworten, laufen beim ersten Sonderfall
 * auseinander — und dann urteilen sie ueber zwei verschiedene Commits. Nutzer-Direktive: «den ganzen baum
 * immer lesen macht keinen sinn, passe das dynamisch intelligent an.»
 */
import { execFileSync } from "node:child_process";

/** Erzwingt den ganzen Baum, egal was im Index steht — fuer CI und den ausdruecklichen Handlauf. */
export const vollerBaumErzwungen = (): boolean =>
  process.env["FORMAT_CHECK_FULL"] === "1" ||
  process.env["LINT_CHECK_FULL"] === "1";

/**
 * Die Pfade, die DIESER Commit traegt. Waehrend eines `git commit --only -- <pfade>` setzt git einen
 * TEMPORAEREN Index (HEAD ⊕ die genannten Pfade) und reicht ihn den Haken ueber `GIT_INDEX_FILE` —
 * `--cached` sieht damit genau den Commit-Umfang, nicht den geteilten Index der Nachbarn.
 *
 * LEERE LISTE heisst: kein Commit im Gange (CI, Handlauf). Dann ist der ganze Baum die ehrliche Antwort,
 * nicht «nichts zu pruefen» — eine leere Menge besteht jede Pruefung ueber ihre Elemente.
 */
export const gestagteDateien = (): string[] => {
  try {
    return execFileSync(
      "git",
      ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
      {
        encoding: "utf8",
        maxBuffer: 64 << 20,
      },
    )
      .split("\0")
      .filter((p) => p.length > 0);
  } catch {
    return [];
  }
};

/**
 * Der Inhalt AUS DEM INDEX — nicht aus dem Arbeitsbaum.
 *
 * ⛔ Das ist der Unterschied zwischen «was committet wird» und «was gerade auf der Platte liegt». Eine
 * Datei kann gestagt UND im Arbeitsbaum weiter veraendert sein. Ein Tor, das eine Seite aus dem Index und
 * die andere aus dem Arbeitsbaum liest, urteilt ueber einen Baum, den es nicht gibt — diese Klasse ist im
 * CHOS-AGENTS gemessen und dort namentlich als bezahlter Vorfall gefuehrt.
 *
 * `null` heisst NICHT «leer», sondern «nicht aus dem Index lesbar» — der Rufer muss beides unterscheiden.
 */
export const indexInhalt = (pfad: string): string | null => {
  try {
    return execFileSync("git", ["show", `:${pfad}`], {
      encoding: "utf8",
      maxBuffer: 64 << 20,
    });
  } catch {
    return null;
  }
};
