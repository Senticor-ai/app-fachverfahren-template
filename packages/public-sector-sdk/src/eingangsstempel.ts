// eingangsstempel — EINE ZEIT-WAHRHEIT: der SERVER vergibt Eingangszeitpunkt und Eingangsnummer.
//
// WURZEL DES DEFEKTS: bisher erzeugte der BROWSER die Vorgangsnummer und den Eingangszeitpunkt
// (fachverfahren-kit/store). Ein Eingangsnachweis, dessen Zeit von der Uhr des Antragstellers stammt,
// ist als Fristnachweis wertlos — und die Nummer war nach einem Neustart des Browsers neu vergeben.
// Muster ist der bereits richtig gebaute Rechtsbehelf: server-gestempelt, append-only, einmalig.
//
// GENERISCH: das FORMAT der Nummer ist Verfahrens-DATEN (`eingangsnummerFormat`), kein Domänen-Literal
// in der Engine. Ein Unternehmens-Fachverfahren deklariert `AUFTRAG-{jahr}-{kennung}` genauso wie eine
// Behörde `{verfahren}-{jahr}-{kennung}`.
//
// REIN: keine Uhr, kein Zufall im Modul — Zeit und Fall-Kennung kommen als Eingabe herein. Damit ist der
// Stempel testbar und im Audit reproduzierbar.

/** Das Default-Format, wenn ein Verfahren keines deklariert. Platzhalter siehe `formatiereEingangsnummer`. */
export const EINGANGSNUMMER_DEFAULT_FORMAT = "{verfahren}-{jahr}-{kennung}";

/** Ein kurzes, stabiles Kürzel aus einer Kennung (deterministisch, ohne Krypto-Abhängigkeit im reinen Kern). */
function kuerzel(quelle: string, laenge: number): string {
  // FNV-1a — klein, deterministisch, kollisionsarm genug für ein LESBARES Aktenzeichen. Die
  // EINDEUTIGKEIT trägt weiterhin die caseId (UUID); die Nummer ist die menschenlesbare Anzeige davon.
  let h = 0x811c9dc5;
  for (let i = 0; i < quelle.length; i++) {
    h ^= quelle.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(laenge, "0").slice(-laenge);
}

/** Verfahrens-Kürzel: die ersten Buchstaben/Ziffern der procedureId in Grossschreibung (generisch). */
function verfahrensKuerzel(procedureId: string): string {
  const alnum = procedureId.replace(/[^A-Za-z0-9]/g, "");
  return (alnum.slice(0, 3) || "VG").toUpperCase();
}

export interface EingangsnummerEingabe {
  /** Der Zeitpunkt des Eingangs (ISO, SERVER-Uhr). */
  eingangIso: string;
  /** Die server-vergebene Fall-Kennung — die Nummer ist ihre lesbare Projektion. */
  caseId: string;
  procedureId: string;
  /** Das vom VERFAHREN deklarierte Format (DATEN). Fehlt es, gilt `EINGANGSNUMMER_DEFAULT_FORMAT`. */
  format?: string;
}

/**
 * Formatiert die Eingangs-/Vorgangsnummer aus dem Verfahrens-Format.
 * Platzhalter: `{jahr}` `{monat}` `{tag}` `{verfahren}` `{kennung}`.
 * Unbekannte Platzhalter bleiben unverändert stehen (sichtbarer Konfigurationsfehler statt stiller Lücke).
 */
export function formatiereEingangsnummer(e: EingangsnummerEingabe): string {
  const d = new Date(e.eingangIso);
  const jahr = String(d.getUTCFullYear());
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  const tag = String(d.getUTCDate()).padStart(2, "0");
  const werte: Record<string, string> = {
    jahr,
    monat,
    tag,
    verfahren: verfahrensKuerzel(e.procedureId),
    kennung: kuerzel(e.caseId, 6),
  };
  const format = e.format ?? EINGANGSNUMMER_DEFAULT_FORMAT;
  return format.replace(/\{(\w+)\}/g, (treffer, name: string) =>
    Object.hasOwn(werte, name) ? (werte[name] as string) : treffer,
  );
}

/** Die Anlage, wie sie in der Eingangsbestätigung erscheint (Metadaten + Integritäts-Token). */
export interface EingangsbestaetigungAnlage {
  fileName: string;
  sizeBytes: number;
  checksumSha256: string;
}

/**
 * Der INHALT der Eingangsbestätigung — selbsttragend: was, wann, bei wem, mit welchen Anlagen, und der
 * Hash der eingereichten Daten. Der Bürger kann damit den Eingang gegen die Fall-Kette verifizieren.
 *
 * EHRLICHE GRENZE (bewusst als Feld, nicht als Prosa im PDF-Renderer): `nachweisArt` sagt, WAS dieser
 * Nachweis ist. Ein qualifizierter Zeitstempel (RFC 3161) ist eine offene NUTZER-Entscheidung — solange
 * er fehlt, steht hier `systemnachweis` und nichts anderes wird behauptet.
 */
export interface EingangsbestaetigungInhalt {
  eingangsnummer: string;
  aktenzeichen: string;
  verfahren: string;
  eingegangenAm: string;
  behoerde: string;
  datenSha256: string;
  anlagen: EingangsbestaetigungAnlage[];
  nachweisArt: "systemnachweis" | "qualifizierter-zeitstempel";
  kanal: string;
}
