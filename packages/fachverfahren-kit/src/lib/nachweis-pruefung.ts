// fachverfahren-kit/lib/nachweis-pruefung — die EINE, testbare Wahrheit über die ANNAHME-REGELN eines Nachweis-Uploads.
//
// Pur (kein React/DOM): leitet aus den DATEN-getriebenen Einschränkungen eines `Nachweis` (erlaubte Typen, maximale
// Größe) das native `accept`-Attribut, einen menschenlesbaren Einschränkungs-Text und eine deterministische
// FAIL-FAST-Vorprüfung einer gewählten Datei ab. WICHTIG: Diese Prüfung ist NIE autoritativ — sie gibt der
// Bürger:in nur eine sofortige, freundliche Rückmeldung, BEVOR die Datei über den Port an den Server geht. Der
// Server prüft Format/Größe/Virenscan verbindlich (server-autoritativ, siehe `NachweisUploadStatus` in DateiUpload).
// Alle Grenzwerte kommen als DATEN aus dem Verfahren/der Config — der Kit trägt KEINE Domänen-Literale.
import type { Nachweis } from "../types.js";
import { formatDateiGroesse } from "../format.js";

/** Grund-Kategorie einer Ablehnung (steuert Icon/Wording; der Klartext steht in der `meldung`). Kanonisch HIER
 *  definiert, damit die reine Vorprüfung UND die server-autoritative Statusanzeige (DateiUpload) dieselbe
 *  Kategorien-Wahrheit teilen. */
export type NachweisAblehnungsGrund =
  "format" | "groesse" | "virus" | "sonstiges";

/** Die Metadaten einer zu prüfenden Datei — nur was die reine Prüfung braucht (kein DOM-`File`). Der MIME-`typ`
 *  ist optional, weil manche Browser ihn leer lassen; dann greift die Endungs-Prüfung. */
export interface NachweisDateiMeta {
  name: string;
  groesse: number;
  typ?: string | undefined;
}

/** Das Ergebnis einer verletzten Einschränkung (null ⇒ Datei genügt den DATEN-Regeln bzw. es gibt keine Regeln). */
export interface NachweisPruefFehler {
  grund: NachweisAblehnungsGrund;
  meldung: string;
}

/** Baut das native `accept`-Attribut (kommagetrennt) aus `nachweis.akzeptierteTypen` — steuert im Datei-Dialog die
 *  vorausgewählten Typen. Fehlt die Liste (oder ist leer), gibt es kein `accept` (jeder Typ wählbar). */
export function nachweisAcceptAttribut(nachweis: Nachweis): string | undefined {
  // DIESELBE Normalform wie im Vergleich: ein `accept="pdf"` im DOM ignorieren Browser ebenso.
  const typen = nachweis.akzeptierteTypen
    ?.map((t) => normalisiereToken(t))
    .filter(Boolean);
  return typen && typen.length > 0 ? typen.join(",") : undefined;
}

/** Menschenlesbarer Hinweis auf die geltenden Einschränkungen (z. B. „Erlaubt: PDF, JPG · max. 10 MB"), damit die
 *  Bürger:in die Regeln VOR der Auswahl kennt. Rein aus DATEN; gibt `undefined`, wenn keine Einschränkung gesetzt ist. */
export function nachweisEinschraenkungenText(
  nachweis: Nachweis,
): string | undefined {
  const teile: string[] = [];
  const typen = nachweis.akzeptierteTypen?.map((t) => t.trim()).filter(Boolean);
  if (typen && typen.length > 0) {
    teile.push(`Erlaubt: ${typen.map(typLabel).join(", ")}`);
  }
  if (
    typeof nachweis.maxGroesseBytes === "number" &&
    nachweis.maxGroesseBytes > 0
  ) {
    teile.push(`max. ${formatDateiGroesse(nachweis.maxGroesseBytes)}`);
  }
  return teile.length > 0 ? teile.join(" · ") : undefined;
}

/** Kurz-Label für einen accept-Token in der Anzeige: „application/pdf" → „PDF", „image/*" → „Bilder", „.pdf" → „PDF". */
function typLabel(token: string): string {
  const t = token.toLowerCase();
  if (t === "image/*") return "Bilder";
  if (t === "application/pdf" || t === ".pdf") return "PDF";
  if (t.startsWith(".")) return t.slice(1).toUpperCase();
  const sub = t.split("/")[1];
  if (!sub || sub === "*") {
    const haupt = t.split("/")[0];
    return haupt ? haupt.toUpperCase() : token;
  }
  // "image/png" → "PNG", "application/vnd.…" → letzter sinnvoller Teil groß
  const kern = sub.split(/[.+]/).pop() ?? sub;
  return kern.toUpperCase();
}

/**
 * EIN BLOSSER ENDUNGS-TOKEN IST KEIN accept-TOKEN — und er trifft NICHTS.
 *
 * ⛔ LIVE GEMESSEN (2026-09-14, erzeugtes Verfahren `schuelerfahrtkosten`, Buergerstrecke ueber die
 * eigene Oberflaeche): die erzeugte `leistung.config.ts` deklariert `akzeptierteTypen: ['pdf']` — ohne
 * Punkt. `tokenTrifft` faellt damit in den letzten Zweig und vergleicht `mime === "pdf"`; KEIN Browser
 * meldet je diesen MIME-Typ. Folge: eine gueltige PDF wurde abgewiesen, die zwei ERFORDERLICHEN
 * Nachweise (Schulbescheinigung · Fahrkarte) liessen sich nicht anhaengen, und der Antrag war
 * strukturell nicht absendbar. Die Buergerstrecke endete an ihrem letzten Schritt.
 *
 * ⭐ UND DIE ZWEITE WAHRHEIT STAND IN DERSELBEN DATEI: `typLabel("pdf")` liefert "PDF" (kein "/", also
 * gewinnt der ganze Token). Die Meldung lautete deshalb woertlich «Dieses Dateiformat ist nicht
 * zulaessig. Erlaubt: PDF.» — ueber einer PDF. Ein Etikett, das den Token versteht, neben einem
 * Vergleich, der ihn nicht versteht.
 *
 * ⚠️ DAS IST KEINE LOCKERUNG, sondern die Aufloesung dieser zwei Wahrheiten: der Token traf bisher die
 * LEERE MENGE. Er kann also nur weiter werden — und er wird genau so weit, wie sein eigenes Etikett es
 * seit jeher behauptet. Normalisiert wird ausschliesslich die reine Endungsform (`pdf`, `jpg`): kein
 * Punkt, kein `/`, nur Buchstaben und Ziffern. Alles andere bleibt unberuehrt.
 */
function normalisiereToken(token: string): string {
  const t = token.trim().toLowerCase();
  if (!t || t.startsWith(".") || t.includes("/")) return t;
  return /^[a-z0-9]+$/.test(t) ? `.${t}` : t;
}

/** Passt der MIME-Typ / die Endung der Datei zu EINEM accept-Token? (Standard-`accept`-Semantik). */
function tokenTrifft(token: string, datei: NachweisDateiMeta): boolean {
  const t = normalisiereToken(token);
  if (t === "") return true;
  const mime = (datei.typ ?? "").toLowerCase();
  const name = datei.name.toLowerCase();
  if (t.startsWith(".")) return name.endsWith(t); // Endung
  if (t.endsWith("/*")) return mime.startsWith(t.slice(0, -1)); // "image/*" → "image/"
  return mime !== "" && mime === t; // exakter MIME (nur wenn der Browser einen liefert)
}

/**
 * FAIL-FAST-Vorprüfung einer gewählten Datei gegen die DATEN-Einschränkungen des Nachweises (Typ, Größe).
 * Rein + deterministisch. Gibt den ERSTEN verletzten Grund zurück, sonst `null`. NIE autoritativ: der Server
 * bleibt die verbindliche Instanz (Format/Größe/Virenscan) — diese Funktion verhindert nur den offensichtlich
 * aussichtslosen Upload und erklärt der Nutzer:in sofort, warum.
 */
export function pruefeNachweisDatei(
  nachweis: Nachweis,
  datei: NachweisDateiMeta,
): NachweisPruefFehler | null {
  const typen = nachweis.akzeptierteTypen?.map((t) => t.trim()).filter(Boolean);
  if (typen && typen.length > 0 && !typen.some((t) => tokenTrifft(t, datei))) {
    return {
      grund: "format",
      meldung: `Dieses Dateiformat ist nicht zulässig. Erlaubt: ${typen
        .map(typLabel)
        .join(", ")}.`,
    };
  }
  const max = nachweis.maxGroesseBytes;
  if (typeof max === "number" && max > 0 && datei.groesse > max) {
    return {
      grund: "groesse",
      meldung: `Die Datei ist zu groß (${formatDateiGroesse(
        datei.groesse,
      )}). Zulässig sind höchstens ${formatDateiGroesse(max)}.`,
    };
  }
  return null;
}
