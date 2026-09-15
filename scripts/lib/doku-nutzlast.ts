// doku-nutzlast — Dokumentation ist kein Code, und kein Quell-Gate darf sie als Code lesen.
//
// DER BEFUND (2026-07-27, zwei Gates in derselben Minute): `apps/fachverfahren/src/docs/docs-manifest.generated.ts`
// ist kein Quelltext, sondern ein KORPUS: ganze Markdown-Dateien, escaped als JSON-String hinter `"content":`.
// Dort steht `var(--foreground)`, weil der Text die Token-Regel ERKLAERT, und `animate-bounce`, weil der Text die
// Motion-Regel ERKLAERT. Der CSS-Gate meldete 6 Verstoesse, der Motion-Gate 3 — alle waren die Regeln selbst,
// zitiert in ihrer eigenen Dokumentation. Zusammen blockierten sie JEDEN Commit im Repo, unabhaengig vom Inhalt.
//
// WARUM EIN GETEILTES MODUL UND NICHT ZWEI FIXES: es waren nicht zwei Vorfaelle, sondern EINE Klasse — jeder
// zeilenweise Gate ueber `apps/**/*.ts` faellt darauf herein, sobald der Korpus das Muster erwaehnt. Der naechste
// Gate (Lexik, Sprach-Level, verbotene Begriffe) wuerde es wieder tun. Die Antwort gehoert an EINE Stelle.
//
// WAS DAS AUSDRUECKLICH NICHT IST: ein Ausschluss der DATEI. Nur die Nutzlast-ZEILE faellt weg. Haette dieselbe
// Datei irgendwo echtes Styling oder echte Motion-Klassen, wuerde beides weiterhin gefunden. Eine Doku-Zeile wird
// als Text gerendert, nie als CSS und nie als Klassen-Attribut — dort kann sich kein Verstoss verbergen, den ein
// Quell-Gate finden koennte.

/**
 * Ist diese Zeile die Nutzlast eines Dokumentations-Korpus?
 *
 * Am ZEILENANFANG verankert mit Absicht: so steht der Schluessel im pretty-printed JSON des Emitters. Eine Zeile,
 * die `"content":` irgendwo in der Mitte fuehrt (echter Quelltext, der ein Objekt-Literal baut), wird NICHT
 * uebersprungen — das waere ein Schlupfloch, das sich jeder Code selbst oeffnen koennte.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function istDokumentationsNutzlast(line: string): boolean {
  return /^\s*"content":\s*"/.test(line);
}

/**
 * Blendet die Dokumentations-Nutzlast aus einem Datei-Inhalt aus — ZEILENZAHL BLEIBT ERHALTEN.
 *
 * Fuer Gates, die ueber den ganzen Text zaehlen statt Zeile fuer Zeile zu pruefen. Ausgeblendete Zeilen werden
 * zu Leerzeilen, damit jede gemeldete Zeilennummer weiterhin auf die echte Stelle in der Datei zeigt.
 *
 * @param {string} text
 * @returns {string}
 */
export function ohneDokumentationsNutzlast(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (istDokumentationsNutzlast(line) ? "" : line))
    .join("\n");
}
