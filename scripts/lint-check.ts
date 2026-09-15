/**
 * LINT AM UMFANG DES COMMITS — dieselbe Entscheidung wie beim Format-Tor, derselbe Umfangs-Begriff.
 *
 * ⛔ WARUM ES BEIDE BRAUCHT: nach dem Prettier-Schnitt fiel der Commit ERNEUT — am `eslint .`, das
 * dieselben fremden, ungestagten Dateien ueber die `prettier/prettier`-Regel traf. Ein Tor zu verengen und
 * das Geschwister-Tor stehen zu lassen, heilt nichts: der Commit bleibt unerfuellbar, nur eine Zeile
 * spaeter. Beide fragen jetzt `commit-umfang.ts`.
 *
 * ⭐ DER INHALT KOMMT AUS DEM INDEX (`lintText` mit `filePath`), wie beim Format-Tor — damit beide ueber
 * DENSELBEN Baum urteilen. Ein Umfang, zwei Inhalte waeren wieder zwei Wahrheiten.
 *
 * ⚠️ WARNUNGEN BLOCKEN NICHT, und das ist kein Nachgeben: `eslint .` verhielt sich schon vorher so
 * (Exit 1 nur bei `errorCount`). Dieser Schnitt aendert den UMFANG, nie die Haerte.
 */
import { ESLint } from "eslint";
import {
  gestagteDateien,
  indexInhalt,
  vollerBaumErzwungen,
} from "./commit-umfang.ts";

const eslint = new ESLint();
const voll = vollerBaumErzwungen();
const pfade = voll ? [] : gestagteDateien();

const melde = async (
  ergebnisse: ESLint.LintResult[],
  umfang: string,
): Promise<never> => {
  const fehler = ergebnisse.reduce((n, r) => n + r.errorCount, 0);
  const warnungen = ergebnisse.reduce((n, r) => n + r.warningCount, 0);
  // DIE ZAHL WIRD IMMER GENANNT, auch wenn sie 0 ist: «0 geprueft» darf nie wie «alles sauber» aussehen.
  console.log(
    `lint — ${umfang} · ${ergebnisse.length} Datei(en) · ${fehler} Fehler · ${warnungen} Warnung(en)`,
  );
  if (fehler > 0) {
    const formatter = await eslint.loadFormatter("stylish");
    console.error(
      await formatter.format(ergebnisse.filter((r) => r.errorCount > 0)),
    );
    console.error(
      "ABHILFE: `pnpm exec eslint --fix <pfad>` und ERNEUT STAGEN — der Index ist es, der geprueft wird.",
    );
    process.exit(1);
  }
  process.exit(0);
};

if (pfade.length === 0) {
  await melde(
    await eslint.lintFiles(["."]),
    voll
      ? "LINT_CHECK_FULL=1, ganzer Baum"
      : "nichts im Index, also kein Commit im Gange: ganzer Baum",
  );
}

const ergebnisse: ESLint.LintResult[] = [];
const uebersprungen: string[] = [];
for (const pfad of pfade) {
  if (await eslint.isPathIgnored(pfad)) {
    uebersprungen.push(`${pfad} (eslint-ignoriert)`);
    continue;
  }
  const text = indexInhalt(pfad);
  if (text === null) {
    uebersprungen.push(`${pfad} (nicht aus dem Index lesbar)`);
    continue;
  }
  ergebnisse.push(...(await eslint.lintText(text, { filePath: pfad })));
}
await melde(
  ergebnisse,
  `Umfang: ${pfade.length} gestagte Pfad(e)` +
    (uebersprungen.length > 0
      ? ` · uebersprungen ${uebersprungen.length}`
      : ""),
);
