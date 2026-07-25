// anlagen-pruefung — die TÜRSTEHER-Prüfung für Anlagen: eine Datei wird abgewiesen, BEVOR irgendein
// Agent, Renderer oder Mensch sie liest.
//
// WARUM DIE DEKLARATION NICHT REICHT: der Client sendet `mimeType` selbst. Wer `text/html` als
// `application/pdf` deklariert, konnte die Datei bisher hochladen UND als Datei zurückholen — ein
// gespeicherter Inhalts-Vektor (Stored XSS) über das Bürgerportal. Deshalb prüft der Server die ersten
// Bytes (Magic Bytes) gegen die DEKLARATION: Abweichung ⇒ Abweisung, nicht Korrektur.
//
// GENERISCH: die erlaubten Typen sind DATEN (Verfahren/Governance), kein Literal im Aufrufer. Der
// Default deckt die drei Nachweis-Formate ab, die eine Verwaltung tatsächlich annimmt.
//
// EHRLICH: das ist eine TYP-Prüfung, KEIN Virenscan. Ein Virenscanner ist ein Adapter-Port und eine
// offene NUTZER-Entscheidung — bis er konfiguriert ist, wird das nirgends als grünes Häkchen behauptet.
//
// REIN: kein Date/Random/DOM/node — deterministisch aus Bytes + Deklaration.

/** Ein erlaubter Anlagen-Typ: MIME + Endungen + die Byte-Signatur(en), an denen er erkennbar ist. */
export interface AnlagenTyp {
  mimeType: string;
  endungen: readonly string[];
  /** Byte-Präfixe (hex-Paare); leer = nicht an Magic Bytes erkennbar (dann greift nur die Allowlist). */
  signaturen: readonly (readonly number[])[];
}

/** Der Default-Katalog erlaubter Anlagen. Als DATEN überschreibbar (Verfahren deklariert seine Typen). */
export const ANLAGEN_TYPEN_DEFAULT: readonly AnlagenTyp[] = [
  {
    mimeType: "application/pdf",
    endungen: ["pdf"],
    signaturen: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  },
  {
    mimeType: "image/png",
    endungen: ["png"],
    signaturen: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  },
  {
    mimeType: "image/jpeg",
    endungen: ["jpg", "jpeg"],
    signaturen: [[0xff, 0xd8, 0xff]],
  },
];

/** Die Regeln, unter denen eine Anlage angenommen wird — vollständig DATEN. */
export interface AnlagenRegeln {
  typen: readonly AnlagenTyp[];
  /** Maximalgröße einer einzelnen Anlage in Bytes. */
  maxBytes: number;
  /** Maximale Anzahl Anlagen je Vorgang. */
  maxAnzahl: number;
}

export const ANLAGEN_REGELN_DEFAULT: AnlagenRegeln = {
  typen: ANLAGEN_TYPEN_DEFAULT,
  maxBytes: 10_000_000,
  maxAnzahl: 20,
};

/** Warum eine Anlage abgewiesen wurde — maschinenlesbar; der Aufrufer mappt auf HTTP-Status + Klartext. */
export type AnlagenAblehnung =
  | { grund: "leer" }
  | { grund: "zu-gross"; maxBytes: number }
  | { grund: "zu-viele"; maxAnzahl: number }
  | { grund: "typ-nicht-erlaubt"; erlaubt: readonly string[] }
  | { grund: "inhalt-passt-nicht-zur-deklaration" }
  | { grund: "dateiname-unzulaessig" };

export type AnlagenPruefung =
  | { ok: true; fileName: string; mimeType: string }
  | { ok: false; ablehnung: AnlagenAblehnung };

// eslint-disable-next-line no-control-regex
const STEUERZEICHEN = /[\u0000-\u001F\u007F]/g;

/**
 * Bereinigt einen hochgeladenen Dateinamen: nur Basisname, keine Pfad-Anteile, keine Steuerzeichen.
 * Gibt `undefined`, wenn danach nichts Brauchbares übrig bleibt (dann: abweisen, nicht raten).
 */
export function bereinigeDateinamen(roh: string): string | undefined {
  const nurBasis = roh.split(/[/\\]/).pop() ?? "";
  const sauber = nurBasis
    .replace(STEUERZEICHEN, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200);
  return sauber.length > 0 ? sauber : undefined;
}

function endungVon(fileName: string): string {
  const punkt = fileName.lastIndexOf(".");
  return punkt > 0 ? fileName.slice(punkt + 1).toLowerCase() : "";
}

function beginntMit(bytes: Uint8Array, signatur: readonly number[]): boolean {
  if (bytes.length < signatur.length) return false;
  return signatur.every((b, i) => bytes[i] === b);
}

/**
 * DIE Türsteher-Prüfung. Reihenfolge ist Absicht: leer → Größe → Anzahl → Name → Typ-Allowlist →
 * Inhalt-gegen-Deklaration. Die teuerste Prüfung zuletzt.
 */
export function pruefeAnlage(
  eingabe: {
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
    /** Wie viele Anlagen der Vorgang bereits trägt. */
    bereitsVorhanden: number;
  },
  regeln: AnlagenRegeln = ANLAGEN_REGELN_DEFAULT,
): AnlagenPruefung {
  if (eingabe.bytes.byteLength === 0)
    return { ok: false, ablehnung: { grund: "leer" } };
  if (eingabe.bytes.byteLength > regeln.maxBytes)
    return {
      ok: false,
      ablehnung: { grund: "zu-gross", maxBytes: regeln.maxBytes },
    };
  if (eingabe.bereitsVorhanden >= regeln.maxAnzahl)
    return {
      ok: false,
      ablehnung: { grund: "zu-viele", maxAnzahl: regeln.maxAnzahl },
    };

  const fileName = bereinigeDateinamen(eingabe.fileName);
  if (!fileName)
    return { ok: false, ablehnung: { grund: "dateiname-unzulaessig" } };

  // MIME normalisieren: Parameter (`; charset=…`) und Groß-/Kleinschreibung dürfen die Allowlist nicht umgehen.
  const mimeType = (eingabe.mimeType.split(";")[0] ?? "").trim().toLowerCase();
  const typ = regeln.typen.find((t) => t.mimeType === mimeType);
  if (!typ)
    return {
      ok: false,
      ablehnung: {
        grund: "typ-nicht-erlaubt",
        erlaubt: regeln.typen.map((t) => t.mimeType),
      },
    };

  // Endung muss zur Deklaration passen (sonst „rechnung.pdf.html"-Verwirrung im Download).
  const endung = endungVon(fileName);
  if (endung && !typ.endungen.includes(endung))
    return { ok: false, ablehnung: { grund: "inhalt-passt-nicht-zur-deklaration" } };

  // DER KERN: die BYTES müssen die Deklaration bestätigen.
  if (typ.signaturen.length > 0) {
    const passt = typ.signaturen.some((s) => beginntMit(eingabe.bytes, s));
    if (!passt)
      return {
        ok: false,
        ablehnung: { grund: "inhalt-passt-nicht-zur-deklaration" },
      };
  }
  return { ok: true, fileName, mimeType };
}

/**
 * Der MIME-Typ, unter dem eine Anlage AUSGELIEFERT wird. Bewusst NICHT der gespeicherte Typ als
 * Vertrauensanker: nur ein Typ aus der Allowlist wird zurückgegeben, alles andere fällt auf
 * `application/octet-stream`. Zusammen mit `Content-Disposition: attachment` + `X-Content-Type-Options:
 * nosniff` kann eine Anlage nie im Browser-Kontext der Anwendung ausgeführt werden.
 */
export function auslieferungsMimeTyp(
  gespeichert: string,
  regeln: AnlagenRegeln = ANLAGEN_REGELN_DEFAULT,
): string {
  const mime = (gespeichert.split(";")[0] ?? "").trim().toLowerCase();
  return regeln.typen.some((t) => t.mimeType === mime)
    ? mime
    : "application/octet-stream";
}
