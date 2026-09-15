/**
 * FORMAT-PRUEFUNG AM UMFANG DES COMMITS — nicht am Schreibtisch der Nachbarn.
 *
 * ⛔ DER BEFUND, gemessen 2026-09-14: `prettier --check .` liest den GANZEN Arbeitsbaum. Ein Commit, der
 * EINE Datei traegt, wurde damit von zwei unformatierten Dateien eines fremden, ungestagten Strangs
 * abgewiesen — und die beiden ehrlichen Auswege sind beide versperrt: `--write` auf fremde Arbeit zieht
 * ihre Zeilen in den eigenen Commit, `--no-verify` umgeht ein Tor. Der Commit war damit unerfuellbar,
 * ohne dass irgendetwas an IHM falsch war. Dieselbe Klasse ist im GovTech Governed Builder gemessen und dort geschnitten (c893b12).
 *
 * ⭐ ZWEI ENTSCHEIDUNGEN, und die zweite ist die wichtigere:
 *
 *   UMFANG   die Pfade, die der Commit WIRKLICH traegt (`--cached`, gefiltert auf A/C/M/R). Steht nichts
 *            im Index, ist kein Commit im Gange — dann gilt wieder der ganze Baum (CI, Handlauf).
 *   INHALT   der Text aus dem **INDEX**, nicht aus dem Arbeitsbaum. Das ist der Unterschied zwischen
 *            «was committet wird» und «was gerade auf der Platte liegt». Dieses Haus hat den Unterschied
 *            schon bezahlt: ein Tor, das eine Seite aus dem Index und die andere aus dem Arbeitsbaum
 *            liest, urteilt ueber einen Baum, den es nicht gibt.
 *
 * ⚠️ ES IST KEINE LOCKERUNG, sondern eine VERENGUNG DES GEGENSTANDS: dieselbe Regel, derselbe Prettier,
 * dieselbe Konfiguration — nur gefragt zu dem, was dieser Commit erzeugt. Wer den ganzen Baum will,
 * bekommt ihn weiter: ohne Index-Inhalt, oder ausdruecklich ueber `FORMAT_CHECK_FULL=1`.
 */
import { execFileSync } from "node:child_process";
import prettier from "prettier";
import {
  gestagteDateien,
  indexInhalt,
  vollerBaumErzwungen,
} from "./commit-umfang.ts";

const voll = vollerBaumErzwungen();

const ganzerBaum = (): number => {
  // Kein zweiter Prettier-Begriff: derselbe CLI-Ruf wie bisher, damit der Rueckfall byte-gleich urteilt.
  try {
    execFileSync("pnpm", ["exec", "prettier", "--check", "."], {
      stdio: "inherit",
    });
    return 0;
  } catch {
    return 1;
  }
};

const pfade = voll ? [] : gestagteDateien();

if (pfade.length === 0) {
  console.log(
    voll
      ? "format:check — FORMAT_CHECK_FULL=1: der ganze Baum."
      : "format:check — nichts im Index, also kein Commit im Gange: der ganze Baum.",
  );
  process.exit(ganzerBaum());
}

const schlecht: string[] = [];
const uebersprungen: string[] = [];
let geprueft = 0;

/** Die EINE Ignoranz-Liste, die auch `pnpm exec prettier` liest — damit Tor und Werkzeug ueber
 *  dieselbe Datei dasselbe sagen. Zwei Listen waeren zwei Wahrheiten ueber denselben Pfad. */
const IGNORE_PFAD = ".prettierignore";

for (const pfad of pfade) {
  // ⛔ DER INHALT KOMMT AUS DEM INDEX. Ein Pfad kann gestagt UND im Arbeitsbaum weiter veraendert sein;
  //    committet wird der Index-Stand, also urteilt das Tor ueber genau den.
  const text = indexInhalt(pfad);
  if (text === null) {
    uebersprungen.push(`${pfad} (nicht aus dem Index lesbar)`);
    continue;
  }
  // ⛔ `ignorePath` IST PFLICHT, und sein Fehlen war ein Tor ohne Ausweg (gemessen 2026-09-15,
  //    prettier 3.9.5): `getFileInfo` konsultiert `.prettierignore` NUR, wenn man den Pfad nennt.
  //    Ohne ihn meldet es fuer `apps/fachverfahren/src/docs/docs-manifest.generated.ts`
  //    `{ignored:false, inferredParser:"typescript"}` — der `uebersprungen`-Zweig darunter konnte
  //    also fuer KEINE Datei feuern. Die Folge ist schlimmer als ein blosser Fehlalarm: die genannte
  //    Abhilfe (`prettier --write <datei>`) tut fuer eine ignorierte Datei nachweislich NICHTS, und
  //    ein GENERIERTES Artefakt laesst sich ohnehin nur durch seinen Erzeuger aendern. Ein Halt,
  //    dessen Abhilfe keinen Ausfuehrer hat, ist die Klasse, die dieses Haus mehrfach bezahlt hat.
  const info = await prettier.getFileInfo(pfad, {
    resolveConfig: true,
    ignorePath: IGNORE_PFAD,
  });
  if (info.ignored || !info.inferredParser) {
    uebersprungen.push(
      `${pfad} (${info.ignored ? ".prettierignore" : "kein Parser"})`,
    );
    continue;
  }
  const konfig = (await prettier.resolveConfig(pfad)) ?? {};
  geprueft++;
  if (!(await prettier.check(text, { ...konfig, filepath: pfad })))
    schlecht.push(pfad);
}

// POSITIV-KONTROLLE AN DER MESSUNG: ein Commit, der nur Dateien ohne Parser traegt, ist legitim — aber
// «0 geprueft» darf nicht wie «alles sauber» aussehen. Die Zahl wird deshalb IMMER genannt.
console.log(
  `format:check — Umfang: ${pfade.length} gestagte Pfad(e), davon ${geprueft} mit Prettier geprueft` +
    (uebersprungen.length > 0
      ? ` · uebersprungen: ${uebersprungen.length}`
      : ""),
);

if (schlecht.length > 0) {
  console.error(`\n✗ ${schlecht.length} gestagte Datei(en) nicht formatiert:`);
  for (const p of schlecht) console.error(`  · ${p}`);
  console.error(
    "\nABHILFE: `pnpm exec prettier --write " +
      schlecht.join(" ") +
      "` und ERNEUT STAGEN" +
      " — der Index ist es, der geprueft wird.",
  );
  process.exit(1);
}
console.log("✓ alle gestagten Dateien folgen dem Prettier-Stil.");
